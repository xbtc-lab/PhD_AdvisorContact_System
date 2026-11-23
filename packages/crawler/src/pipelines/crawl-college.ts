import crypto from "node:crypto";
import { db, eq, firstOrNull, schema } from "@app/db";
import type { CrawlCollegeInput } from "@app/shared";
import {
  extractAdvisorDetailFromHtml,
  extractFacultyListFromHtml,
  extractNoticesFromHtml,
  extractNoticesFromRssXml,
  type DictionarySets,
} from "../extractors/rules.js";
import { politeFetchHtml, politeFetchText, validateImageUrl } from "../fetchers/http-fetcher.js";
import { mergeWithLockedFields } from "../merger/field-lock.js";

export interface CrawlCollegeRunResult {
  runId: string;
  collegeId: string;
  universityName: string;
  collegeName: string;
  totalPages: number;
  hashSkipped: number;
  advisorsUpserted: number;
  noticesUpserted: number;
  phdNoticesMatched: number;
  errors: number;
  summary: string;
}

async function loadDictionaries(): Promise<DictionarySets> {
  const rows = await db.select().from(schema.opsRuleDictionaries);
  const byKind = new Map(rows.map((r) => [r.kind, r.entries || []]));
  return {
    honorNational: byKind.get("honor_national"),
    honorProvincial: byKind.get("honor_provincial"),
    noticeWhitelist: byKind.get("notice_whitelist"),
    noticeBlacklist: byKind.get("notice_blacklist"),
  };
}

/**
 * 单学院 Rule-First（¥0 费用）闭环采集编排器：
 * 1. 抓取师资列表页（含列表+详情上下文合并、SHA-256 增量跳过、头像过滤校验、博导默认在招判定）；
 * 2. 可选抓取学院通知公告栏（支持 HTML 日期锚点/无日期兜底/RSS 可选策略）；
 * 3. 全程遵守 manualLockedFields 防覆盖，并记录 crawl_snapshots / crawl_runs / crawl_run_logs。
 */
export async function crawlCollegeRuleFirst(
  collegeId: string,
  input: Partial<CrawlCollegeInput> = {}
): Promise<CrawlCollegeRunResult> {
  const college = await firstOrNull(
    db
      .select()
      .from(schema.catalogColleges)
      .where(eq(schema.catalogColleges.id, collegeId))
      .limit(1)
  );
  if (!college) {
    throw new Error(`未找到学院记录：${collegeId}`);
  }

  const uni = await firstOrNull(
    db
      .select()
      .from(schema.catalogUniversities)
      .where(eq(schema.catalogUniversities.id, college.universityId))
      .limit(1)
  );
  if (!uni) {
    throw new Error(`未找到所属高校记录：${college.universityId}`);
  }

  const maxAdvisors = Math.min(Math.max(input.maxAdvisors ?? 25, 1), 200);
  const crawlNotices = input.crawlNotices ?? true;
  const validatePhotos = input.validatePhotos ?? true;

  const startedAt = new Date().toISOString();
  const runId = `run_${crypto.randomUUID()}`;
  await db.insert(schema.crawlRuns).values({
    id: runId,
    runKind: "college_crawl",
    scope: `${uni.name} · ${college.name}`,
    aiMode: "rule_only",
    replaySnapshotsOnly: false,
    status: "running",
    startedAt,
  });

  const appendLog = async (
    level: "info" | "warn" | "error",
    message: string,
    url = "",
    errorCategory = ""
  ) => {
    await db.insert(schema.crawlRunLogs).values({
      id: `log_${crypto.randomUUID()}`,
      runId,
      level,
      errorCategory,
      universityId: uni.id,
      collegeId: college.id,
      url,
      message,
      createdAt: new Date().toISOString(),
    });
  };

  let totalPages = 0;
  let hashSkipped = 0;
  let advisorsUpserted = 0;
  let noticesUpserted = 0;
  let phdNoticesMatched = 0;
  let errorCount = 0;

  try {
    const dictionaries = await loadDictionaries();
    const listUrl = college.facultyListUrl || college.collegeUrl;

    // 1. 抓取师资列表 + 详情
    if (listUrl && college.facultyStrategy !== "paused") {
      const listFetch = await politeFetchHtml(listUrl, { timeoutMs: 14_000 });
      totalPages += 1;
      if (!listFetch.ok) {
        errorCount += 1;
        await appendLog(
          "error",
          `师资列表抓取失败 (${listFetch.status || listFetch.error})`,
          listUrl,
          listFetch.cmsFingerprint === "ruishu_waf" ? "403_blocked" : "timeout"
        );
      } else {
        await appendLog(
          "info",
          `师资列表抓回成功 (${listFetch.cmsFingerprint}${listFetch.charsetFixed ? ", 已转码" : ""})`,
          listFetch.finalUrl
        );
        const listRes = extractFacultyListFromHtml(listFetch.html, listFetch.finalUrl, {
          customSelector: college.facultyRuleJson?.detailLinkSelector || college.facultyRuleJson?.listItemSelector,
          isPhdListContext: college.facultyRuleJson?.isPhdListContext,
        });

        const targets = listRes.candidates.slice(0, maxAdvisors);
        await appendLog("info", `提取到 ${listRes.candidates.length} 名候选导师，本轮处理前 ${targets.length} 名`, listFetch.finalUrl);

        for (const item of targets) {
          const detailFetch = await politeFetchHtml(item.url, { timeoutMs: 12_000 });
          totalPages += 1;
          const now = new Date().toISOString();

          if (!detailFetch.ok) {
            errorCount += 1;
            await appendLog(
              "warn",
              `导师详情抓回失败 [${item.name}]: ${detailFetch.error || detailFetch.status}`,
              item.url,
              detailFetch.status === 403 ? "403_blocked" : "timeout"
            );
            continue;
          }

          const sourceKey = `${uni.id}::${detailFetch.finalUrl}`;
          const existingAdv = await firstOrNull(
            db
              .select()
              .from(schema.catalogAdvisors)
              .where(eq(schema.catalogAdvisors.sourceKey, sourceKey))
              .limit(1)
          );

          // 写入或更新 crawl_snapshots 缓存
          const existingSnap = await firstOrNull(
            db
              .select()
              .from(schema.crawlSnapshots)
              .where(eq(schema.crawlSnapshots.url, detailFetch.finalUrl))
              .limit(1)
          );

          if (existingAdv && existingAdv.contentHash === detailFetch.contentHash) {
            hashSkipped += 1;
            continue;
          }

          const parsed = extractAdvisorDetailFromHtml(detailFetch.html, detailFetch.finalUrl, {
            fallbackName: item.name,
            fallbackDept: college.name,
            contextEmail: item.contextEmail,
            contextTitle: item.contextTitle,
            isPhdListContext: item.isPhdContext || listRes.pageIsPhdList,
            dictionaries,
            rules: college.facultyRuleJson,
          });

          const verifiedPhotoUrl = parsed.photoUrl
            ? await validateImageUrl(parsed.photoUrl, { verifyRemote: validatePhotos })
            : "";

          if (!existingSnap) {
            await db.insert(schema.crawlSnapshots).values({
              id: `snap_${crypto.randomUUID()}`,
              url: detailFetch.finalUrl,
              entityType: "advisor_detail",
              universityId: uni.id,
              collegeId: college.id,
              httpStatus: detailFetch.status,
              contentHash: detailFetch.contentHash,
              prunedMarkdown: parsed.prunedMarkdown,
              extractedJson: parsed as unknown as Record<string, unknown>,
              status: "parsed",
              fetchedAt: now,
              parsedAt: now,
            });
          } else {
            await db
              .update(schema.crawlSnapshots)
              .set({
                httpStatus: detailFetch.status,
                contentHash: detailFetch.contentHash,
                prunedMarkdown: parsed.prunedMarkdown,
                extractedJson: parsed as unknown as Record<string, unknown>,
                status: "parsed",
                fetchedAt: now,
                parsedAt: now,
              })
              .where(eq(schema.crawlSnapshots.id, existingSnap.id));
          }

          const incomingPatch = {
            collegeId: college.id,
            name: parsed.name,
            dept: parsed.dept || college.name,
            title: parsed.title,
            honorBadge: parsed.honorBadge,
            honorCategory: parsed.honorCategory,
            bio: parsed.bio,
            researchTags: parsed.researchTags,
            email: parsed.email,
            homepageUrl: detailFetch.finalUrl,
            photoUrl: verifiedPhotoUrl,
            photoSource: verifiedPhotoUrl ? "official" : "",
            kpiOutputsHero: parsed.kpiOutputsHero,
            kpiOutputsNote: "科研产出（官网公开主页）",
            kpiGrantsHero: parsed.honorBadge ? `${parsed.honorBadge} · 官网公开` : "官网公开课题方向",
            kpiGrantsNote: "科研项目与重要荣誉",
            kpiQuotaHero: parsed.kpiQuotaHero,
            kpiQuotaNote: "博士招生判断",
            recruitOpen: parsed.recruitOpen,
            isPhdSupervisor: parsed.isPhdSupervisor,
            recruitmentStatus: parsed.recruitmentStatus,
            recruitmentSignalNote: parsed.recruitmentSignalNote,
            footerNote: parsed.footerNote,
            defaultFitScore: Math.min(96, Math.max(70, parsed.qualityScore)),
            contentHash: detailFetch.contentHash,
            extractModeUsed: "rule",
            needsAi: parsed.needsAi,
            qualityScore: parsed.qualityScore,
            reviewStatus: parsed.reviewStatus,
            reviewReasons: parsed.reviewReasons,
            sourceUpdatedAt: now.slice(0, 7),
            crawledAt: now,
            updatedAt: now,
          };

          if (!existingAdv) {
            await db.insert(schema.catalogAdvisors).values({
              id: `cat-adv-${crypto.randomBytes(6).toString("hex")}`,
              universityId: uni.id,
              sourceKey,
              ...incomingPatch,
              createdAt: now,
            });
          } else {
            const safePatch = mergeWithLockedFields(
              existingAdv,
              incomingPatch,
              existingAdv.manualLockedFields || []
            );
            await db
              .update(schema.catalogAdvisors)
              .set(safePatch)
              .where(eq(schema.catalogAdvisors.id, existingAdv.id));
          }

          advisorsUpserted += 1;
        }
      }
    }

    // 2. 抓取学院通知公告（支持 date_anchor / undated_list / 可选 rss_feed）
    const noticeUrl = college.noticeListUrl;
    if (crawlNotices && noticeUrl && college.noticeStrategy !== "paused") {
      totalPages += 1;
      let noticeRes = null;

      if (college.noticeStrategy === "rss_feed") {
        const rssRes = await politeFetchText(noticeUrl, { timeoutMs: 10_000 });
        if (rssRes.ok && /<rss|<feed/i.test(rssRes.text)) {
          noticeRes = extractNoticesFromRssXml(rssRes.text, rssRes.finalUrl, dictionaries);
        }
      }

      if (!noticeRes) {
        const htmlRes = await politeFetchHtml(noticeUrl, { timeoutMs: 12_000 });
        if (!htmlRes.ok) {
          errorCount += 1;
          await appendLog("warn", `通知列表抓回失败 (${htmlRes.status || htmlRes.error})`, noticeUrl, "timeout");
        } else {
          noticeRes = extractNoticesFromHtml(htmlRes.html, htmlRes.finalUrl, {
            customSelector: college.noticeRuleJson?.noticeItemSelector,
            dictionaries,
          });
          await appendLog(
            "info",
            `公告提取完成 [${noticeRes.mode}]: 总提取 ${noticeRes.totalExtracted} 条，命中博士相关 ${noticeRes.phdMatchedCount} 条`,
            htmlRes.finalUrl
          );
        }
      }

      if (noticeRes) {
        const now = new Date().toISOString();
        const phdNotices = noticeRes.items.filter((n) => n.isPhdRelated);
        phdNoticesMatched = phdNotices.length;

        for (const n of phdNotices) {
          const existingNotice = await firstOrNull(
            db
              .select()
              .from(schema.catalogNotices)
              .where(eq(schema.catalogNotices.sourceUrl, n.url))
              .limit(1)
          );
          if (!existingNotice) {
            await db.insert(schema.catalogNotices).values({
              id: `notice_${crypto.randomBytes(6).toString("hex")}`,
              universityId: uni.id,
              collegeId: college.id,
              sourceUrl: n.url,
              title: n.title,
              publishedAt: n.publishedAt,
              matchedKeywords: n.matchedKeywords,
              reviewStatus: "pending",
              crawledAt: now,
              createdAt: now,
              updatedAt: now,
            });
            noticesUpserted += 1;
          }
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const nextHealth = errorCount > 0 && advisorsUpserted === 0 ? "degraded" : "healthy";
    await db
      .update(schema.catalogColleges)
      .set({
        healthStatus: nextHealth,
        lastFacultyCrawlAt: finishedAt,
        lastNoticeCrawlAt: crawlNotices && noticeUrl ? finishedAt : college.lastNoticeCrawlAt,
        consecutiveEmptyRuns: advisorsUpserted === 0 && listUrl ? college.consecutiveEmptyRuns + 1 : 0,
        updatedAt: finishedAt,
      })
      .where(eq(schema.catalogColleges.id, college.id));

    if (nextHealth === "healthy" && (advisorsUpserted > 0 || noticesUpserted > 0)) {
      await db
        .update(schema.catalogUniversities)
        .set({ healthStatus: "healthy", lastProbedAt: finishedAt, updatedAt: finishedAt })
        .where(eq(schema.catalogUniversities.id, uni.id));
    }

    const summary = `${uni.name} · ${college.name}：入库/更新导师 ${advisorsUpserted} 位（Hash跳过 ${hashSkipped}），招博通知新增 ${noticesUpserted} 条（AI调用 0 · ¥0.00）`;
    await db
      .update(schema.crawlRuns)
      .set({
        status: errorCount > 0 && advisorsUpserted === 0 ? "partial" : "succeeded",
        totalPages,
        hashSkipped,
        ruleParsed: advisorsUpserted + noticesUpserted,
        aiCalls: 0,
        noticesFound: phdNoticesMatched,
        errorCount,
        actualCostCny: 0,
        summary,
        finishedAt,
      })
      .where(eq(schema.crawlRuns.id, runId));

    return {
      runId,
      collegeId: college.id,
      universityName: uni.name,
      collegeName: college.name,
      totalPages,
      hashSkipped,
      advisorsUpserted,
      noticesUpserted,
      phdNoticesMatched,
      errors: errorCount,
      summary,
    };
  } catch (err: any) {
    const finishedAt = new Date().toISOString();
    await appendLog("error", err?.message || "学院抓取执行异常", college.facultyListUrl, "unexpected");
    await db
      .update(schema.crawlRuns)
      .set({
        status: "failed",
        errorCount: errorCount + 1,
        summary: err?.message || "抓取失败",
        finishedAt,
      })
      .where(eq(schema.crawlRuns.id, runId));
    throw err;
  }
}
