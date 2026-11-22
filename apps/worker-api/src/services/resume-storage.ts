import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { sanitizeFilename } from "@app/shared";
import { db, eq, getResumesDir, LOCAL_USER_ID, schema } from "@app/db";

/**
 * Lightweight zero-dependency PDF text heuristic extractor.
 * Extracts plain ASCII/UTF-16 strings inside PDF text streams as a helpful context hint for AI.
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
          // non-flate stream
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

export async function saveUploadedResume(params: {
  filename: string;
  base64Content: string;
  setAsDefault?: boolean;
}) {
  let cleanName = sanitizeFilename(params.filename || "resume.pdf");
  if (!cleanName.toLowerCase().endsWith(".pdf")) {
    cleanName += ".pdf";
  }
  const bytes = Buffer.from(params.base64Content, "base64");
  if (bytes.length < 10 || bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
    throw new Error("请上传有效的 PDF 格式文件");
  }

  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const resumesDir = getResumesDir();
  const storedName = `${sha256.slice(0, 10)}_${cleanName}`;
  const targetPath = path.join(resumesDir, storedName);

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, bytes);
  }

  const parsedText = extractBasicPdfText(bytes);
  const now = new Date().toISOString();
  const resumeId = crypto.randomUUID();

  if (params.setAsDefault) {
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
    isDefault: Boolean(params.setAsDefault),
    createdAt: now,
  });

  if (params.setAsDefault) {
    const settings = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .get();
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
  }

  return {
    id: resumeId,
    filename: cleanName,
    sizeBytes: bytes.length,
    sizeMb: Number((bytes.length / (1024 * 1024)).toFixed(2)),
    sha256,
    parsedText,
    isDefault: Boolean(params.setAsDefault),
    createdAt: now,
  };
}
