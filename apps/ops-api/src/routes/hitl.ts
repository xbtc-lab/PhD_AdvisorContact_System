import { Hono } from "hono";
import { and, db, desc, eq, firstOrNull, ilike, or, schema } from "@app/db";
import { ReviewNoticeInputSchema, UpdateCatalogAdvisorOpsInputSchema } from "@app/shared";
import { recordOpsAudit } from "../middleware/ops-auth.js";

export function createHitlRoutes() {
  const router = new Hono();

  router.get("/advisors", async (c) => {
    const reviewStatus = (c.req.query("reviewStatus") || "all").trim();
    const recruitmentStatus = (c.req.query("recruitmentStatus") || "all").trim();
    const universityId = (c.req.query("universityId") || "all").trim();
    const q = (c.req.query("q") || "").trim();
    const limit = Math.min(Math.max(Number(c.req.query("limit") || 40), 1), 100);
    const offset = Math.max(Number(c.req.query("offset") || 0), 0);

    const conditions = [];
    if (reviewStatus !== "all") {
      conditions.push(eq(schema.catalogAdvisors.reviewStatus, reviewStatus));
    }
    if (recruitmentStatus !== "all") {
      conditions.push(eq(schema.catalogAdvisors.recruitmentStatus, recruitmentStatus as any));
    }
    if (universityId !== "all") {
      conditions.push(eq(schema.catalogAdvisors.universityId, universityId));
    }
    if (q) {
      conditions.push(
        or(
          ilike(schema.catalogAdvisors.name, `%${q}%`),
          ilike(schema.catalogAdvisors.dept, `%${q}%`),
          ilike(schema.catalogAdvisors.email, `%${q}%`)
        )!
      );
    }

    const [rows, unis] = await Promise.all([
      db
        .select()
        .from(schema.catalogAdvisors)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.catalogAdvisors.updatedAt))
        .limit(limit)
        .offset(offset),
      db.select().from(schema.catalogUniversities),
    ]);

    const uniMap = new Map(unis.map((u) => [u.id, u.name]));
    const items = rows.map((r) => ({
      ...r,
      universityName: uniMap.get(r.universityId) || "未知高校",
    }));

    return c.json({ ok: true, items });
  });

  router.patch("/advisors/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await firstOrNull(
      db.select().from(schema.catalogAdvisors).where(eq(schema.catalogAdvisors.id, id)).limit(1)
    );
    if (!existing) {
      return c.json({ ok: false, error: "未找到该公共导师档案" }, 404);
    }

    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateCatalogAdvisorOpsInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const patch: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
    };

    if (parsed.data.recruitmentStatus && parsed.data.recruitOpen === undefined) {
      patch.recruitOpen =
        parsed.data.recruitmentStatus === "confirmed_open" ||
        parsed.data.recruitmentStatus === "phd_default_open";
    }

    const [updated] = await db
      .update(schema.catalogAdvisors)
      .set(patch)
      .where(eq(schema.catalogAdvisors.id, id))
      .returning();

    await recordOpsAudit("update_catalog_advisor", "catalog_advisor", id, parsed.data);
    return c.json({ ok: true, advisor: updated });
  });

  router.get("/notices", async (c) => {
    const reviewStatus = (c.req.query("reviewStatus") || "all").trim();
    const conditions = [];
    if (reviewStatus !== "all") {
      conditions.push(eq(schema.catalogNotices.reviewStatus, reviewStatus));
    }

    const [rows, unis] = await Promise.all([
      db
        .select()
        .from(schema.catalogNotices)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.catalogNotices.crawledAt))
        .limit(80),
      db.select().from(schema.catalogUniversities),
    ]);

    const uniMap = new Map(unis.map((u) => [u.id, u.name]));
    const items = rows.map((r) => ({
      ...r,
      universityName: uniMap.get(r.universityId) || "未知高校",
    }));

    return c.json({ ok: true, items });
  });

  router.post("/notices/:id/review", async (c) => {
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    const parsed = ReviewNoticeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const nextStatus = parsed.data.action === "approve" ? "approved" : "false_positive";
    const [updated] = await db
      .update(schema.catalogNotices)
      .set({
        reviewStatus: nextStatus,
        summary: parsed.data.note ? parsed.data.note : undefined,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.catalogNotices.id, id))
      .returning();

    if (!updated) {
      return c.json({ ok: false, error: "未找到该通知记录" }, 404);
    }

    await recordOpsAudit("review_notice", "catalog_notice", id, parsed.data);
    return c.json({ ok: true, notice: updated });
  });

  return router;
}
