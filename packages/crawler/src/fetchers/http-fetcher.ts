import crypto from "node:crypto";
import * as chardet from "chardet";
import * as cheerio from "cheerio";
import iconv from "iconv-lite";
import type { CmsFingerprint } from "@app/shared";
import { detectCmsFingerprint } from "./cms-detector.js";
import { defaultRateLimiter, type DomainRateLimiter } from "./rate-limiter.js";
import { assertPublicHttpUrl, normalizeUrl, unwrapWebVpnUrl } from "../utils/ssrf.js";

export const DEFAULT_CRAWLER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface PoliteFetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  followSplash?: boolean;
  bypassRateLimit?: boolean;
  rateLimiter?: DomainRateLimiter;
}

export interface FetchedHtmlResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  contentType: string;
  detectedCharset: string;
  charsetFixed: boolean;
  wasWebVpnUnwrapped: boolean;
  splashFollowed: boolean;
  cmsFingerprint: CmsFingerprint;
  discoveredRssUrls: string[];
  contentHash: string;
  elapsedMs: number;
  error?: string;
}

function decodeHtmlBuffer(buf: Buffer, headerContentType: string): {
  html: string;
  charset: string;
  charsetFixed: boolean;
} {
  const headerCharsetMatch = headerContentType.match(/charset=["']?([a-zA-Z0-9_-]+)/i);
  const asciiProbe = buf.subarray(0, 4096).toString("latin1");
  const metaCharsetMatch =
    asciiProbe.match(/<meta[^>]+charset=["']?\s*([a-zA-Z0-9_-]+)/i) ||
    asciiProbe.match(/charset=([a-zA-Z0-9_-]+)/i);

  let rawCharset = (headerCharsetMatch?.[1] || metaCharsetMatch?.[1] || "").toLowerCase();
  if (!rawCharset) {
    const guessed = chardet.detect(buf.subarray(0, 8192));
    rawCharset = (typeof guessed === "string" ? guessed : "").toLowerCase();
  }

  if (/gb2312|gbk|gb18030|gb_2312/.test(rawCharset)) {
    return {
      html: iconv.decode(buf, "gb18030"),
      charset: rawCharset || "gb18030",
      charsetFixed: true,
    };
  }

  if (rawCharset === "big5") {
    return {
      html: iconv.decode(buf, "big5"),
      charset: "big5",
      charsetFixed: true,
    };
  }

  return {
    html: buf.toString("utf8"),
    charset: rawCharset || "utf-8",
    charsetFixed: false,
  };
}

function findSplashRedirectTarget(html: string, currentUrl: string): string | null {
  if (html.length >= 8192) return null;
  const $ = cheerio.load(html);
  const links = $("a[href]");
  if (links.length === 0 || links.length > 20) return null;

  let fallbackTarget: string | null = null;
  let picked: string | null = null;
  links.each((_, el) => {
    if (picked) return;
    const text = $(el).text().trim();
    const href = ($(el).attr("href") || "").trim();
    const abs = normalizeUrl(href, currentUrl);
    if (!abs || abs === currentUrl) return;
    if (/中文网|中文版|进入主页|进入学院|点击进入|简体中文/.test(text)) {
      picked = abs;
      return;
    }
    if (!fallbackTarget && /\/main\.htm$/i.test(abs)) {
      fallbackTarget = abs;
    }
  });
  return picked || fallbackTarget;
}

function extractDiscoveredRssUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const found = new Set<string>();
  $("head link[rel~='alternate']").each((_, el) => {
    const type = ($(el).attr("type") || "").toLowerCase();
    const href = ($(el).attr("href") || "").trim();
    if ((type.includes("rss") || type.includes("atom") || type.includes("xml")) && href) {
      const abs = normalizeUrl(href, baseUrl);
      if (abs) found.add(abs);
    }
  });
  return [...found];
}

async function performSingleFetch(
  targetUrl: string,
  opts: PoliteFetchOptions
): Promise<{
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  buf: Buffer;
  error?: string;
}> {
  const safeUrl = await assertPublicHttpUrl(targetUrl);
  const limiter = opts.rateLimiter || defaultRateLimiter;
  const timeoutMs = opts.timeoutMs ?? 12_000;

  const exec = async () => {
    const resp = await fetch(safeUrl.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": DEFAULT_CRAWLER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...(opts.headers || {}),
      },
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    // Follow后校验最终跳转落地URL是否仍然合法
    await assertPublicHttpUrl(resp.url);
    return {
      finalUrl: resp.url,
      status: resp.status,
      ok: resp.ok,
      contentType: resp.headers.get("content-type") || "",
      buf,
    };
  };

  try {
    const res = opts.bypassRateLimit
      ? await exec()
      : await limiter.schedule(safeUrl.hostname, exec);
    if (res.ok) {
      limiter.recordSuccess(safeUrl.hostname);
    } else if (res.status >= 500 || res.status === 403 || res.status === 429) {
      limiter.recordFailure(safeUrl.hostname);
    }
    return res;
  } catch (err: any) {
    limiter.recordFailure(safeUrl.hostname);
    return {
      finalUrl: safeUrl.toString(),
      status: 0,
      ok: false,
      contentType: "",
      buf: Buffer.alloc(0),
      error: err?.message || "网络请求失败",
    };
  }
}

/**
 * 礼貌抓取静态 HTML：内置 WebVPN 还原、SSRF 防护、域限速、GBK 转码、过渡页自动跟随与 RSS 头探测。
 */
export async function politeFetchHtml(
  rawUrl: string,
  opts: PoliteFetchOptions = {}
): Promise<FetchedHtmlResult> {
  const t0 = Date.now();
  const unwrapped = unwrapWebVpnUrl(rawUrl);

  let first: Awaited<ReturnType<typeof performSingleFetch>>;
  try {
    first = await performSingleFetch(unwrapped.url, opts);
  } catch (err: any) {
    return {
      requestedUrl: rawUrl,
      finalUrl: unwrapped.url,
      status: 0,
      ok: false,
      html: "",
      contentType: "",
      detectedCharset: "utf-8",
      charsetFixed: false,
      wasWebVpnUnwrapped: unwrapped.unwrapped,
      splashFollowed: false,
      cmsFingerprint: "unknown",
      discoveredRssUrls: [],
      contentHash: "",
      elapsedMs: Date.now() - t0,
      error: err?.message || "请求初始化失败",
    };
  }
  if (!first.ok && first.buf.length === 0) {
    return {
      requestedUrl: rawUrl,
      finalUrl: first.finalUrl,
      status: first.status,
      ok: false,
      html: "",
      contentType: first.contentType,
      detectedCharset: "utf-8",
      charsetFixed: false,
      wasWebVpnUnwrapped: unwrapped.unwrapped,
      splashFollowed: false,
      cmsFingerprint: first.status === 202 ? "ruishu_waf" : "unknown",
      discoveredRssUrls: [],
      contentHash: "",
      elapsedMs: Date.now() - t0,
      error: first.error || `HTTP ${first.status}`,
    };
  }

  let decoded = decodeHtmlBuffer(first.buf, first.contentType);
  let activeUrl = first.finalUrl;
  let activeStatus = first.status;
  let activeOk = first.ok;
  let activeContentType = first.contentType;
  let splashFollowed = false;

  if (opts.followSplash !== false && activeOk) {
    const splashTarget = findSplashRedirectTarget(decoded.html, activeUrl);
    if (splashTarget) {
      try {
        const second = await performSingleFetch(splashTarget, opts);
        if (second.ok && second.buf.length > decoded.html.length) {
          decoded = decodeHtmlBuffer(second.buf, second.contentType);
          activeUrl = second.finalUrl;
          activeStatus = second.status;
          activeOk = second.ok;
          activeContentType = second.contentType;
          splashFollowed = true;
        }
      } catch {
        // 过渡页跟随失败则保留原页面
      }
    }
  }

  const cmsFingerprint = detectCmsFingerprint(decoded.html, activeStatus, activeUrl);
  const discoveredRssUrls = extractDiscoveredRssUrls(decoded.html, activeUrl);
  const contentHash = crypto.createHash("sha256").update(decoded.html, "utf8").digest("hex");

  return {
    requestedUrl: rawUrl,
    finalUrl: activeUrl,
    status: activeStatus,
    ok: activeOk,
    html: decoded.html,
    contentType: activeContentType,
    detectedCharset: decoded.charset,
    charsetFixed: decoded.charsetFixed,
    wasWebVpnUnwrapped: unwrapped.unwrapped,
    splashFollowed,
    cmsFingerprint,
    discoveredRssUrls,
    contentHash,
    elapsedMs: Date.now() - t0,
    error: activeOk ? undefined : `HTTP ${activeStatus}`,
  };
}

/**
 * 礼貌抓取 JSON / JS / RSS XML 文本（支持自定义 Referer）。
 */
export async function politeFetchText(
  rawUrl: string,
  opts: PoliteFetchOptions = {}
): Promise<{
  ok: boolean;
  status: number;
  finalUrl: string;
  text: string;
  contentType: string;
  error?: string;
}> {
  const unwrapped = unwrapWebVpnUrl(rawUrl);
  const limiter = opts.rateLimiter || defaultRateLimiter;
  const timeoutMs = opts.timeoutMs ?? 12_000;

  try {
    const safeUrl = await assertPublicHttpUrl(unwrapped.url);
    const exec = async () => {
      const resp = await fetch(safeUrl.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": DEFAULT_CRAWLER_UA,
          Accept: "application/json, application/rss+xml, application/xml, text/javascript, */*",
          ...(opts.headers || {}),
        },
      });
      const text = await resp.text();
      await assertPublicHttpUrl(resp.url);
      return {
        ok: resp.ok,
        status: resp.status,
        finalUrl: resp.url,
        text,
        contentType: resp.headers.get("content-type") || "",
      };
    };
    return opts.bypassRateLimit ? await exec() : await limiter.schedule(safeUrl.hostname, exec);
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      finalUrl: unwrapped.url,
      text: "",
      contentType: "",
      error: err?.message || "请求失败",
    };
  }
}

const IMAGE_BLACKLIST_RE =
  /_visitcount|visitcount|\/favicon|favicon\.|logo|banner|qrcode|erweima|weixin|wechat|spacer|1x1|blank\.gif|\.svg($|\?)/i;

/**
 * 过滤苏迪统计像素等非肖像 URL，并校验远程响应确为非 SVG 图片，防止头像裂图。
 */
export async function validateImageUrl(
  rawUrl: string,
  opts: { verifyRemote?: boolean; timeoutMs?: number } = {}
): Promise<string> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized || IMAGE_BLACKLIST_RE.test(normalized)) {
    return "";
  }
  if (!opts.verifyRemote) {
    return normalized;
  }

  try {
    const safeUrl = await assertPublicHttpUrl(normalized);
    const timeoutMs = opts.timeoutMs ?? 5000;
    let resp = await fetch(safeUrl.toString(), {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": DEFAULT_CRAWLER_UA },
    });
    if (resp.status === 405 || resp.status === 403 || !resp.headers.get("content-type")) {
      resp = await fetch(safeUrl.toString(), {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": DEFAULT_CRAWLER_UA,
          Range: "bytes=0-64",
        },
      });
    }
    if (!resp.ok) return "";
    const ct = (resp.headers.get("content-type") || "").toLowerCase();
    if (!ct.startsWith("image/") || ct.includes("svg")) {
      return "";
    }
    return normalized;
  } catch {
    return "";
  }
}
