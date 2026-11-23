import { Hono } from "hono";
import { z } from "zod";
import { and, asc, db, desc, eq, schema } from "@app/db";
import { UpdateScheduleInputSchema } from "@app/shared";
import { recordOpsAudit } from "../middleware/ops-auth.js";

const SeasonSwitchSchema = z.object({
  seasonMode: z.enum(["peak", "off_peak"]),
});

export function createRunsRoutes() {
  const router = new Hono();

  router.get("/runs", async (c) => {
    const items = await db
      .select()
      .from(schema.crawlRuns)
      .orderBy(desc(schema.crawlRuns.startedAt))
      .limit(50);
    return c.json({ ok: true, items });
  });

  router.get("/runs/:id/logs", async (c) => {
    const runId = c.req.param("id");
    const errorCategory = (c.req.query("errorCategory") || "all").trim();

    const conditions = [eq(schema.crawlRunLogs.runId, runId)];
    if (errorCategory !== "all") {
      conditions.push(eq(schema.crawlRunLogs.errorCategory, errorCategory));
    }

    const items = await db
      .select()
      .from(schema.crawlRunLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.crawlRunLogs.createdAt))
      .limit(200);

    return c.json({ ok: true, items });
  });

  router.get("/schedules", async (c) => {
    const items = await db
      .select()
      .from(schema.crawlSchedules)
      .orderBy(asc(schema.crawlSchedules.pipelineKey));
    return c.json({ ok: true, items });
  });

  router.patch("/schedules/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateScheduleInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const [updated] = await db
      .update(schema.crawlSchedules)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(schema.crawlSchedules.id, id))
      .returning();

    if (!updated) {
      return c.json({ ok: false, error: "未找到调度管道" }, 404);
    }
    await recordOpsAudit("update_schedule", "crawl_schedule", id, parsed.data);
    return c.json({ ok: true, schedule: updated });
  });

  router.post("/schedules/season", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = SeasonSwitchSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: "seasonMode 必须为 peak 或 off_peak" }, 400);
    }

    const { seasonMode } = parsed.data;
    const now = new Date().toISOString();
    const collegeCron = seasonMode === "peak" ? "0 */2 * * *" : "0 8 * * *";
    const gradCron = seasonMode === "peak" ? "0 */4 * * *" : "0 7 * * 1,4";

    await db
      .update(schema.crawlSchedules)
      .set({ seasonMode, updatedAt: now });

    await db
      .update(schema.crawlSchedules)
      .set({ cronExpr: collegeCron, updatedAt: now })
      .where(eq(schema.crawlSchedules.pipelineKey, "college_notice"));

    await db
      .update(schema.crawlSchedules)
      .set({ cronExpr: gradCron, updatedAt: now })
      .where(eq(schema.crawlSchedules.pipelineKey, "grad_school_notice"));

    const items = await db
      .select()
      .from(schema.crawlSchedules)
      .orderBy(asc(schema.crawlSchedules.pipelineKey));

    await recordOpsAudit("switch_season_mode", "crawl_schedule", "all", { seasonMode });
    return c.json({ ok: true, seasonMode, items });
  });

  return router;
}
