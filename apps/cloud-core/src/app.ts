import { Hono } from "hono";
import { cors } from "hono/cors";
import { db, eq, firstOrNull, LOCAL_USER_ID, pool, schema } from "@app/db";
import { createAdminPromptRoutes } from "./prompts/routes.js";
import { createAiRoutes } from "./routes/ai.js";

/**
 * cloud-core 路由总装入口（仅保留全局 CORS、健康检查、额度查验与子路由挂载）。
 */
export function createCloudApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
    })
  );

  // 挂载管理员专属 Prompt 调优与版本回滚路由
  app.route("/api/cloud/admin/prompts", createAdminPromptRoutes());
  // 挂载 AI 写作副驾驶、多会话与网页抽取路由
  app.route("/", createAiRoutes());

  app.get("/api/cloud/health", async (c) => {
    let dbConnected = false;
    try {
      await pool.query("SELECT 1");
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
    return c.json({
      ok: dbConnected,
      service: "cloud-core",
      dialect: "postgresql",
      dbConnected,
      mode: "local-dev",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/cloud/entitlements", async (c) => {
    const acct = await firstOrNull(
      db
        .select()
        .from(schema.creditAccounts)
        .where(eq(schema.creditAccounts.userId, LOCAL_USER_ID))
        .limit(1)
    );

    return c.json({
      ok: true,
      tier: "local_unlimited",
      licenseActive: true,
      creditsBalance: acct?.balance ?? 999999,
      features: {
        aiCopilot: true,
        aiExtract: true,
        aiAnalyze: true,
        cloudSync: false,
      },
    });
  });

  return app;
}
