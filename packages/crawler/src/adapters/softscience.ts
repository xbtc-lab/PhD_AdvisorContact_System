import crypto from "node:crypto";
import vm from "node:vm";
import { db, eq, firstOrNull, schema } from "@app/db";
import type { RankTier } from "@app/shared";
import { CN_UNIVERSITY_DOMAINS } from "../data/cn-university-domains.js";
import { politeFetchHtml, politeFetchText } from "../fetchers/http-fetcher.js";
import { mergeWithLockedFields } from "../merger/field-lock.js";

export interface SoftScienceUniversityItem {
  rank: number;
  name: string;
  shortName: string;
  officialDomain: string;
  rankTier: RankTier;
  disciplineRankNote: string;
  tags: string[];
  province: string;
  category: string;
  score: number | null;
}

interface RawBcurRow {
  univNameCn?: string;
  ranking?: string | number;
  univTags?: string[];
  univCategory?: string;
  province?: string;
  score?: number;
}

interface RawBcsrRankRow {
  univNameCn?: string;
  ranking?: string | number;
  rankPctTop?: string;
}

function mapRankTier(rank: number, tags: string[]): RankTier {
  if (rank > 0 && rank <= 20) return "top20";
  if (tags.includes("双一流") || tags.includes("985") || tags.includes("211")) {
    return "double";
  }
  return "other";
}

function makeShortName(name: string): string {
  const known = CN_UNIVERSITY_DOMAINS[name]?.shortName;
  if (known) return known;
  return name.replace(/（.*?）|\(.*?\)/g, "").replace(/大学$|学院$/, "").slice(0, 6) || name;
}

/**
 * 抓取软科 BCUR 主榜 + BCSR 计算机学科榜(可选辅助标注)。
 * 严格携带 Referer 请求 payload.js，防 Tengine CDN Referer ACL 403。
 */
export async function fetchSoftScienceTop100(opts: {
  year?: number;
  limit?: number;
} = {}): Promise<{ year: number; items: SoftScienceUniversityItem[] }> {
  const year = opts.year ?? 2025;
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const pageUrl = `https://www.shanghairanking.cn/rankings/bcur/${year}`;

  const page = await politeFetchHtml(pageUrl, {
    timeoutMs: 15_000,
    followSplash: false,
    bypassRateLimit: true,
  });
  if (!page.ok) {
    throw new Error(`软科主榜页面抓取失败 (${pageUrl}): ${page.error || page.status}`);
  }

  const payloadMatch = page.html.match(/\/_nuxt\/static\/[^"']+payload\.js/);
  if (!payloadMatch) {
    throw new Error(`未能在软科 ${year} 页面中匹配到 payload.js 资源路径`);
  }

  const payloadUrl = `https://www.shanghairanking.cn${payloadMatch[0]}`;
  const jsRes = await politeFetchText(payloadUrl, {
    timeoutMs: 15_000,
    bypassRateLimit: true,
    headers: { Referer: pageUrl },
  });
  if (!jsRes.ok || !jsRes.text.trimStart().startsWith("__NUXT_JSONP__(")) {
    throw new Error(`软科 payload.js 请求失败 (${jsRes.status}): ${jsRes.error || jsRes.text.slice(0, 120)}`);
  }

  let captured: any = null;
  const sandbox = vm.createContext(
    Object.assign(Object.create(null), {
      __NUXT_JSONP__: (_path: string, data: unknown) => {
        captured = data;
      },
    }),
    { codeGeneration: { strings: false, wasm: false } }
  );
  vm.runInContext(jsRes.text, sandbox, { timeout: 800 });

  const rawList: RawBcurRow[] = captured?.data?.[0]?.univData || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("软科 payload.js 解析后未返回高校列表");
  }

  // 可选补充计算机学科 (0812) 排名作为初始备注
  const csRankMap = new Map<string, string>();
  try {
    const bcsr = await politeFetchText(
      `https://www.shanghairanking.cn/api/pub/v1/bcsr/rank?target_yr=${year}&subj_code=0812`,
      { timeoutMs: 8000, bypassRateLimit: true, headers: { Referer: "https://www.shanghairanking.cn/" } }
    );
    if (bcsr.ok) {
      const parsed = JSON.parse(bcsr.text) as { data?: { rankings?: RawBcsrRankRow[] } };
      for (const r of parsed.data?.rankings || []) {
        if (r.univNameCn && r.ranking) {
          const pct = r.rankPctTop ? ` (${r.rankPctTop})` : "";
          csRankMap.set(r.univNameCn.trim(), `计算机 #${r.ranking}${pct}`);
        }
      }
    }
  } catch {
    // 学科榜辅助信息失败不阻断主榜同步
  }

  const items: SoftScienceUniversityItem[] = [];
  for (const row of rawList) {
    const name = (row.univNameCn || "").trim();
    const rankNum = Number(row.ranking);
    if (!name || !Number.isFinite(rankNum) || rankNum <= 0) continue;
    if (items.length >= limit) break;

    const tags = Array.isArray(row.univTags) ? row.univTags.map(String) : [];
    const domainMeta = CN_UNIVERSITY_DOMAINS[name];
    const csNote = csRankMap.get(name);
    const tierNote = tags.filter((t) => t === "985" || t === "211" || t === "双一流").join(" · ");
    const disciplineRankNote = [csNote, tierNote].filter(Boolean).join(" | ");

    items.push({
      rank: rankNum,
      name,
      shortName: domainMeta?.shortName || makeShortName(name),
      officialDomain: domainMeta?.officialDomain || "",
      rankTier: mapRankTier(rankNum, tags),
      disciplineRankNote,
      tags,
      province: (row.province || "").trim(),
      category: (row.univCategory || "").trim(),
      score: typeof row.score === "number" ? row.score : null,
    });
  }

  return { year, items };
}

/**
 * 将软科 Top N 高校同步写入 catalog_universities（幂等 Upsert，严格遵守 manual_locked_fields）。
 */
export async function syncSoftScienceToDb(opts: {
  year?: number;
  limit?: number;
} = {}): Promise<{
  runId: string;
  year: number;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
}> {
  const startedAt = new Date().toISOString();
  const runId = `run_${crypto.randomUUID()}`;
  const year = opts.year ?? 2025;
  const limit = opts.limit ?? 100;

  await db.insert(schema.crawlRuns).values({
    id: runId,
    runKind: "softscience_sync",
    scope: "top100",
    aiMode: "rule_only",
    replaySnapshotsOnly: false,
    status: "running",
    totalPages: 1,
    startedAt,
  });

  try {
    const { items } = await fetchSoftScienceTop100({ year, limit });
    const now = new Date().toISOString();
    let insertedCount = 0;
    let updatedCount = 0;

    for (const item of items) {
      const existing = await firstOrNull(
        db
          .select()
          .from(schema.catalogUniversities)
          .where(eq(schema.catalogUniversities.name, item.name))
          .limit(1)
      );

      if (!existing) {
        await db.insert(schema.catalogUniversities).values({
          id: `uni-${crypto.randomBytes(6).toString("hex")}`,
          name: item.name,
          shortName: item.shortName,
          softScienceRank: item.rank,
          rankTier: item.rankTier,
          disciplineRankNote: item.disciplineRankNote,
          facultyPortalUrl: "",
          admissionUrl: "",
          sourceScope: "top100",
          officialDomain: item.officialDomain,
          portalBucket: "decentralized",
          adapterKey: "",
          healthStatus: "unprobed",
          enabled: true,
          customTags: item.tags,
          manualLockedFields: [],
          createdAt: now,
          updatedAt: now,
        });
        insertedCount += 1;
      } else {
        const patch = mergeWithLockedFields(
          existing,
          {
            shortName: CN_UNIVERSITY_DOMAINS[item.name]?.shortName || existing.shortName || item.shortName,
            softScienceRank: item.rank,
            rankTier: item.rankTier,
            disciplineRankNote: item.disciplineRankNote || existing.disciplineRankNote,
            sourceScope: "top100" as const,
            officialDomain: existing.officialDomain || item.officialDomain,
            customTags: item.tags.length > 0 ? item.tags : existing.customTags,
            updatedAt: now,
          },
          existing.manualLockedFields || []
        );

        await db
          .update(schema.catalogUniversities)
          .set(patch)
          .where(eq(schema.catalogUniversities.id, existing.id));
        updatedCount += 1;
      }
    }

    const finishedAt = new Date().toISOString();
    await db
      .update(schema.crawlRuns)
      .set({
        status: "succeeded",
        ruleParsed: items.length,
        summary: `软科 ${year} Top ${limit} 同步完成：新增 ${insertedCount} 所，更新 ${updatedCount} 所`,
        finishedAt,
      })
      .where(eq(schema.crawlRuns.id, runId));

    await db.insert(schema.crawlRunLogs).values({
      id: `log_${crypto.randomUUID()}`,
      runId,
      level: "info",
      url: `https://www.shanghairanking.cn/rankings/bcur/${year}`,
      message: `同步软科 ${year} Top ${items.length} 高校完成（新增 ${insertedCount}，更新 ${updatedCount}）`,
      createdAt: finishedAt,
    });

    return {
      runId,
      year,
      fetchedCount: items.length,
      insertedCount,
      updatedCount,
    };
  } catch (err: any) {
    const finishedAt = new Date().toISOString();
    await db
      .update(schema.crawlRuns)
      .set({
        status: "failed",
        errorCount: 1,
        summary: err?.message || "软科同步失败",
        finishedAt,
      })
      .where(eq(schema.crawlRuns.id, runId));
    await db.insert(schema.crawlRunLogs).values({
      id: `log_${crypto.randomUUID()}`,
      runId,
      level: "error",
      errorCategory: "upstream_failed",
      url: `https://www.shanghairanking.cn/rankings/bcur/${year}`,
      message: err?.message || "软科同步失败",
      createdAt: finishedAt,
    });
    throw err;
  }
}
