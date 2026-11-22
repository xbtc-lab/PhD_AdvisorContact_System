import crypto from "node:crypto";
import type {
  PromptRevision,
  PromptTemplate,
  UpdatePromptInput,
} from "@app/shared";
import { db, desc, eq, schema } from "@app/db";
import {
  DEFAULT_PROMPTS,
  findDefaultPromptSeed,
  type DefaultPromptSeed,
} from "./defaults.js";

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  prompt: PromptTemplate;
  expiresAt: number;
}

const promptCache = new Map<string, CacheEntry>();

function toPromptTemplate(row: typeof schema.promptTemplates.$inferSelect): PromptTemplate {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    description: row.description,
    content: row.content,
    variables: Array.isArray(row.variables) ? row.variables : [],
    temperature: row.temperature,
    maxOutputTokens: row.maxOutputTokens,
    activeVersion: row.activeVersion,
    isEnabled: Boolean(row.isEnabled),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
}

function toPromptRevision(row: typeof schema.promptRevisions.$inferSelect): PromptRevision {
  return {
    id: row.id,
    promptId: row.promptId,
    version: row.version,
    content: row.content,
    temperature: row.temperature,
    maxOutputTokens: row.maxOutputTokens,
    changeNote: row.changeNote,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function seedFallbackToTemplate(seed: DefaultPromptSeed): PromptTemplate {
  return {
    id: `fallback-${seed.key}`,
    key: seed.key,
    name: seed.name,
    category: seed.category,
    description: seed.description,
    content: seed.content,
    variables: [...seed.variables],
    temperature: seed.temperature,
    maxOutputTokens: seed.maxOutputTokens,
    activeVersion: 1,
    isEnabled: true,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * 清除单个或全部 Prompt 内存缓存，确保管理员编辑/回滚后热生效。
 */
export function invalidatePromptCache(key?: string): void {
  if (key) {
    promptCache.delete(key);
  } else {
    promptCache.clear();
  }
}

/**
 * 启动时补齐缺失的默认 Prompt 及其 v1 基线版本；已有记录保持管理员修改不被覆盖。
 */
export async function seedDefaultPrompts(): Promise<void> {
  const existingRows = await db.select().from(schema.promptTemplates);
  const existingKeys = new Set(existingRows.map((item) => item.key));
  const now = new Date().toISOString();

  for (const seed of DEFAULT_PROMPTS) {
    if (existingKeys.has(seed.key)) continue;

    const promptId = crypto.randomUUID();
    await db.insert(schema.promptTemplates).values({
      id: promptId,
      key: seed.key,
      name: seed.name,
      category: seed.category,
      description: seed.description,
      content: seed.content,
      variables: [...seed.variables],
      temperature: seed.temperature,
      maxOutputTokens: seed.maxOutputTokens,
      activeVersion: 1,
      isEnabled: true,
      updatedBy: "system",
      updatedAt: now,
    });

    await db.insert(schema.promptRevisions).values({
      id: crypto.randomUUID(),
      promptId,
      version: 1,
      content: seed.content,
      temperature: seed.temperature,
      maxOutputTokens: seed.maxOutputTokens,
      changeNote: "系统默认初始化",
      createdBy: "system",
      createdAt: now,
    });
  }
}

/**
 * 获取当前激活 Prompt（带 30 秒 TTL 缓存；若管理员停用或库内缺失，安全兜底到默认版本）。
 */
export async function getActivePrompt(key: string): Promise<PromptTemplate> {
  const nowMs = Date.now();
  const cached = promptCache.get(key);
  if (cached && cached.expiresAt > nowMs) {
    return cached.prompt;
  }

  let row = await db
    .select()
    .from(schema.promptTemplates)
    .where(eq(schema.promptTemplates.key, key))
    .get();

  if (!row) {
    await seedDefaultPrompts();
    row = await db
      .select()
      .from(schema.promptTemplates)
      .where(eq(schema.promptTemplates.key, key))
      .get();
  }

  if (row && row.isEnabled) {
    const prompt = toPromptTemplate(row);
    promptCache.set(key, { prompt, expiresAt: nowMs + CACHE_TTL_MS });
    return prompt;
  }

  // 若管理员暂时禁用自定义模板或意外缺项，回退到内置安全基线，保障主流程不中断
  const fallback = findDefaultPromptSeed(key);
  if (fallback) {
    const prompt = seedFallbackToTemplate(fallback);
    promptCache.set(key, { prompt, expiresAt: nowMs + CACHE_TTL_MS });
    return prompt;
  }

  throw new Error(`未找到 Prompt 模板: ${key}`);
}

/**
 * 将模板中的 {{variable}} 占位符替换为运行时上下文，未提供时保持原样或空字符串。
 */
export function renderPrompt(
  template: string,
  vars: Record<string, string | number | undefined> = {}
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (full, name: string) => {
    if (name in vars && vars[name] !== undefined) {
      return String(vars[name]);
    }
    return full;
  });
}

/**
 * 列出所有后台可管理的 Prompt 模板（按分类与键名排序）。
 */
export async function listPrompts(): Promise<PromptTemplate[]> {
  await seedDefaultPrompts();
  const rows = await db.select().from(schema.promptTemplates);
  return rows
    .map(toPromptTemplate)
    .sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));
}

/**
 * 查询指定 key 的 Prompt 详情及完整修订版本历史（按版本号倒序）。
 */
export async function getPromptDetail(key: string): Promise<{
  prompt: PromptTemplate;
  revisions: PromptRevision[];
  hasDefault: boolean;
} | null> {
  await seedDefaultPrompts();
  const row = await db
    .select()
    .from(schema.promptTemplates)
    .where(eq(schema.promptTemplates.key, key))
    .get();
  if (!row) return null;

  const revisionRows = await db
    .select()
    .from(schema.promptRevisions)
    .where(eq(schema.promptRevisions.promptId, row.id))
    .orderBy(desc(schema.promptRevisions.version));

  return {
    prompt: toPromptTemplate(row),
    revisions: revisionRows.map(toPromptRevision),
    hasDefault: Boolean(findDefaultPromptSeed(key)),
  };
}

/**
 * 更新 Prompt 并追加一条不可变修订快照，同时失效缓存立即生效。
 */
export async function updatePrompt(
  key: string,
  input: UpdatePromptInput,
  actor: string
): Promise<{ prompt: PromptTemplate; revisions: PromptRevision[] } | null> {
  await seedDefaultPrompts();
  const row = await db
    .select()
    .from(schema.promptTemplates)
    .where(eq(schema.promptTemplates.key, key))
    .get();
  if (!row) return null;

  const latestRev = await db
    .select()
    .from(schema.promptRevisions)
    .where(eq(schema.promptRevisions.promptId, row.id))
    .orderBy(desc(schema.promptRevisions.version))
    .get();

  const nextVersion = Math.max(row.activeVersion, latestRev?.version || 0) + 1;
  const now = new Date().toISOString();
  const nextTemperature = input.temperature ?? row.temperature;
  const nextMaxOutputTokens = input.maxOutputTokens ?? row.maxOutputTokens;

  await db
    .update(schema.promptTemplates)
    .set({
      name: input.name ?? row.name,
      description: input.description ?? row.description,
      content: input.content,
      temperature: nextTemperature,
      maxOutputTokens: nextMaxOutputTokens,
      isEnabled: input.isEnabled ?? row.isEnabled,
      activeVersion: nextVersion,
      updatedBy: actor,
      updatedAt: now,
    })
    .where(eq(schema.promptTemplates.id, row.id));

  await db.insert(schema.promptRevisions).values({
    id: crypto.randomUUID(),
    promptId: row.id,
    version: nextVersion,
    content: input.content,
    temperature: nextTemperature,
    maxOutputTokens: nextMaxOutputTokens,
    changeNote: input.changeNote?.trim() || "管理员调优更新",
    createdBy: actor,
    createdAt: now,
  });

  invalidatePromptCache(key);
  const detail = await getPromptDetail(key);
  return detail ? { prompt: detail.prompt, revisions: detail.revisions } : null;
}

/**
 * 回滚到指定历史版本号：写入一条新的线性审计版本快照以保持历史轨迹完整。
 */
export async function rollbackPrompt(
  key: string,
  targetVersion: number,
  actor: string
): Promise<
  | {
      prompt: PromptTemplate;
      revisions: PromptRevision[];
      restoredFromVersion: number;
    }
  | { error: "not_found" | "version_not_found" }
> {
  await seedDefaultPrompts();
  const row = await db
    .select()
    .from(schema.promptTemplates)
    .where(eq(schema.promptTemplates.key, key))
    .get();
  if (!row) return { error: "not_found" };

  const revisions = await db
    .select()
    .from(schema.promptRevisions)
    .where(eq(schema.promptRevisions.promptId, row.id))
    .orderBy(desc(schema.promptRevisions.version));

  const target = revisions.find((item) => item.version === targetVersion);
  if (!target) return { error: "version_not_found" };

  const nextVersion = Math.max(row.activeVersion, revisions[0]?.version || 0) + 1;
  const now = new Date().toISOString();

  await db
    .update(schema.promptTemplates)
    .set({
      content: target.content,
      temperature: target.temperature,
      maxOutputTokens: target.maxOutputTokens,
      activeVersion: nextVersion,
      updatedBy: actor,
      updatedAt: now,
    })
    .where(eq(schema.promptTemplates.id, row.id));

  await db.insert(schema.promptRevisions).values({
    id: crypto.randomUUID(),
    promptId: row.id,
    version: nextVersion,
    content: target.content,
    temperature: target.temperature,
    maxOutputTokens: target.maxOutputTokens,
    changeNote: `回滚恢复至 v${targetVersion}`,
    createdBy: actor,
    createdAt: now,
  });

  invalidatePromptCache(key);
  const detail = await getPromptDetail(key);
  if (!detail) return { error: "not_found" };
  return {
    prompt: detail.prompt,
    revisions: detail.revisions,
    restoredFromVersion: targetVersion,
  };
}

/**
 * 将指定 Prompt 重置为系统出厂默认内容与参数，并记录一条重置版本。
 */
export async function resetPromptToDefault(
  key: string,
  actor: string
): Promise<{ prompt: PromptTemplate; revisions: PromptRevision[] } | null> {
  const seed = findDefaultPromptSeed(key);
  if (!seed) return null;

  return updatePrompt(
    key,
    {
      name: seed.name,
      description: seed.description,
      content: seed.content,
      temperature: seed.temperature,
      maxOutputTokens: seed.maxOutputTokens,
      isEnabled: true,
      changeNote: "重置为系统出厂默认 Prompt",
    },
    actor
  );
}
