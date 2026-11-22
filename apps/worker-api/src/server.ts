import { serve } from "@hono/node-server";
import { ensureSchema } from "@app/db";
import { createWorkerApp } from "./app.js";
import { reconcileStaleJobs } from "./services/dispatch-worker.js";

/**
 * worker-api 启动入口：初始化 SQLite 表结构，并将历史异常中断的调度任务标记为已停止。
 */
async function main() {
  await ensureSchema();
  await reconcileStaleJobs();

  const app = createWorkerApp();
  const port = Number(process.env.WORKER_API_PORT || 8788);

  serve(
    {
      fetch: app.fetch,
      port,
      hostname: "127.0.0.1",
    },
    (info) => {
      console.log(`[worker-api] running at http://127.0.0.1:${info.port}`);
    }
  );
}

main().catch((err) => {
  console.error("[worker-api] failed to start:", err);
  process.exit(1);
});
