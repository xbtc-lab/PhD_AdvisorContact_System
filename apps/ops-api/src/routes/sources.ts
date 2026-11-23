import crypto from "node:crypto";
import { Hono } from "hono";
import {
  mergeWithLockedFields,
  probeUniversity,
  syncSoftScienceToDb,
} from "@app/crawler";
import { asc, db, eq, firstOrNull, schema } from "@app/db";
import {
  CreateCollegeInputSchema,
  OnboardUniversityInputSchema,
  ProbeUniversityInputSchema,
  UpdateCollegeInputSchema,
  UpdateUniversityOpsInputSchema,
} from "@app/shared";
import { recordOpsAudit } from "../middleware/ops-auth.js";

export function createSourcesRoutes() {
  const router = new Hono();

  router.get("/universities", async (c) => {
    const q = (c.req.query("q") || "").trim().toLowerCase();
    const scope = (c.req.query("sourceScope") || "all").trim();
    const health = (c.req.query("healthStatus") || "all").trim();

    const [unis, cols, advs, notices] = await Promise.all([
      db.select().from(schema.catalogUniversities).orderBy(asc(schema.catalogUniversities.softScienceRank)),
      db.select().from(schema.catalogColleges).orderBy(asc(schema.catalogColleges.name)),
      db.select({ id: schema.catalogAdvisors.id, universityId: schema.catalogAdvisors.universityId, collegeId: schema.catalogAdvisors.collegeId }).from(schema.catalogAdvisors),
      db.select({ id: schema.catalogNotices.id, universityId: schema.catalogNotices.universityId, collegeId: schema.catalogNotices.collegeId }).from(schema.catalogNotices),
    ]);

    const advByUni = new Map<string, number>();
    const advByCol = new Map<string, number>();
    for (const a of advs) {
      advByUni.set(a.universityId, (advByUni.get(a.universityId) || 0) + 1);
      if (a.collegeId) advByCol.set(a.collegeId, (advByCol.get(a.collegeId) || 0) + 1);
    }

    const noticeByUni = new Map<string, number>();
    const noticeByCol = new Map<string, number>();
    for (const n of notices) {
      noticeByUni.set(n.universityId, (noticeByUni.get(n.universityId) || 0) + 1);
      if (n.collegeId) noticeByCol.set(n.collegeId, (noticeByCol.get(n.collegeId) || 0) + 1);
    }

    const colsByUni = new Map<string, Array<typeof schema.catalogColleges.$inferSelect & { advisorCount: number; noticeCount: number }>>();
    for (const col of cols) {
      const list = colsByUni.get(col.universityId) || [];
      list.push({
        ...col,
        advisorCount: advByCol.get(col.id) || 0,
        noticeCount: noticeByCol.get(col.id) || 0,
      });
      colsByUni.set(col.universityId, list);
    }

    let items = unis.map((u) => ({
      ...u,
      advisorCount: advByUni.get(u.id) || 0,
      noticeCount: noticeByUni.get(u.id) || 0,
      colleges: colsByUni.get(u.id) || [],
    }));

    if (scope !== "all") {
      items = items.filter((u) => u.sourceScope === scope);
    }
    if (health !== "all") {
      items = items.filter((u) => u.healthStatus === health);
    }
    if (q) {
      items = items.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.shortName.toLowerCase().includes(q) ||
          u.officialDomain.toLowerCase().includes(q) ||
          u.colleges.some((col) => col.name.toLowerCase().includes(q))
      );
    }

    return c.json({ ok: true, items, total: items.length });
  });

  router.patch("/universities/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await firstOrNull(
      db.select().from(schema.catalogUniversities).where(eq(schema.catalogUniversities.id, id)).limit(1)
    );
    if (!existing) {
      return c.json({ ok: false, error: "未找到该高校" }, 404);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateUniversityOpsInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const [updated] = await db
      .update(schema.catalogUniversities)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(schema.catalogUniversities.id, id))
      .returning();

    await recordOpsAudit("update_university", "catalog_university", id, parsed.data);
    return c.json({ ok: true, university: updated });
  });

  router.post("/sync-softscience", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { year?: number; limit?: number };
    const result = await syncSoftScienceToDb({
      year: typeof body.year === "number" ? body.year : 2025,
      limit: typeof body.limit === "number" ? body.limit : 100,
    });
    await recordOpsAudit("sync_softscience", "crawl_run", result.runId, result);
    return c.json({ ok: true, ...result });
  });

  router.post("/probe-university", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = ProbeUniversityInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数错误" }, 400);
    }
    const result = await probeUniversity(parsed.data);
    return c.json({ ok: true, probe: result });
  });

  router.post("/universities/:id/probe", async (c) => {
    const id = c.req.param("id");
    const existing = await firstOrNull(
      db.select().from(schema.catalogUniversities).where(eq(schema.catalogUniversities.id, id)).limit(1)
    );
    if (!existing) {
      return c.json({ ok: false, error: "未找到该高校" }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { officialDomain?: string };
    const domain = (body.officialDomain || existing.officialDomain || "").trim();
    if (!domain) {
      return c.json({ ok: false, error: "该高校尚未填写官网主域名（如 tsinghua.edu.cn），请先编辑域名" }, 400);
    }

    const probe = await probeUniversity({
      universityId: existing.id,
      name: existing.name,
      officialDomain: domain,
      collegeUrl: "",
      facultyListUrl: "",
      noticeListUrl: "",
      skipSubdomainProbe: false,
    });

    const now = new Date().toISOString();
    const safePatch = mergeWithLockedFields(
      existing,
      {
        officialDomain: probe.officialDomain || domain,
        facultyPortalUrl: probe.facultyPortal?.finalUrl || existing.facultyPortalUrl,
        admissionUrl: probe.admissionPortal?.finalUrl || existing.admissionUrl,
        portalBucket: probe.suggestedPortalBucket,
        healthStatus: (probe.facultyPortal || probe.admissionPortal || probe.colleges.length > 0
          ? "healthy"
          : "degraded") as typeof existing.healthStatus,
        lastProbedAt: now,
        updatedAt: now,
      },
      existing.manualLockedFields || []
    );

    const [updated] = await db
      .update(schema.catalogUniversities)
      .set(safePatch)
      .where(eq(schema.catalogUniversities.id, id))
      .returning();

    await recordOpsAudit("probe_university", "catalog_university", id, {
      domain,
      collegesFound: probe.colleges.length,
    });

    return c.json({ ok: true, university: updated, probe });
  });

  router.post("/onboard-university", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = OnboardUniversityInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数错误" }, 400);
    }

    const data = parsed.data;
    const now = new Date().toISOString();
    let uni = data.universityId
      ? await firstOrNull(
          db.select().from(schema.catalogUniversities).where(eq(schema.catalogUniversities.id, data.universityId)).limit(1)
        )
      : await firstOrNull(
          db.select().from(schema.catalogUniversities).where(eq(schema.catalogUniversities.name, data.name)).limit(1)
        );

    if (!uni) {
      const [inserted] = await db
        .insert(schema.catalogUniversities)
        .values({
          id: `uni-${crypto.randomBytes(6).toString("hex")}`,
          name: data.name,
          shortName: data.shortName || data.name.slice(0, 4),
          softScienceRank: data.softScienceRank ?? null,
          rankTier: data.rankTier,
          disciplineRankNote: data.disciplineRankNote,
          facultyPortalUrl: data.facultyPortalUrl,
          admissionUrl: data.admissionUrl,
          sourceScope: data.sourceScope,
          officialDomain: data.officialDomain,
          portalBucket: data.portalBucket,
          healthStatus: data.colleges.length > 0 ? "healthy" : "unprobed",
          enabled: true,
          customTags: data.customTags,
          manualLockedFields: [],
          lastProbedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      uni = inserted;
    } else {
      const [updated] = await db
        .update(schema.catalogUniversities)
        .set({
          shortName: data.shortName || uni.shortName,
          officialDomain: data.officialDomain || uni.officialDomain,
          facultyPortalUrl: data.facultyPortalUrl || uni.facultyPortalUrl,
          admissionUrl: data.admissionUrl || uni.admissionUrl,
          portalBucket: data.portalBucket || uni.portalBucket,
          lastProbedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.catalogUniversities.id, uni.id))
        .returning();
      uni = updated;
    }

    const savedColleges: Array<typeof schema.catalogColleges.$inferSelect> = [];
    for (const col of data.colleges) {
      const existingCol = await db
        .select()
        .from(schema.catalogColleges)
        .where(eq(schema.catalogColleges.universityId, uni.id))
        .then((rows) => rows.find((r) => r.name === col.name));

      if (!existingCol) {
        const [insCol] = await db
          .insert(schema.catalogColleges)
          .values({
            id: `col-${crypto.randomBytes(6).toString("hex")}`,
            universityId: uni.id,
            name: col.name,
            disciplineCategory: col.disciplineCategory,
            collegeUrl: col.collegeUrl,
            facultyListUrl: col.facultyListUrl,
            noticeListUrl: col.noticeListUrl,
            phdAdmissionUrl: col.phdAdmissionUrl,
            cmsFingerprint: col.cmsFingerprint,
            facultyStrategy: col.facultyStrategy,
            noticeStrategy: col.noticeStrategy,
            healthStatus: "unprobed",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        savedColleges.push(insCol);
      } else {
        const [updCol] = await db
          .update(schema.catalogColleges)
          .set({
            collegeUrl: col.collegeUrl || existingCol.collegeUrl,
            facultyListUrl: col.facultyListUrl || existingCol.facultyListUrl,
            noticeListUrl: col.noticeListUrl || existingCol.noticeListUrl,
            phdAdmissionUrl: col.phdAdmissionUrl || existingCol.phdAdmissionUrl,
            cmsFingerprint:
              col.cmsFingerprint !== "unknown" ? col.cmsFingerprint : existingCol.cmsFingerprint,
            updatedAt: now,
          })
          .where(eq(schema.catalogColleges.id, existingCol.id))
          .returning();
        savedColleges.push(updCol);
      }
    }

    await recordOpsAudit("onboard_university", "catalog_university", uni.id, {
      name: uni.name,
      sourceScope: uni.sourceScope,
      collegesAdded: savedColleges.length,
    });

    return c.json({ ok: true, university: uni, colleges: savedColleges });
  });

  router.post("/colleges", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = CreateCollegeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const now = new Date().toISOString();
    const [col] = await db
      .insert(schema.catalogColleges)
      .values({
        id: `col-${crypto.randomBytes(6).toString("hex")}`,
        ...parsed.data,
        healthStatus: "unprobed",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await recordOpsAudit("create_college", "catalog_college", col.id, { name: col.name });
    return c.json({ ok: true, college: col });
  });

  router.patch("/colleges/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateCollegeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const [updated] = await db
      .update(schema.catalogColleges)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(schema.catalogColleges.id, id))
      .returning();

    if (!updated) {
      return c.json({ ok: false, error: "未找到该学院" }, 404);
    }
    await recordOpsAudit("update_college", "catalog_college", id, parsed.data);
    return c.json({ ok: true, college: updated });
  });

  router.delete("/colleges/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await db
      .delete(schema.catalogColleges)
      .where(eq(schema.catalogColleges.id, id))
      .returning({ id: schema.catalogColleges.id });
    if (deleted.length === 0) {
      return c.json({ ok: false, error: "未找到该学院" }, 404);
    }
    await recordOpsAudit("delete_college", "catalog_college", id);
    return c.json({ ok: true, deletedId: id });
  });

  return router;
}
