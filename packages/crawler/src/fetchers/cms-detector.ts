import type { CmsFingerprint } from "@app/shared";

/**
 * 基于 HTML 结构与 HTTP 状态码识别高校网站站群 CMS 与反爬挑战指纹。
 */
export function detectCmsFingerprint(
  html: string,
  status: number,
  finalUrl: string
): CmsFingerprint {
  if (
    status === 202 ||
    status === 412 ||
    /FSSBBIl1Ugzb|\$_ts\s*=|4Qb8|window\._\$[a-z0-9]{2,}\s*=/.test(html)
  ) {
    return "ruishu_waf";
  }

  if (
    /vsb_|_jsq_\(|\/system\/resource\/|wbtreeid|virtual_attach_file\.vsb/i.test(html) ||
    /urltype=tree\.TreeTempUrl/i.test(finalUrl)
  ) {
    return "boda_vsb";
  }

  if (
    /webplus|\/_upload\/tpl|wp_article|\/_wp3services|sudy/i.test(html) ||
    /\/list\.htm|\/main\.htm/i.test(finalUrl)
  ) {
    return "sudi_webplus";
  }

  try {
    const host = new URL(finalUrl).hostname.toLowerCase();
    if (/^(faculty|teacher|jszy|gr|person|homepage|tutor)\./.test(host)) {
      return "unified_portal";
    }
  } catch {
    // ignore malformed URL
  }

  if (html.trim().length > 1500) {
    return "custom_static";
  }
  return "unknown";
}
