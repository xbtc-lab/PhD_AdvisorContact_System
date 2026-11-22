import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { sanitizeFilename, type AttachmentCategory } from "@app/shared";
import { db, eq, firstOrNull, getResumesDir, LOCAL_USER_ID, schema } from "@app/db";

/**
 * 轻量零依赖 PDF 文本启发式提取器：抽取 PDF 文本流中的可读字符以辅助 AI 理解简历要点。
 */
export function extractBasicPdfText(pdfBytes: Buffer): string {
  try {
    const raw = pdfBytes.toString("latin1");
    const chunks: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(raw)) !== null) {
      let streamStr = match[1];
      if (streamStr.length > 0 && streamStr.charCodeAt(0) === 0x78) {
        try {
          const buf = zlib.inflateSync(Buffer.from(streamStr, "latin1"));
          streamStr = buf.toString("latin1");
        } catch {
          // 非压缩文本流
        }
      }
      const textTokens = streamStr.match(/\(([^()\\]{2,200})\)\s*Tj/g);
      if (textTokens) {
        for (const tok of textTokens) {
          const inner = tok.slice(1, tok.lastIndexOf(")"));
          const cleaned = inner.replace(/[^\x20-\x7E\u4e00-\u9fa5]/g, " ").trim();
          if (cleaned.length >= 2) chunks.push(cleaned);
        }
      }
      if (chunks.join(" ").length > 4000) break;
    }
    return chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 4000);
  } catch {
    return "";
  }
}

type DetectedFormat = "pdf" | "png" | "jpg" | "webp" | null;

/**
 * 通过文件头魔数检测上传文件真实格式，防止后缀伪造。
 */
function detectFileFormat(bytes: Buffer): DetectedFormat {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "%PDF") {
    return "pdf";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function saveUploadedResume(params: {
  filename: string;
  base64Content: string;
  setAsDefault?: boolean;
  category?: AttachmentCategory;
  tagNote?: string;
}) {
  const category: AttachmentCategory = params.category || "resume";
  const allowImages = category === "wechat_qr" || category === "certificate";
  const defaultBaseName = category === "wechat_qr" ? "wechat_qr.png" : "resume.pdf";
  let cleanName = sanitizeFilename(params.filename || defaultBaseName);

  const bytes = Buffer.from(params.base64Content, "base64");
  const fmt = detectFileFormat(bytes);

  if (!fmt) {
    throw new Error(
      allowImages
        ? "请上传有效的 PNG、JPG、WEBP 图片或 PDF 文件"
        : "请上传有效的 PDF 格式文件"
    );
  }
  if (!allowImages && fmt !== "pdf") {
    throw new Error("简历与成绩单仅支持标准 PDF 格式文件");
  }
  if (category === "wechat_qr" && fmt === "pdf") {
    throw new Error("微信二维码请上传 PNG、JPG 或 WEBP 图片");
  }

  const expectedExt = `.${fmt === "jpg" ? "jpg" : fmt}`;
  if (!cleanName.toLowerCase().endsWith(expectedExt)) {
    const baseWithoutExt = cleanName.replace(/\.[^.]+$/, "");
    cleanName = `${baseWithoutExt || "attachment"}${expectedExt}`;
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const resumesDir = getResumesDir();
  const storedName = `${sha256.slice(0, 10)}_${cleanName}`;
  const targetPath = path.join(resumesDir, storedName);

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, bytes);
  }

  const parsedText = fmt === "pdf" ? extractBasicPdfText(bytes) : "";
  const now = new Date().toISOString();
  const resumeId = crypto.randomUUID();
  const effectiveDefault = category === "resume" ? Boolean(params.setAsDefault) : false;

  if (effectiveDefault) {
    await db
      .update(schema.resumes)
      .set({ isDefault: false })
      .where(eq(schema.resumes.userId, LOCAL_USER_ID));
  }

  await db.insert(schema.resumes).values({
    id: resumeId,
    userId: LOCAL_USER_ID,
    filename: cleanName,
    storagePath: targetPath,
    sizeBytes: bytes.length,
    sha256,
    parsedText,
    isDefault: effectiveDefault,
    category,
    tagNote: (params.tagNote || "").trim(),
    createdAt: now,
  });

  if (effectiveDefault) {
    const settings = await firstOrNull(
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .limit(1)
    );
    if (settings) {
      await db
        .update(schema.appSettings)
        .set({
          preferences: {
            ...settings.preferences,
            defaultResumeId: resumeId,
          },
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));
    }
    if (parsedText) {
      await db
        .update(schema.applicantProfiles)
        .set({ cvParsedText: parsedText, updatedAt: now })
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID));
    }
  } else if (category === "wechat_qr") {
    // 若上传微信二维码图片，同步记录最新附件查看路径到个人履历
    await db
      .update(schema.applicantProfiles)
      .set({ wechatQrPath: `/api/resumes/${resumeId}/view`, updatedAt: now })
      .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID));
  }

  return {
    id: resumeId,
    filename: cleanName,
    sizeBytes: bytes.length,
    sizeMb: Number((bytes.length / (1024 * 1024)).toFixed(2)),
    sha256,
    parsedText,
    isDefault: effectiveDefault,
    category,
    tagNote: (params.tagNote || "").trim(),
    createdAt: now,
  };
}
