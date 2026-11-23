import crypto from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { defaultRateLimiter } from "@app/crawler";
import { asc, db, encryptSecret, eq, firstOrNull, schema } from "@app/db";
import {
  CreateLlmKeyInputSchema,
  UpdateGuardrailsInputSchema,
  UpdateLlmKeyInputSchema,
} from "@app/shared";
import { recordOpsAudit } from "../middleware/ops-auth.js";

const UpdateDictionarySchema = z.object({
  entries: z.array(z.string().trim().min(1)).max(500),
});

function maskApiKey(raw: string): string {
  if (raw.length <= 8) return "****";
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}

export function createGuardrailsRoutes() {
  const router = new Hono();

  router.get("/guardrails", async (c) => {
    const row = await firstOrNull(db.select().from(schema.opsGuardrailsConfig).limit(1));
    return c.json({ ok: true, guardrails: row || null });
  });

  router.put("/guardrails", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateGuardrailsInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(schema.opsGuardrailsConfig)
      .set({ ...parsed.data, updatedAt: now })
      .where(eq(schema.opsGuardrailsConfig.id, "default"))
      .returning();

    if (updated) {
      defaultRateLimiter.configure({
        minIntervalMs: Math.round(1000 / Math.max(updated.domainRps, 0.2)),
        circuitBreakerThreshold: updated.circuitBreakerThreshold,
        circuitCooldownMs: updated.circuitCooldownMin * 60_000,
      });
    }

    await recordOpsAudit("update_guardrails", "ops_guardrails_config", "default", parsed.data);
    return c.json({ ok: true, guardrails: updated });
  });

  router.get("/llm-keys", async (c) => {
    const rows = await db
      .select()
      .from(schema.opsLlmKeys)
      .orderBy(asc(schema.opsLlmKeys.priority));

    const safeItems = rows.map(({ encryptedApiKey: _enc, ...rest }) => rest);
    return c.json({ ok: true, items: safeItems });
  });

  router.post("/llm-keys", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = CreateLlmKeyInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const now = new Date().toISOString();
    const { apiKey, ...meta } = parsed.data;
    const [created] = await db
      .insert(schema.opsLlmKeys)
      .values({
        id: `llmkey_${crypto.randomBytes(6).toString("hex")}`,
        ...meta,
        encryptedApiKey: encryptSecret(apiKey),
        maskedKey: maskApiKey(apiKey),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const { encryptedApiKey: _enc, ...safeItem } = created;
    await recordOpsAudit("create_llm_key", "ops_llm_key", created.id, { label: created.label });
    return c.json({ ok: true, item: safeItem });
  });

  router.patch("/llm-keys/:id", async (c) => {
    const id = c.req.param("id");
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateLlmKeyInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const [updated] = await db
      .update(schema.opsLlmKeys)
      .set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(schema.opsLlmKeys.id, id))
      .returning();

    if (!updated) {
      return c.json({ ok: false, error: "未找到该 API Key" }, 404);
    }

    const { encryptedApiKey: _enc, ...safeItem } = updated;
    await recordOpsAudit("update_llm_key", "ops_llm_key", id, parsed.data);
    return c.json({ ok: true, item: safeItem });
  });

  router.delete("/llm-keys/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await db
      .delete(schema.opsLlmKeys)
      .where(eq(schema.opsLlmKeys.id, id))
      .returning({ id: schema.opsLlmKeys.id });
    if (deleted.length === 0) {
      return c.json({ ok: false, error: "未找到该 API Key" }, 404);
    }
    await recordOpsAudit("delete_llm_key", "ops_llm_key", id);
    return c.json({ ok: true, deletedId: id });
  });

  router.get("/dictionaries", async (c) => {
    const items = await db
      .select()
      .from(schema.opsRuleDictionaries)
      .orderBy(asc(schema.opsRuleDictionaries.kind));
    return c.json({ ok: true, items });
  });

  router.put("/dictionaries/:kind", async (c) => {
    const kind = c.req.param("kind");
    const raw = await c.req.json().catch(() => null);
    const parsed = UpdateDictionarySchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const deduped = [...new Set(parsed.data.entries.map((s) => s.trim()).filter(Boolean))];
    const [updated] = await db
      .update(schema.opsRuleDictionaries)
      .set({ entries: deduped, updatedAt: new Date().toISOString() })
      .where(eq(schema.opsRuleDictionaries.kind, kind))
      .returning();

    if (!updated) {
      return c.json({ ok: false, error: "未找到该词典类别" }, 404);
    }
    await recordOpsAudit("update_dictionary", "ops_rule_dictionary", kind, { count: deduped.length });
    return c.json({ ok: true, item: updated });
  });

  return router;
}
