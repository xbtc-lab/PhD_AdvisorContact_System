import { serve } from "@hono/node-server";
import { ensureSchema } from "@app/db";
import { createOpsApp } from "./app.js";
import { ensureOpsTokenInitialized } from "./middleware/ops-auth.js";

async function main() {
  await ensureSchema();
  ensureOpsTokenInitialized();

  const app = createOpsApp();
  const port = Number(process.env.OPS_API_PORT || 8789);

  serve(
    {
      fetch: app.fetch,
      port,
      hostname: "127.0.0.1",
    },
    (info) => {
      console.log(`[ops-api] running at http://127.0.0.1:${info.port}`);
    }
  );
}

main().catch((err) => {
  console.error("[ops-api] failed to start:", err);
  process.exit(1);
});
