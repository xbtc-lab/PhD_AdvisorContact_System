import crypto from "node:crypto";
import { Hono } from "hono";
import { SaveDraftInputSchema } from "@app/shared";
import { db, desc, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import { toAdvisorDto } from "../helpers/domain.js";
import { generateAcademicTemplateDraft } from "../services/template-draft.js";

/**
 * 套磁信草稿、修订快照回滚与模板生成路由。
 */
export function createDraftRoutes() {
  const router = new Hono();

  router.get("/api/advisors/:id/draft", async (c) => {
    const advisorId = c.req.param("id");
    let draft = await firstOrNull(
      db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.advisorId, advisorId))
        .limit(1)
    );
    if (!draft) {
      const now = new Date().toISOString();
      draft = {
        id: crypto.randomUUID(),
        advisorId,
        subject: "",
        body: "",
        selectedHook: "",
        resumeId: null,
        preferredAccountId: "auto",
        templateStyle: "editorial",
        embedContactCard: true,
        updatedAt: now,
      };
      await db.insert(schema.outreachDrafts).values(draft);
    }
    const revisions = await db
      .select()
      .from(schema.draftRevisions)
      .where(eq(schema.draftRevisions.draftId, draft.id))
      .orderBy(desc(schema.draftRevisions.createdAt))
      .limit(20);

    return c.json({ ok: true, draft, revisions });
  });

  router.put("/api/advisors/:id/draft", async (c) => {
    try {
      const advisorId = c.req.param("id");
      const input = SaveDraftInputSchema.parse(await c.req.json());
      const now = new Date().toISOString();

      let draft = await firstOrNull(
        db
          .select()
          .from(schema.outreachDrafts)
          .where(eq(schema.outreachDrafts.advisorId, advisorId))
          .limit(1)
      );

      if (!draft) {
        draft = {
          id: crypto.randomUUID(),
          advisorId,
          subject: input.subject,
          body: input.body,
          selectedHook: input.selectedHook || "",
          resumeId: input.resumeId ?? null,
          preferredAccountId: input.preferredAccountId || "auto",
          templateStyle: input.templateStyle || "editorial",
          embedContactCard: input.embedContactCard ?? true,
          updatedAt: now,
        };
        await db.insert(schema.outreachDrafts).values(draft);
      } else {
        if (input.createRevision && (draft.body.trim() || draft.subject.trim())) {
          await db.insert(schema.draftRevisions).values({
            id: crypto.randomUUID(),
            draftId: draft.id,
            subject: draft.subject,
            body: draft.body,
            source: input.revisionSource,
            note: input.revisionNote,
            createdAt: now,
          });
        }

        await db
          .update(schema.outreachDrafts)
          .set({
            subject: input.subject,
            body: input.body,
            ...(input.selectedHook !== undefined ? { selectedHook: input.selectedHook } : {}),
            ...(input.resumeId !== undefined ? { resumeId: input.resumeId } : {}),
            ...(input.preferredAccountId !== undefined
              ? { preferredAccountId: input.preferredAccountId }
              : {}),
            ...(input.templateStyle !== undefined ? { templateStyle: input.templateStyle } : {}),
            ...(input.embedContactCard !== undefined
              ? { embedContactCard: input.embedContactCard }
              : {}),
            updatedAt: now,
          })
          .where(eq(schema.outreachDrafts.id, draft.id));
      }

      const fresh = await firstOrNull(
        db
          .select()
          .from(schema.outreachDrafts)
          .where(eq(schema.outreachDrafts.advisorId, advisorId))
          .limit(1)
      );
      const revisions = await db
        .select()
        .from(schema.draftRevisions)
        .where(eq(schema.draftRevisions.draftId, fresh!.id))
        .orderBy(desc(schema.draftRevisions.createdAt))
        .limit(20);

      return c.json({ ok: true, draft: fresh, revisions });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "保存草稿失败" },
        400
      );
    }
  });

  router.post("/api/advisors/:id/draft/generate", async (c) => {
    const advisorId = c.req.param("id");
    const advisorRow = await firstOrNull(
      db.select().from(schema.advisors).where(eq(schema.advisors.id, advisorId)).limit(1)
    );
    if (!advisorRow) return c.json({ ok: false, error: "导师不存在" }, 404);

    const inst = await firstOrNull(
      db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.id, advisorRow.institutionId))
        .limit(1)
    );
    const profileRow = await firstOrNull(
      db
        .select()
        .from(schema.applicantProfiles)
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
        .limit(1)
    );

    const bodyJson = (await c.req.json().catch(() => ({}))) as { hookNote?: string };
    const advDto = toAdvisorDto(advisorRow, inst?.name || "");
    if (bodyJson.hookNote !== undefined) advDto.hookNote = bodyJson.hookNote;

    const generated = generateAcademicTemplateDraft(
      {
        name: profileRow?.name || "",
        affiliation: profileRow?.affiliation || "",
        degreeInfo: profileRow?.degreeInfo || "",
        researchSummary: profileRow?.researchSummary || "",
        phone: profileRow?.phone || "",
        wechat: profileRow?.wechat || "",
        homepageUrl: profileRow?.homepageUrl || "",
        publications: profileRow?.publications || [],
        projects: profileRow?.projects || [],
        methodsSkills: profileRow?.methodsSkills || [],
        targetDirections: profileRow?.targetDirections || [],
        cvParsedText: profileRow?.cvParsedText || "",
        educationHistory: profileRow?.educationHistory || [],
        languageScores: profileRow?.languageScores || "",
        competitions: profileRow?.competitions || [],
        honors: profileRow?.honors || [],
        wechatQrPath: profileRow?.wechatQrPath || "",
      },
      advDto
    );

    return c.json({ ok: true, ...generated });
  });

  router.post("/api/advisors/:id/draft/revisions/:revId/restore", async (c) => {
    const advisorId = c.req.param("id");
    const revId = c.req.param("revId");
    const draft = await firstOrNull(
      db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.advisorId, advisorId))
        .limit(1)
    );
    const rev = await firstOrNull(
      db.select().from(schema.draftRevisions).where(eq(schema.draftRevisions.id, revId)).limit(1)
    );
    if (!draft || !rev || rev.draftId !== draft.id) {
      return c.json({ ok: false, error: "版本快照不存在" }, 404);
    }

    const now = new Date().toISOString();
    if (draft.body.trim() || draft.subject.trim()) {
      await db.insert(schema.draftRevisions).values({
        id: crypto.randomUUID(),
        draftId: draft.id,
        subject: draft.subject,
        body: draft.body,
        source: "restore",
        note: "回滚前自动备份",
        createdAt: now,
      });
    }

    await db
      .update(schema.outreachDrafts)
      .set({ subject: rev.subject, body: rev.body, updatedAt: now })
      .where(eq(schema.outreachDrafts.id, draft.id));

    const fresh = await firstOrNull(
      db.select().from(schema.outreachDrafts).where(eq(schema.outreachDrafts.id, draft.id)).limit(1)
    );
    const revisions = await db
      .select()
      .from(schema.draftRevisions)
      .where(eq(schema.draftRevisions.draftId, draft.id))
      .orderBy(desc(schema.draftRevisions.createdAt))
      .limit(20);

    return c.json({ ok: true, draft: fresh, revisions });
  });

  return router;
}
