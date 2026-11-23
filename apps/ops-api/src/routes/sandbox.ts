import { Hono } from "hono";
import {
  crawlCollegeRuleFirst,
  extractAdvisorDetailFromHtml,
  extractFacultyListFromHtml,
  extractNoticesFromHtml,
  extractNoticesFromRssXml,
  politeFetchHtml,
  politeFetchText,
  validateImageUrl,
  type DictionarySets,
} from "@app/crawler";
import { db, schema } from "@app/db";
import { CrawlCollegeInputSchema, SandboxTestInputSchema } from "@app/shared";
import { recordOpsAudit } from "../middleware/ops-auth.js";

async function loadDictSets(): Promise<DictionarySets> {
  const rows = await db.select().from(schema.opsRuleDictionaries);
  const m = new Map(rows.map((r) => [r.kind, r.entries || []]));
  return {
    honorNational: m.get("honor_national"),
    honorProvincial: m.get("honor_provincial"),
    noticeWhitelist: m.get("notice_whitelist"),
    noticeBlacklist: m.get("notice_blacklist"),
  };
}

export function createSandboxRoutes() {
  const router = new Hono();

  router.post("/sandbox/test-url", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = SandboxTestInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const input = parsed.data;
    const dicts = await loadDictSets();

    if (input.mode === "notice_list" && /\.xml($|\?)|\/rss|feed/i.test(input.url)) {
      const xmlRes = await politeFetchText(input.url, { timeoutMs: 12_000, bypassRateLimit: true });
      if (xmlRes.ok && /<rss|<feed/i.test(xmlRes.text)) {
        const noticeRes = extractNoticesFromRssXml(xmlRes.text, xmlRes.finalUrl, dicts);
        return c.json({
          ok: true,
          diagnostics: {
            requestedUrl: input.url,
            finalUrl: xmlRes.finalUrl,
            status: xmlRes.status,
            cmsFingerprint: "unknown",
            charsetFixed: false,
            detectedCharset: "utf-8",
            wasWebVpnUnwrapped: false,
            splashFollowed: false,
            discoveredRssUrls: [xmlRes.finalUrl],
            elapsedMs: 0,
          },
          result: noticeRes,
        });
      }
    }

    const fetched = await politeFetchHtml(input.url, {
      timeoutMs: 14_000,
      bypassRateLimit: true,
    });

    if (!fetched.ok) {
      return c.json({
        ok: false,
        error: fetched.error || `目标页面返回 HTTP ${fetched.status}`,
        diagnostics: {
          requestedUrl: fetched.requestedUrl,
          finalUrl: fetched.finalUrl,
          status: fetched.status,
          cmsFingerprint: fetched.cmsFingerprint,
          charsetFixed: fetched.charsetFixed,
          detectedCharset: fetched.detectedCharset,
          wasWebVpnUnwrapped: fetched.wasWebVpnUnwrapped,
          splashFollowed: fetched.splashFollowed,
          discoveredRssUrls: fetched.discoveredRssUrls,
          elapsedMs: fetched.elapsedMs,
        },
      });
    }

    const diagnostics = {
      requestedUrl: fetched.requestedUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.status,
      cmsFingerprint: fetched.cmsFingerprint,
      charsetFixed: fetched.charsetFixed,
      detectedCharset: fetched.detectedCharset,
      wasWebVpnUnwrapped: fetched.wasWebVpnUnwrapped,
      splashFollowed: fetched.splashFollowed,
      discoveredRssUrls: fetched.discoveredRssUrls,
      elapsedMs: fetched.elapsedMs,
    };

    if (input.mode === "advisor_list") {
      const listRes = extractFacultyListFromHtml(fetched.html, fetched.finalUrl, {
        customSelector: input.customSelector,
        isPhdListContext: input.isPhdListContext,
      });
      return c.json({
        ok: true,
        diagnostics,
        result: {
          pageIsPhdList: listRes.pageIsPhdList,
          totalCandidates: listRes.candidates.length,
          candidates: listRes.candidates.slice(0, input.limit),
        },
      });
    }

    if (input.mode === "advisor_detail") {
      const detail = extractAdvisorDetailFromHtml(fetched.html, fetched.finalUrl, {
        isPhdListContext: input.isPhdListContext,
        dictionaries: dicts,
        rules: input.customSelector ? { nameSelector: input.customSelector } : null,
      });
      const verifiedPhotoUrl = detail.photoUrl
        ? await validateImageUrl(detail.photoUrl, { verifyRemote: true })
        : "";
      return c.json({
        ok: true,
        diagnostics,
        result: {
          ...detail,
          photoUrl: verifiedPhotoUrl,
          rawCandidatePhotoUrl: detail.photoUrl,
          photoFilteredOut: Boolean(detail.photoUrl && !verifiedPhotoUrl),
        },
      });
    }

    const notices = extractNoticesFromHtml(fetched.html, fetched.finalUrl, {
      customSelector: input.customSelector,
      dictionaries: dicts,
    });
    return c.json({
      ok: true,
      diagnostics,
      result: {
        ...notices,
        items: notices.items.slice(0, input.limit),
      },
    });
  });

  router.post("/crawl/college/:id", async (c) => {
    const collegeId = c.req.param("id");
    const raw = await c.req.json().catch(() => ({}));
    const parsed = CrawlCollegeInputSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.issues[0]?.message || "参数无效" }, 400);
    }

    const result = await crawlCollegeRuleFirst(collegeId, parsed.data);
    await recordOpsAudit("crawl_college", "catalog_college", collegeId, {
      runId: result.runId,
      advisorsUpserted: result.advisorsUpserted,
      noticesUpserted: result.noticesUpserted,
    });
    return c.json({ ok: true, ...result });
  });

  return router;
}
