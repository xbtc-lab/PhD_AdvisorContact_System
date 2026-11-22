import { createDeepSeek } from "@ai-sdk/deepseek";
import { db, decryptSecret, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";

export interface ResolvedAiRuntime {
  provider: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  model: ReturnType<ReturnType<typeof createDeepSeek>>;
}

export async function resolveAiRuntime(overrides?: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<ResolvedAiRuntime> {
  const settings = await firstOrNull(
    db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .limit(1)
  );

  const storedKey = settings?.encryptedAiApiKey
    ? decryptSecret(settings.encryptedAiApiKey)
    : "";
  const apiKey =
    (overrides?.apiKey || "").trim() ||
    storedKey ||
    (process.env.DEEPSEEK_API_KEY || "").trim();

  if (!apiKey) {
    throw new Error("尚未配置 DeepSeek API Key，请先打开「设置 → DeepSeek AI」填入密钥。");
  }

  const baseUrl = (
    overrides?.baseUrl ||
    settings?.aiBaseUrl ||
    process.env.AI_BASE_URL ||
    "https://api.deepseek.com"
  )
    .trim()
    .replace(/\/+$/, "");

  const modelId = (
    overrides?.model ||
    settings?.aiModel ||
    process.env.AI_MODEL ||
    "deepseek-chat"
  ).trim();

  const deepseekProvider = createDeepSeek({
    apiKey,
    baseURL: baseUrl,
  });

  return {
    provider: settings?.aiProvider || "deepseek",
    baseUrl,
    modelId,
    apiKey,
    model: deepseekProvider(modelId),
  };
}

export function extractJsonObject(rawText: string): Record<string, unknown> {
  const s = (rawText || "").trim();
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    // continue
  }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  return {};
}

export function formatFriendlyAiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "未知 AI 请求错误");
  if (msg.includes("401") || msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("invalid api key")) {
    return "DeepSeek API Key 无效或已过期（401），请核对后重试。";
  }
  if (msg.includes("402") || msg.toLowerCase().includes("insufficient balance")) {
    return "DeepSeek 账户余额不足（402），请先前往开放平台充值。";
  }
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
    return "DeepSeek 请求频率或并发超限（429），请稍等几秒再试。";
  }
  return msg;
}
