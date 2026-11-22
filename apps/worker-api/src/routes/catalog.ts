import crypto from "node:crypto";
import { Hono } from "hono";
import { and, asc, db, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import {
  buildCatalogAdvisorDto,
  findOrCreateInstitution,
  toAdvisorDto,
} from "../helpers/domain.js";

/**
 * 公共软科高校与导师目录检索、一键收录到个人联系台账路由。
 */
export function createCatalogRoutes() {
  const router = new Hono();

  router.get("/api/catalog/advisors", async (c) => {
    const q = (c.req.query("q") || "").trim().toLowerCase();
    const rankTier = (c.req.query("rankTier") || "all").trim();
    const honorCategory = (c.req.query("honorCategory") || "all").trim();
    const recruitOnly =
      c.req.query("recruitOnly") === "1" || c.req.query("recruitOnly") === "true";
    const sort = (c.req.query("sort") || "fit").trim();

    const [uniRows, advRows, userAdvisors] = await Promise.all([
      db
        .select()
        .from(schema.catalogUniversities)
        .orderBy(asc(schema.catalogUniversities.softScienceRank)),
      db.select().from(schema.catalogAdvisors),
      db
        .select({
          id: schema.advisors.id,
          catalogAdvisorId: schema.advisors.catalogAdvisorId,
        })
        .from(schema.advisors)
        .where(eq(schema.advisors.userId, LOCAL_USER_ID)),
    ]);

    const uniMap = new Map(uniRows.map((u) => [u.id, u]));
    const adoptedMap = new Map(
      userAdvisors
        .filter((a) => Boolean(a.catalogAdvisorId))
        .map((a) => [a.catalogAdvisorId!, a.id])
    );

    let list = advRows.map((ca) =>
      buildCatalogAdvisorDto(ca, uniMap.get(ca.universityId), adoptedMap.get(ca.id) ?? null)
    );

    if (q) {
      list = list.filter((item) => {
        const haystack = [
          item.name,
          item.universityName,
          item.universityShortName,
          item.dept,
          item.title,
          item.honorBadge,
          item.bio,
          item.footerNote,
          ...(item.researchTags || []),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      });
    }

    if (rankTier && rankTier !== "all") {
      list = list.filter((item) => item.rankTier === rankTier);
    }

    if (honorCategory && honorCategory !== "all") {
      list = list.filter((item) => item.honorCategory === honorCategory);
    }

    if (recruitOnly) {
      list = list.filter((item) => item.recruitOpen);
    }

    list.sort((a, b) => {
      if (sort === "rank") {
        return (
          (a.softScienceRank ?? 9999) - (b.softScienceRank ?? 9999) ||
          b.defaultFitScore - a.defaultFitScore
        );
      }
      if (sort === "updated") {
        return (b.sourceUpdatedAt || b.crawledAt).localeCompare(a.sourceUpdatedAt || a.crawledAt);
      }
      return b.defaultFitScore - a.defaultFitScore;
    });

    return c.json({
      ok: true,
      universities: uniRows,
      advisors: list,
    });
  });

  router.post("/api/catalog/advisors/:id/adopt", async (c) => {
    const catalogAdvisorId = c.req.param("id");
    const catAdv = await firstOrNull(
      db
        .select()
        .from(schema.catalogAdvisors)
        .where(eq(schema.catalogAdvisors.id, catalogAdvisorId))
        .limit(1)
    );
    if (!catAdv) {
      return c.json({ ok: false, error: "公共导师库中未找到该导师记录" }, 404);
    }

    const uni = await firstOrNull(
      db
        .select()
        .from(schema.catalogUniversities)
        .where(eq(schema.catalogUniversities.id, catAdv.universityId))
        .limit(1)
    );

    const existingAdopted = await firstOrNull(
      db
        .select()
        .from(schema.advisors)
        .where(
          and(
            eq(schema.advisors.userId, LOCAL_USER_ID),
            eq(schema.advisors.catalogAdvisorId, catalogAdvisorId)
          )
        )
        .limit(1)
    );

    if (existingAdopted) {
      const inst = await firstOrNull(
        db
          .select()
          .from(schema.institutions)
          .where(eq(schema.institutions.id, existingAdopted.institutionId))
          .limit(1)
      );
      return c.json({
        ok: true,
        alreadyAdopted: true,
        advisor: toAdvisorDto(existingAdopted, inst?.name || uni?.name || ""),
      });
    }

    const inst = await findOrCreateInstitution(uni?.name || "目标高校", catAdv.dept);
    const now = new Date().toISOString();
    const advisorId = crypto.randomUUID();
    const fitScore = catAdv.defaultFitScore;
    const matchTier = fitScore >= 90 ? "perfect" : fitScore >= 75 ? "high" : "try";

    const advisorRow: typeof schema.advisors.$inferSelect = {
      id: advisorId,
      userId: LOCAL_USER_ID,
      institutionId: inst.id,
      catalogAdvisorId: catAdv.id,
      name: catAdv.name,
      dept: catAdv.dept,
      title: catAdv.title,
      honorBadge: catAdv.honorBadge,
      email: catAdv.email,
      homepageUrl: catAdv.homepageUrl,
      scholarUrl: "",
      avatarSeed: `${inst.name}::${catAdv.name}`,
      photoUrl: catAdv.photoUrl,
      photoSource: catAdv.photoSource,
      researchTags: catAdv.researchTags || [],
      researchSummary: `${catAdv.bio}${catAdv.kpiOutputsHero ? `；${catAdv.kpiOutputsHero}` : ""}`,
      representativeWorks: [],
      recruitmentSignal: {
        status: catAdv.kpiQuotaHero || (catAdv.recruitOpen ? "明确招博" : "常规在招"),
        year: (catAdv.sourceUpdatedAt || "2026").slice(0, 4),
        sourceUrl: catAdv.homepageUrl,
        note: catAdv.footerNote,
      },
      matchTier,
      matchScore: fitScore,
      stage: "drafting",
      inBatch: true,
      assignedAccountId: "auto",
      hookNote: "",
      userNotes: `由「发现导师」从 ${inst.name} 一键收录`,
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
      selectedHook: "",
      resumeId: null,
      preferredAccountId: "auto",
      templateStyle: "editorial",
      embedContactCard: true,
      updatedAt: now,
    });
    await db.insert(schema.aiSessions).values({
      id: crypto.randomUUID(),
      userId: LOCAL_USER_ID,
      advisorId,
      title: "默认写作会话",
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      ok: true,
      alreadyAdopted: false,
      advisor: toAdvisorDto(advisorRow, inst.name),
    });
  });

  router.delete("/api/catalog/advisors/:id/adopt", async (c) => {
    const catalogAdvisorId = c.req.param("id");
    const deleted = await db
      .delete(schema.advisors)
      .where(
        and(
          eq(schema.advisors.userId, LOCAL_USER_ID),
          eq(schema.advisors.catalogAdvisorId, catalogAdvisorId)
        )
      )
      .returning({ id: schema.advisors.id });

    return c.json({
      ok: true,
      removed: deleted.length > 0,
    });
  });

  return router;
}
