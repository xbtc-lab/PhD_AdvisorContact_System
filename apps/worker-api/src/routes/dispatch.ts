import { Hono } from "hono";
import { StartDispatchInputSchema } from "@app/shared";
import { db, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import {
  buildDispatchPlan,
  getLatestDispatchJob,
  getQuotaToday,
  requestStopActiveJob,
  startDispatchJob,
} from "../services/dispatch-worker.js";

/**
 * 防风控错峰批量投递队列计划、启停控制与日配额重置路由。
 */
export function createDispatchRoutes() {
  const router = new Hono();

  router.post("/api/dispatch/plan", async (c) => {
    try {
      const input = StartDispatchInputSchema.parse(await c.req.json());
      const plan = await buildDispatchPlan(input);
      return c.json({ ok: true, plan });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "生成发送计划失败" },
        400
      );
    }
  });

  router.post("/api/dispatch/start", async (c) => {
    try {
      const input = StartDispatchInputSchema.parse(await c.req.json());
      const job = await startDispatchJob(input);
      return c.json({ ok: true, job });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "启动队列失败" },
        400
      );
    }
  });

  router.post("/api/dispatch/stop", async (c) => {
    await requestStopActiveJob();
    return c.json({ ok: true });
  });

  router.get("/api/dispatch/status", async (c) => {
    const [job, quotaToday] = await Promise.all([
      getLatestDispatchJob(),
      getQuotaToday(),
    ]);
    return c.json({ ok: true, job, quotaToday });
  });

  router.post("/api/dispatch/quota/reset", async (c) => {
    const settings = await firstOrNull(
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .limit(1)
    );
    const now = new Date().toISOString();
    if (settings) {
      await db
        .update(schema.appSettings)
        .set({
          preferences: { ...settings.preferences, quotaResetAfter: now },
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));
    }
    const quotaToday = await getQuotaToday();
    return c.json({ ok: true, quotaToday, quotaResetAfter: now });
  });

  return router;
}
