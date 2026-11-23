import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, getStorageRoot, schema } from "@app/db";

const DEV_TOKEN_FILENAME = ".dev-admin.token";
export const OPS_SESSION_COOKIE = "phd_ops_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolvedOpsToken {
  token: string;
  source: "env" | "dev-file";
  tokenFilePath?: string;
}

export function resolveOpsAdminToken(): ResolvedOpsToken {
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
    // 读取失败时重新生成
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  const generated = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(tokenFilePath, `${generated}\n`, { encoding: "utf-8", mode: 0o600 });
  return { token: generated, source: "dev-file", tokenFilePath };
}

export function ensureOpsTokenInitialized(): ResolvedOpsToken {
  const resolved = resolveOpsAdminToken();
  if (resolved.source === "dev-file" && resolved.tokenFilePath) {
    console.log(`[ops-api] 本地管理员登录令牌位于: ${resolved.tokenFilePath}`);
  } else {
    console.log("[ops-api] 已启用环境变量 ADMIN_API_TOKEN 管理员鉴权");
  }
  return resolved;
}

function deriveSigningSecret(token: string): Buffer {
  return crypto.createHmac("sha256", token).update("phd-cue-ops-session-v1").digest();
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a, "utf8").digest();
  const hb = crypto.createHash("sha256").update(b, "utf8").digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function createSignedSessionCookie(token: string): string {
  const exp = Date.now() + SESSION_TTL_MS;
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${exp}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", deriveSigningSecret(token))
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedSessionCookie(cookieVal: string | undefined, token: string): boolean {
  if (!cookieVal) return false;
  const parts = cookieVal.split(".");
  if (parts.length !== 3) return false;
  const [expStr, nonce, sig] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !nonce || !sig) return false;
  const expectedSig = crypto
    .createHmac("sha256", deriveSigningSecret(token))
    .update(`${expStr}.${nonce}`)
    .digest("hex");
  return timingSafeEqualStr(sig, expectedSig);
}

export function issueOpsSessionCookie(c: Context, token: string): void {
  const val = createSignedSessionCookie(token);
  const proto = c.req.header("x-forwarded-proto") || "";
  const isHttps = proto === "https" || c.req.url.startsWith("https://");
  setCookie(c, OPS_SESSION_COOKIE, val, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: isHttps,
  });
}

export function clearOpsSessionCookie(c: Context): void {
  deleteCookie(c, OPS_SESSION_COOKIE, { path: "/" });
}

export function isRequestAuthenticated(c: Context): {
  authenticated: boolean;
  via: "cookie" | "header" | "none";
} {
  const resolved = resolveOpsAdminToken();
  const cookieVal = getCookie(c, OPS_SESSION_COOKIE);
  if (verifySignedSessionCookie(cookieVal, resolved.token)) {
    return { authenticated: true, via: "cookie" };
  }

  const headerToken = c.req.header("x-admin-token")?.trim();
  if (headerToken && timingSafeEqualStr(headerToken, resolved.token)) {
    return { authenticated: true, via: "header" };
  }

  const auth = c.req.header("authorization")?.trim() || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const bearer = auth.slice(7).trim();
    if (bearer && timingSafeEqualStr(bearer, resolved.token)) {
      return { authenticated: true, via: "header" };
    }
  }

  return { authenticated: false, via: "none" };
}

export const requireOpsAdmin: MiddlewareHandler = async (c, next) => {
  const status = isRequestAuthenticated(c);
  if (!status.authenticated) {
    return c.json(
      { ok: false, error: "需要运营管理端管理员身份认证（请登录或携带 X-Admin-Token）" },
      401
    );
  }
  await next();
};

export async function recordOpsAudit(
  action: string,
  entityType = "",
  entityId = "",
  detailJson: Record<string, unknown> | null = null
): Promise<void> {
  const resolved = resolveOpsAdminToken();
  const actor = resolved.source === "env" ? "admin:env" : "admin:local";
  await db.insert(schema.opsAuditLogs).values({
    id: `audit_${crypto.randomUUID()}`,
    actor,
    action,
    entityType,
    entityId,
    detailJson,
    createdAt: new Date().toISOString(),
  });
}
