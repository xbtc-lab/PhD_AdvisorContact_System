import crypto from "node:crypto";
import { Hono } from "hono";
import {
  BatchImportAdvisorsInputSchema,
  CreateAdvisorInputSchema,
  CreateInstitutionInputSchema,
  normalizeMatchTier,
  UpdateAdvisorInputSchema,
} from "@app/shared";
import { asc, db, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import { findOrCreateInstitution, toAdvisorDto } from "../helpers/domain.js";

/**
 * 用户私有目标高校、导师台账的增删改与 AI 批量导入路由。
 */
export function createAdvisorRoutes() {
  const router = new Hono();

  router.get("/api/institutions", async (c) => {
    const rows = await db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.userId, LOCAL_USER_ID))
      .orderBy(asc(schema.institutions.createdAt));
    return c.json({ ok: true, institutions: rows });
  });

  router.post("/api/institutions", async (c) => {
    try {
      const input = CreateInstitutionInputSchema.parse(await c.req.json());
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        name: input.name,
        shortName: input.shortName || "",
        department: input.department || "",
        facultyListUrl: input.facultyListUrl || "",
        admissionUrl: input.admissionUrl || "",
        deadlineAt: input.deadlineAt || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.institutions).values(row);
      return c.json({ ok: true, institution: row });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "创建高校失败" },
        400
      );
    }
  });

  router.post("/api/advisors", async (c) => {
    try {
      const input = CreateAdvisorInputSchema.parse(await c.req.json());
      const inst = input.institutionId
        ? await firstOrNull(
            db
              .select()
              .from(schema.institutions)
              .where(eq(schema.institutions.id, input.institutionId))
              .limit(1)
          )
        : await findOrCreateInstitution(input.institutionName || "目标高校", input.dept);

      if (!inst) {
        return c.json({ ok: false, error: "所选高校不存在" }, 404);
      }

      const now = new Date().toISOString();
      const advisorId = crypto.randomUUID();
      const advisorRow: typeof schema.advisors.$inferSelect = {
        id: advisorId,
        userId: LOCAL_USER_ID,
        institutionId: inst.id,
        catalogAdvisorId: null,
        name: input.name,
        dept: input.dept,
        title: input.title,
        honorBadge: "",
        email: input.email,
        homepageUrl: input.homepageUrl,
        scholarUrl: input.scholarUrl,
        avatarSeed: `${inst.name}::${input.name}`,
        photoUrl: "",
        photoSource: "",
        researchTags: input.researchTags,
        researchSummary: input.researchSummary,
        representativeWorks: [],
        recruitmentSignal: null,
        matchTier: input.matchTier,
        matchScore: null,
        stage: input.stage,
        inBatch: input.inBatch,
        assignedAccountId: "auto",
        hookNote: input.hookNote,
        userNotes: input.userNotes,
        replyNote: "",
        trackSummary: "",
        aiInsights: null,
        researchEmbedding: null,
        lastSentAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.advisors).values(advisorRow);
      await db.insert(schema.outreachDrafts).values({
        id: crypto.randomUUID(),
        advisorId,
        subject: "",
        body: "",
        selectedHook: input.hookNote || "",
        resumeId: null,
        preferredAccountId: "auto",
        templateStyle: "editorial",
        embedContactCard: true,
        updatedAt: now,
      });

      return c.json({
        ok: true,
        advisor: toAdvisorDto(advisorRow, inst.name),
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "添加导师失败" },
        400
      );
    }
  });

  router.post("/api/advisors/batch-import", async (c) => {
    try {
      const input = BatchImportAdvisorsInputSchema.parse(await c.req.json());
      const inst = await findOrCreateInstitution(input.institutionName);
      const existing = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.institutionId, inst.id));

      const existingNames = new Set(existing.map((a) => a.name.trim()));
      const existingEmails = new Set(
        existing.filter((a) => a.email.trim()).map((a) => a.email.trim().toLowerCase())
      );

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      for (const item of input.advisors) {
        const cleanName = item.name.trim();
        const cleanEmail = item.email.trim();
        if (
          existingNames.has(cleanName) ||
          (cleanEmail && existingEmails.has(cleanEmail.toLowerCase()))
        ) {
          skipped += 1;
          continue;
        }
        const advisorId = crypto.randomUUID();
        await db.insert(schema.advisors).values({
          id: advisorId,
          userId: LOCAL_USER_ID,
          institutionId: inst.id,
          catalogAdvisorId: null,
          name: cleanName,
          dept: item.dept,
          title: item.title,
          honorBadge: "",
          email: cleanEmail,
          homepageUrl: item.homepageUrl,
          scholarUrl: "",
          avatarSeed: `${inst.name}::${cleanName}`,
          photoUrl: "",
          photoSource: "",
          researchTags: item.tags,
          researchSummary: item.research,
          representativeWorks: [],
          recruitmentSignal: null,
          matchTier: normalizeMatchTier(item.matchTier),
          matchScore: null,
          stage: "drafting",
          inBatch: true,
          assignedAccountId: "auto",
          hookNote: item.hookNote || "",
          userNotes: item.note || "",
          replyNote: "",
          trackSummary: "",
          aiInsights: null,
          researchEmbedding: null,
          lastSentAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.outreachDrafts).values({
          id: crypto.randomUUID(),
          advisorId,
          subject: "",
          body: "",
          selectedHook: item.hookNote || "",
          resumeId: null,
          preferredAccountId: "auto",
          templateStyle: "editorial",
          embedContactCard: true,
          updatedAt: now,
        });
        existingNames.add(cleanName);
        if (cleanEmail) existingEmails.add(cleanEmail.toLowerCase());
        added += 1;
      }

      return c.json({ ok: true, added, skipped, institution: inst });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "批量导入失败" },
        400
      );
    }
  });

  router.patch("/api/advisors/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const input = UpdateAdvisorInputSchema.parse(await c.req.json());
      const cur = await firstOrNull(
        db.select().from(schema.advisors).where(eq(schema.advisors.id, id)).limit(1)
      );
      if (!cur) return c.json({ ok: false, error: "导师不存在" }, 404);

      let targetInstitutionId = cur.institutionId;
      if (input.institutionName && input.institutionName.trim()) {
        const inst = await findOrCreateInstitution(input.institutionName);
        targetInstitutionId = inst.id;
      } else if (input.institutionId) {
        targetInstitutionId = input.institutionId;
      }

      const { institutionName: _ignored, ...rest } = input;
      const now = new Date().toISOString();
      await db
        .update(schema.advisors)
        .set({
          ...rest,
          institutionId: targetInstitutionId,
          updatedAt: now,
        })
        .where(eq(schema.advisors.id, id));

      const updated = await firstOrNull(
        db.select().from(schema.advisors).where(eq(schema.advisors.id, id)).limit(1)
      );
      const inst = await firstOrNull(
        db
          .select()
          .from(schema.institutions)
          .where(eq(schema.institutions.id, targetInstitutionId))
          .limit(1)
      );

      return c.json({
        ok: true,
        advisor: toAdvisorDto(updated!, inst?.name || ""),
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "更新失败" },
        400
      );
    }
  });

  router.delete("/api/advisors/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.advisors).where(eq(schema.advisors.id, id));
    return c.json({ ok: true });
  });

  return router;
}
