import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
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
    if (low.startsWith("::ffff:")) {
      return isPrivateIp(low.slice(7));
    }
    return false;
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("请输入合法的网页 URL（需以 http:// 或 https:// 开头）");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持抓取 http:// 或 https:// 公开网页");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("安全策略禁止访问本地或内网地址");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error("安全策略禁止访问内网 IP 地址");
    }
    return parsed;
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records.length || records.some((r) => isPrivateIp(r.address))) {
      throw new Error("目标域名解析到内网或受限 IP，已拦截访问");
    }
  } catch (err: any) {
    if (err?.message?.includes("拦截") || err?.message?.includes("禁止")) {
      throw err;
    }
    throw new Error(`域名解析失败：${hostname}`);
  }
  return parsed;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
});

export async function fetchWebpageMarkdown(rawUrl: string): Promise<string> {
  const url = await assertPublicHttpUrl(rawUrl);

  const resp = await fetch(url.toString(), {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  });

  if (!resp.ok) {
    throw new Error(`目标网页返回 HTTP ${resp.status}，建议直接在浏览器打开网页全选复制文字粘贴导入`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, .footer, .navbar").remove();

  // Preserve absolute hrefs for email/homepage extraction
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
      try {
        const abs = new URL(href, url.toString()).toString();
        $(el).attr("href", abs);
      } catch {
        // ignore malformed href
      }
    }
  });

  const mainHtml =
    $("main").html() || $("article").html() || $("body").html() || $.html();
  const md = turndown.turndown(mainHtml || "");
  const compacted = md
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!compacted) {
    throw new Error("网页未返回可解析文本（可能是前端动态渲染页），请直接打开网页复制文字粘贴到输入框");
  }
  return compacted.slice(0, 18000);
}
