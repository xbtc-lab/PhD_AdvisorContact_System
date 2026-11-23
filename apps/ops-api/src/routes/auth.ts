import { Hono } from "hono";
import { z } from "zod";
import {
  clearOpsSessionCookie,
  isRequestAuthenticated,
  issueOpsSessionCookie,
  recordOpsAudit,
  resolveOpsAdminToken,
  timingSafeEqualStr,
} from "../middleware/ops-auth.js";

const LoginBodySchema = z.object({
  token: z.string().trim().min(1, "请输入管理员令牌"),
});

export function createOpsAuthRoutes() {
  const router = new Hono();

  router.get("/me", (c) => {
    const auth = isRequestAuthenticated(c);
    const resolved = resolveOpsAdminToken();
    return c.json({
      ok: true,
      authenticated: auth.authenticated,
      via: auth.via,
      tokenSource: resolved.source,
      devTokenHint: resolved.source === "dev-file" ? "storage/.dev-admin.token" : undefined,
    });
  });

  router.post("/login", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = LoginBodySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数错误" }, 400);
    }

    const expected = resolveOpsAdminToken();
    if (!timingSafeEqualStr(parsed.data.token, expected.token)) {
      return c.json({ ok: false, error: "管理员令牌校验失败" }, 403);
    }

    issueOpsSessionCookie(c, expected.token);
    await recordOpsAudit("ops_login", "session", "admin");
    return c.json({ ok: true, authenticated: true });
  });

  router.post("/logout", (c) => {
    clearOpsSessionCookie(c);
    return c.json({ ok: true, authenticated: false });
  });

  return router;
}
