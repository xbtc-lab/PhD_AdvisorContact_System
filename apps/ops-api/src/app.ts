import { Hono } from "hono";
import { cors } from "hono/cors";
import { pool } from "@app/db";
import { requireOpsAdmin } from "./middleware/ops-auth.js";
import { createOpsAuthRoutes } from "./routes/auth.js";
import { createGuardrailsRoutes } from "./routes/guardrails.js";
import { createHitlRoutes } from "./routes/hitl.js";
import { createOverviewRoutes } from "./routes/overview.js";
import { createRunsRoutes } from "./routes/runs.js";
import { createSandboxRoutes } from "./routes/sandbox.js";
import { createSourcesRoutes } from "./routes/sources.js";

function buildAllowedOrigins(): Set<string> {
  const origins = new Set([
    "http://127.0.0.1:5174",
    "http://localhost:5174",
  ]);
  const extra = (process.env.ADMIN_WEB_ORIGIN || "").trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const cleaned = part.trim();
      if (cleaned) origins.add(cleaned);
    }
  }
  return origins;
}

export function createOpsApp() {
  const app = new Hono();
  const allowedOrigins = buildAllowedOrigins();

  app.onError((err, c) => {
    console.error("[ops-api error]", err);
    return c.json({ ok: false, error: err?.message || "服务端内部错误" }, 500);
  });

  app.use(
    "*",
    cors({
      origin: (origin) => {
        if (!origin) return "http://127.0.0.1:5174";
        return allowedOrigins.has(origin) ? origin : "";
      },
      credentials: true,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
    })
  );

  app.get("/api/ops/health", async (c) => {
    let dbConnected = false;
    try {
      await pool.query("SELECT 1");
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
    return c.json({
      ok: dbConnected,
      service: "ops-api",
      dialect: "postgresql",
      dbConnected,
      timestamp: new Date().toISOString(),
    });
  });

  app.route("/api/ops/auth", createOpsAuthRoutes());

  // 除健康检查与登录接口外，所有 /api/ops/* 强制校验管理员 Cookie 或 Token
  app.use("/api/ops/*", requireOpsAdmin);
  app.route("/api/ops/overview", createOverviewRoutes());
  app.route("/api/ops/sources", createSourcesRoutes());
  app.route("/api/ops", createSandboxRoutes());
  app.route("/api/ops", createRunsRoutes());
  app.route("/api/ops/hitl", createHitlRoutes());
  app.route("/api/ops", createGuardrailsRoutes());

  return app;
}
