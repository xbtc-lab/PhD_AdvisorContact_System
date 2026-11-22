import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdvisorRoutes } from "./routes/advisors.js";
import { createBootstrapRoutes } from "./routes/bootstrap.js";
import { createCatalogRoutes } from "./routes/catalog.js";
import { createDataIoRoutes } from "./routes/data-io.js";
import { createDispatchRoutes } from "./routes/dispatch.js";
import { createDraftRoutes } from "./routes/drafts.js";
import { createMailAccountRoutes } from "./routes/mail-accounts.js";
import { createMailMessageRoutes } from "./routes/mail-messages.js";
import { createResumeRoutes } from "./routes/resumes.js";

/**
 * worker-api 路由总装入口（仅保留全局 CORS 中间件与按业务领域拆分的子路由挂载）。
 * 后续 Stage 3 将挂载 `routes/tracking.ts`，Stage 4 将挂载 `routes/crawler.ts`。
 */
export function createWorkerApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.route("/", createBootstrapRoutes());
  app.route("/", createCatalogRoutes());
  app.route("/", createAdvisorRoutes());
  app.route("/", createDraftRoutes());
  app.route("/", createResumeRoutes());
  app.route("/", createMailAccountRoutes());
  app.route("/", createMailMessageRoutes());
  app.route("/", createDispatchRoutes());
  app.route("/", createDataIoRoutes());

  return app;
}
