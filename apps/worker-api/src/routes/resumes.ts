import fs from "node:fs";
import { Hono } from "hono";
import { AttachmentCategorySchema, type AttachmentCategory } from "@app/shared";
import { db, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import { inferMimeType } from "../helpers/domain.js";
import { saveUploadedResume } from "../services/resume-storage.js";

/**
 * 履历附件库路由：管理个人主简历 PDF、本硕成绩单、微信二维码图片及获奖证明材料。
 */
export function createResumeRoutes() {
  const router = new Hono();

  router.post("/api/resumes", async (c) => {
    try {
      const body = (await c.req.json()) as {
        filename?: string;
        contentBase64?: string;
        setAsDefault?: boolean;
        advisorId?: string;
        category?: string;
        tagNote?: string;
      };
      const catParsed = AttachmentCategorySchema.safeParse(body.category || "resume");
      const category: AttachmentCategory = catParsed.success ? catParsed.data : "resume";

      const resume = await saveUploadedResume({
        filename: body.filename || (category === "wechat_qr" ? "wechat_qr.png" : "resume.pdf"),
        base64Content: body.contentBase64 || "",
        setAsDefault: body.setAsDefault,
        category,
        tagNote: body.tagNote,
      });

      if (body.advisorId && category === "resume") {
        await db
          .update(schema.outreachDrafts)
          .set({ resumeId: resume.id, updatedAt: new Date().toISOString() })
          .where(eq(schema.outreachDrafts.advisorId, body.advisorId));
      }
      return c.json({ ok: true, resume });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "上传附件失败" },
        400
      );
    }
  });

  router.get("/api/resumes/:id/view", async (c) => {
    const id = c.req.param("id");
    const row = await firstOrNull(
      db.select().from(schema.resumes).where(eq(schema.resumes.id, id)).limit(1)
    );
    if (!row || !fs.existsSync(row.storagePath)) {
      return c.text("File not found", 404);
    }
    const bytes = fs.readFileSync(row.storagePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": inferMimeType(row.filename),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Cache-Control": "no-store",
      },
    });
  });

  router.patch("/api/resumes/:id/default", async (c) => {
    const id = c.req.param("id");
    const row = await firstOrNull(
      db.select().from(schema.resumes).where(eq(schema.resumes.id, id)).limit(1)
    );
    if (!row) return c.json({ ok: false, error: "简历不存在" }, 404);

    const now = new Date().toISOString();
    await db
      .update(schema.resumes)
      .set({ isDefault: false })
      .where(eq(schema.resumes.userId, LOCAL_USER_ID));
    await db
      .update(schema.resumes)
      .set({ isDefault: true })
      .where(eq(schema.resumes.id, id));

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
          preferences: { ...settings.preferences, defaultResumeId: id },
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));
    }
    return c.json({ ok: true });
  });

  router.delete("/api/resumes/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.resumes).where(eq(schema.resumes.id, id));
    return c.json({ ok: true });
  });

  return router;
}
