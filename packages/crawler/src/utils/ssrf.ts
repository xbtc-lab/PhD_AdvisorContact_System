import dns from "node:dns/promises";
import net from "node:net";

const dnsSafetyCache = new Map<string, { safe: boolean; expiresAt: number }>();
const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * 校验 IPv4 / IPv6 是否属于内网、回环、链路本地或保留地址段（SSRF 拦截）。
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // Proxy Fake-IP / benchmark
    if (a >= 224) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) return true;
    if (low.startsWith("::ffff:")) return isPrivateIp(low.slice(7));
    return false;
  }
  return true;
}

export interface UnwrapWebVpnResult {
  url: string;
  originalUrl: string;
  unwrapped: boolean;
}

/**
 * 还原高校公开页中偶发的校园 WebVPN / iVPN 代理链接为可直接公网访问的目标地址。
 * 例：http://homepage-hit-edu-cn.ivpn.hit.edu.cn:1080/xuxiaofei -> https://homepage.hit.edu.cn/xuxiaofei
 */
export function unwrapWebVpnUrl(rawUrl: string): UnwrapWebVpnResult {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    const vpnMatch = parsed.hostname.match(
      /^([a-z0-9-]+)\.(?:ivpn|webvpn)\.[a-z0-9.-]+$/i
    );
    if (vpnMatch) {
      const slug = vpnMatch[1].toLowerCase();
      if (/(?:-edu-cn|-org-cn|-ac-cn|-com-cn|-net-cn|-edu)$/.test(slug)) {
        const restoredHost = slug.replace(/-/g, ".");
        const restored = new URL(parsed.pathname + parsed.search, `https://${restoredHost}`);
        return { url: restored.toString(), originalUrl: trimmed, unwrapped: true };
      }
    }
  } catch {
    // 非合法 URL 留给后续严格校验报错
  }
  return { url: trimmed, originalUrl: trimmed, unwrapped: false };
}

/**
 * 强校验外链为可公开抓取的 HTTP(S) 地址，禁止访问 localhost / 内网段。
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error(`无效 URL：${rawUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`仅支持 http/https 协议，已拦截：${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(`安全策略禁止访问本地或内网域名：${hostname}`);
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error(`安全策略禁止访问内网 IP：${hostname}`);
    }
    return parsed;
  }

  const now = Date.now();
  const cached = dnsSafetyCache.get(hostname);
  if (cached && cached.expiresAt > now) {
    if (!cached.safe) {
      throw new Error(`目标域名解析到内网 IP，已拦截：${hostname}`);
    }
    return parsed;
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    dnsSafetyCache.set(hostname, { safe: false, expiresAt: now + DNS_CACHE_TTL_MS });
    throw new Error(`域名无法解析或解析到受限 IP：${hostname}`);
  }

  dnsSafetyCache.set(hostname, { safe: true, expiresAt: now + DNS_CACHE_TTL_MS });
  return parsed;
}

/**
 * 规范化绝对链接并剔除页内锚点（保留真实查询参数，如 Boda wbtreeid）。
 */
export function normalizeUrl(rawHref: string, baseUrl?: string): string {
  const cleaned = rawHref.trim();
  if (!cleaned || cleaned.startsWith("javascript:") || cleaned.startsWith("mailto:") || cleaned.startsWith("tel:") || cleaned.startsWith("#")) {
    return "";
  }
  try {
    const resolved = baseUrl ? new URL(cleaned, baseUrl) : new URL(cleaned);
    resolved.hash = "";
    return unwrapWebVpnUrl(resolved.toString()).url;
  } catch {
    return "";
  }
}
