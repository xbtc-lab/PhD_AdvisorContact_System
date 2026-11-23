import { Hono } from "hono";
import { db, desc, schema } from "@app/db";

export function createOverviewRoutes() {
  const router = new Hono();

  router.get("/", async (c) => {
    const [unis, cols, advs, notices, runs, guardrails, ledger] = await Promise.all([
      db.select().from(schema.catalogUniversities),
      db.select().from(schema.catalogColleges),
      db.select().from(schema.catalogAdvisors),
      db.select().from(schema.catalogNotices),
      db.select().from(schema.crawlRuns).orderBy(desc(schema.crawlRuns.startedAt)).limit(10),
      db.select().from(schema.opsGuardrailsConfig).limit(1),
      db.select().from(schema.llmUsageLedger),
    ]);

    const top100Count = unis.filter((u) => u.sourceScope === "top100").length;
    const customManualCount = unis.filter((u) => u.sourceScope === "custom_manual").length;

    const phdOpenCount = advs.filter((a) => a.recruitOpen).length;
    const confirmedOpenCount = advs.filter(
      (a) => a.recruitmentStatus === "confirmed_open"
    ).length;
    const ruleDirectCount = advs.filter((a) => a.extractModeUsed === "rule").length;
    const ruleDirectRate = advs.length > 0 ? Math.round((ruleDirectCount / advs.length) * 100) : 100;

    const pendingAdvisors = advs.filter((a) => a.reviewStatus === "needs_review").length;
    const pendingNotices = notices.filter((n) => n.reviewStatus === "pending").length;

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const monthCostCny = ledger
      .filter((l) => l.createdAt.startsWith(monthPrefix))
      .reduce((sum, l) => sum + (l.costCny || 0), 0);

    const healthyUnis = unis.filter((u) => u.healthStatus === "healthy").length;
    const unprobedUnis = unis.filter((u) => u.healthStatus === "unprobed").length;
    const degradedUnis = unis.filter(
      (u) => u.healthStatus === "degraded" || u.healthStatus === "broken"
    ).length;

    const matrix = [...unis]
      .sort((a, b) => (a.softScienceRank ?? 9999) - (b.softScienceRank ?? 9999))
      .slice(0, 120)
      .map((u) => ({
        id: u.id,
        name: u.name,
        shortName: u.shortName || u.name,
        rank: u.softScienceRank,
        sourceScope: u.sourceScope,
        portalBucket: u.portalBucket,
        healthStatus: u.healthStatus,
      }));

    return c.json({
      ok: true,
      kpis: {
        top100Count,
        customManualCount,
        totalUniversities: unis.length,
        totalColleges: cols.length,
        totalAdvisors: advs.length,
        phdOpenCount,
        confirmedOpenCount,
        ruleDirectRate,
        pendingAdvisors,
        pendingNotices,
        monthCostCny: Number(monthCostCny.toFixed(4)),
      },
      healthBreakdown: {
        healthy: healthyUnis,
        unprobed: unprobedUnis,
        attention: degradedUnis,
      },
      guardrails: guardrails[0] || null,
      matrix,
      recentRuns: runs,
    });
  });

  return router;
}
