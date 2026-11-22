import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Context, MiddlewareHandler } from "hono";
import { getStorageRoot } from "@app/db";

const DEV_TOKEN_FILENAME = ".dev-admin.token";

export interface ResolvedAdminToken {
  token: string;
  source: "env" | "dev-file";
  tokenFilePath?: string;
}

/**
 * 解析当前管理员鉴权令牌。
 * 优先级：环境变量 ADMIN_API_TOKEN > 本地持久化文件 storage/.dev-admin.token（首次启动自动生成）。
 * 绝不回退为硬编码弱口令，确保本地调试也有独立随机凭证。
 */
export function resolveExpectedAdminToken(): ResolvedAdminToken {
  const envToken = process.env.ADMIN_API_TOKEN?.trim();
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  const storageRoot = getStorageRoot();
  const tokenFilePath = path.join(storageRoot, DEV_TOKEN_FILENAME);

  try {
    if (fs.existsSync(tokenFilePath)) {
      const existing = fs.readFileSync(tokenFilePath, "utf-8").trim();
      if (existing.length >= 16) {
        return { token: existing, source: "dev-file", tokenFilePath };
      }
    }
  } catch {
    // 读取异常时重新生成一份可用令牌
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  const generated = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(tokenFilePath, `${generated}\n`, {
    encoding: "utf-8",
    mode: 0o600,
  });

  return { token: generated, source: "dev-file", tokenFilePath };
}

/**
 * 在 cloud-core 启动时初始化本地开发管理员令牌文件，
 * 并在控制台仅提示令牌存放路径（避免在公共日志中直接打印明文密钥）。
 */
export function ensureAdminTokenInitialized(): ResolvedAdminToken {
  const resolved = resolveExpectedAdminToken();
  if (resolved.source === "dev-file" && resolved.tokenFilePath) {
    console.log(
      `[cloud-core] 未配置 ADMIN_API_TOKEN，本地管理员开发令牌已写入: ${resolved.tokenFilePath}`
    );
  } else {
    console.log("[cloud-core] 管理员 Prompt 接口已启用环境变量 ADMIN_API_TOKEN 鉴权");
  }
  return resolved;
}

/**
 * 使用 SHA-256 摘要后再执行 timingSafeEqual，避免因长度不同直接提前返回造成时序侧信道。
 */
function timingSafeTokenEqual(provided: string, expected: string): boolean {
  const digestA = crypto.createHash("sha256").update(provided, "utf-8").digest();
  const digestB = crypto.createHash("sha256").update(expected, "utf-8").digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function extractRequestAdminToken(c: Context): string {
  const headerToken = c.req.header("x-admin-token")?.trim();
  if (headerToken) return headerToken;

  const authHeader = c.req.header("authorization")?.trim() || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

/**
 * 获取当前管理员操作标识，便于记录版本审计日志。
 */
export function getAdminActor(): string {
  const resolved = resolveExpectedAdminToken();
  return resolved.source === "env" ? "admin:env" : "admin:local";
}

/**
 * Hono 管理员路由守卫中间件：校验 X-Admin-Token 或 Authorization Bearer。
 * 未携带返回 401，校验不通过返回 403。
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const provided = extractRequestAdminToken(c);
  if (!provided) {
    return c.json(
      {
        ok: false,
        error: "需要管理员身份令牌（请通过 X-Admin-Token 请求头提供）",
      },
      401
    );
  }

  const expected = resolveExpectedAdminToken();
  if (!timingSafeTokenEqual(provided, expected.token)) {
    return c.json(
      {
        ok: false,
        error: "管理员令牌校验失败，无权访问 Prompt 管理接口",
      },
      403
    );
  }

  await next();
};
