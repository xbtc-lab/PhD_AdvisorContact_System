import { Hono } from "hono";
import {
  RollbackPromptInputSchema,
  UpdatePromptInputSchema,
} from "@app/shared";
import {
  getAdminActor,
  requireAdmin,
  resolveExpectedAdminToken,
} from "../middleware/admin-guard.js";
import {
  getPromptDetail,
  listPrompts,
  resetPromptToDefault,
  rollbackPrompt,
  updatePrompt,
} from "./registry.js";

/**
 * 管理员专属 Prompt 管理与版本回滚路由模块。
 * 所有端点统一挂载在 /api/cloud/admin/prompts，均受 requireAdmin 令牌保护。
 */
export function createAdminPromptRoutes() {
  const router = new Hono();

  router.use("*", requireAdmin);

  // 验证管理员令牌是否有效（用于前端 Admin 抽屉解锁状态检查）
  router.post("/verify", (c) => {
    const resolved = resolveExpectedAdminToken();
    return c.json({
      ok: true,
      verified: true,
      mode: resolved.source,
    });
  });

  router.get("/", async (c) => {
    const prompts = await listPrompts();
    return c.json({ ok: true, prompts });
  });

  router.get("/:key", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const detail = await getPromptDetail(key);
    if (!detail) {
      return c.json({ ok: false, error: `未找到 Prompt 模板: ${key}` }, 404);
    }
    return c.json({
      ok: true,
      prompt: detail.prompt,
      revisions: detail.revisions,
      defaultContentAvailable: detail.hasDefault,
    });
  });

  router.put("/:key", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const body = await c.req.json().catch(() => null);
    const parsed = UpdatePromptInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || "参数格式不合法",
        },
        400
      );
    }

    const updated = await updatePrompt(key, parsed.data, getAdminActor());
    if (!updated) {
      return c.json({ ok: false, error: `未找到 Prompt 模板: ${key}` }, 404);
    }
    return c.json({
      ok: true,
      prompt: updated.prompt,
      revisions: updated.revisions,
    });
  });

  router.post("/:key/rollback", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const body = await c.req.json().catch(() => null);
    const parsed = RollbackPromptInputSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: parsed.error.issues[0]?.message || "回滚版本号格式错误",
        },
        400
      );
    }

    const result = await rollbackPrompt(key, parsed.data.version, getAdminActor());
    if ("error" in result) {
      return c.json(
        {
          ok: false,
          error:
            result.error === "not_found"
              ? `未找到 Prompt 模板: ${key}`
              : `历史版本 v${parsed.data.version} 不存在`,
        },
        404
      );
    }

    return c.json({
      ok: true,
      prompt: result.prompt,
      revisions: result.revisions,
      restoredFromVersion: result.restoredFromVersion,
    });
  });

  router.post("/:key/reset", async (c) => {
    const key = decodeURIComponent(c.req.param("key"));
    const result = await resetPromptToDefault(key, getAdminActor());
    if (!result) {
      return c.json({ ok: false, error: `无此默认 Prompt 模板: ${key}` }, 404);
    }
    return c.json({
      ok: true,
      prompt: result.prompt,
      revisions: result.revisions,
    });
  });

  return router;
}
