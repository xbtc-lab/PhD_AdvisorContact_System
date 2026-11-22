import { serve } from "@hono/node-server";
import { ensureSchema } from "@app/db";
import { createCloudApp } from "./app.js";
import { ensureAdminTokenInitialized } from "./middleware/admin-guard.js";
import { seedDefaultPrompts } from "./prompts/registry.js";

async function main() {
  await ensureSchema();
  // 初始化管理员 Prompt 默认模板库与本地开发鉴权令牌
  await seedDefaultPrompts();
  ensureAdminTokenInitialized();

  const app = createCloudApp();
  const port = Number(process.env.CLOUD_CORE_PORT || 8787);

  serve(
    {
      fetch: app.fetch,
      port,
      hostname: "127.0.0.1",
    },
    (info) => {
      console.log(`[cloud-core] running at http://127.0.0.1:${info.port}`);
    }
  );
}

main().catch((err) => {
  console.error("[cloud-core] failed to start:", err);
  process.exit(1);
});
