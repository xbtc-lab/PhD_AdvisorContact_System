import * as cheerio from "cheerio";
import type { CmsFingerprint, PortalBucket, ProbeUniversityInput } from "@app/shared";
import { politeFetchHtml } from "../fetchers/http-fetcher.js";
import { normalizeUrl } from "../utils/ssrf.js";

export interface ProbedSubdomainHit {
  url: string;
  finalUrl: string;
  status: number;
  cmsFingerprint: CmsFingerprint;
}

export interface ProbedCollegeCandidate {
  name: string;
  collegeUrl: string;
  disciplineCategory: string;
  facultyListUrl: string;
  noticeListUrl: string;
  cmsFingerprint: CmsFingerprint;
  rssUrls: string[];
}

export interface ProbeUniversityResult {
  name: string;
  officialDomain: string;
  suggestedPortalBucket: PortalBucket;
  facultyPortal: ProbedSubdomainHit | null;
  admissionPortal: ProbedSubdomainHit | null;
  colleges: ProbedCollegeCandidate[];
  rssUrls: string[];
  notes: string[];
}

const FACULTY_PORTAL_PREFIXES = ["faculty", "teacher", "jszy", "gr", "homepage", "person"];
const ADMISSION_PORTAL_PREFIXES = ["yz", "yzb", "gs", "grs", "yjsy"];

const FACULTY_NAV_RE =
  /博士(?:研究)?生?导师|师资队伍|师资状况|师资力量|教师名录|专任教师|教师队伍|导师队伍|博导/;
const NOTICE_NAV_RE = /博士招生|研究生招生|招生信息|通知公告|学院公告|研招信息/;
const DEPT_DIRECTORY_RE = /院系设置|学院导航|教学单位|组织机构|学部与学院|二级学院/;
const COLLEGE_NAME_RE = /(学院|学部|研究院|研究所|书院|中心|系)$/;

function stripDomainInput(raw: string): string {
  const cleaned = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return cleaned.replace(/^www\./i, "").toLowerCase();
}

function getRootDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split(".").filter(Boolean);
  if (parts.length >= 3 && (parts[parts.length - 2] === "edu" || parts[parts.length - 2] === "ac")) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function inferDisciplineCategory(collegeName: string): string {
  if (/计算机|软件|网络空间|人工智能|大数据|信息安全|智能/.test(collegeName)) return "计算机/信息";
  if (/电子|微电子|通信|光电|自动化|控制|仪器/.test(collegeName)) return "电子/自动化";
  if (/数学|物理|化学|生命|生物|统计/.test(collegeName)) return "理学/生科";
  if (/机械|材料|能源|土木|建筑|环境|航空|航天/.test(collegeName)) return "工学/材料";
  if (/经济|管理|法学|金融|商学院/.test(collegeName)) return "经管/法学";
  if (/医学|药学|临床|口腔/.test(collegeName)) return "医学";
  return "";
}

async function probeFirstReachableSubdomain(
  prefixes: string[],
  rootDomain: string
): Promise<ProbedSubdomainHit | null> {
  if (!rootDomain) return null;
  const results = await Promise.all(
    prefixes.map(async (prefix) => {
      const candidate = `https://${prefix}.${rootDomain}/`;
      const res = await politeFetchHtml(candidate, {
        timeoutMs: 5500,
        bypassRateLimit: true,
        followSplash: false,
      });
      if (res.ok && res.html.length > 400) {
        return {
          url: candidate,
          finalUrl: res.finalUrl,
          status: res.status,
          cmsFingerprint: res.cmsFingerprint,
        } satisfies ProbedSubdomainHit;
      }
      return null;
    })
  );
  return results.find(Boolean) || null;
}

function discoverNavUrlsFromHtml(
  html: string,
  baseUrl: string
): { facultyListUrl: string; noticeListUrl: string } {
  const $ = cheerio.load(html);
  let facultyListUrl = "";
  let phdSpecificUrl = "";
  let noticeListUrl = "";
  let phdNoticeUrl = "";

  $("a[href]").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const href = normalizeUrl($(el).attr("href") || "", baseUrl);
    if (!href || text.length === 0 || text.length > 26) return;

    if (/博士(?:研究)?生?导师|博导/.test(text) && !phdSpecificUrl) {
      phdSpecificUrl = href;
    } else if (FACULTY_NAV_RE.test(text) && !facultyListUrl) {
      facultyListUrl = href;
    }

    if (/博士招生|直博|硕博/.test(text) && !phdNoticeUrl) {
      phdNoticeUrl = href;
    } else if (NOTICE_NAV_RE.test(text) && !noticeListUrl) {
      noticeListUrl = href;
    }
  });

  return {
    facultyListUrl: phdSpecificUrl || facultyListUrl,
    noticeListUrl: phdNoticeUrl || noticeListUrl,
  };
}

/**
 * 探测高校官网的统一教师门户、研究生招生网、二级学院列表，以及指定学院的师资/公告入口与 RSS 声明。
 */
export async function probeUniversity(
  input: ProbeUniversityInput
): Promise<ProbeUniversityResult> {
  const notes: string[] = [];
  const rssUrls = new Set<string>();
  const colleges: ProbedCollegeCandidate[] = [];

  let domain = stripDomainInput(input.officialDomain || "");
  if (!domain && input.collegeUrl) {
    try {
      domain = getRootDomain(new URL(input.collegeUrl).hostname);
    } catch {
      domain = "";
    }
  }
  if (!domain && input.facultyListUrl) {
    try {
      domain = getRootDomain(new URL(input.facultyListUrl).hostname);
    } catch {
      domain = "";
    }
  }

  let facultyPortal: ProbedSubdomainHit | null = null;
  let admissionPortal: ProbedSubdomainHit | null = null;

  // 1. 全校高频子域名并发探测（若非跳过模式）
  if (domain && !input.skipSubdomainProbe) {
    const [fp, ap] = await Promise.all([
      probeFirstReachableSubdomain(FACULTY_PORTAL_PREFIXES, domain),
      probeFirstReachableSubdomain(ADMISSION_PORTAL_PREFIXES, domain),
    ]);
    facultyPortal = fp;
    admissionPortal = ap;
    if (fp) notes.push(`发现统一教师门户：${fp.finalUrl} (${fp.cmsFingerprint})`);
    if (ap) notes.push(`发现研究生/招生站点：${ap.finalUrl}`);
  }

  // 2. 若用户直接给出了特定学院主页 / 师资页 / 公告页（常见于手动扩展或单院系探测）
  if (input.collegeUrl || input.facultyListUrl || input.noticeListUrl) {
    let cms: CmsFingerprint = "unknown";
    let discoveredFaculty = input.facultyListUrl || "";
    let discoveredNotice = input.noticeListUrl || "";
    const targetUrl = input.collegeUrl || input.facultyListUrl || input.noticeListUrl;
    let inferredName = "";

    if (targetUrl) {
      const page = await politeFetchHtml(targetUrl, { timeoutMs: 10_000, bypassRateLimit: true });
      if (page.ok) {
        cms = page.cmsFingerprint;
        for (const r of page.discoveredRssUrls) rssUrls.add(r);
        const $ = cheerio.load(page.html);
        const title = $("title").text().replace(/\s+/g, " ").trim();
        inferredName =
          title.split(/[-_|—]/)[0]?.replace(input.name, "").trim() || "";
        const nav = discoverNavUrlsFromHtml(page.html, page.finalUrl);
        if (!discoveredFaculty) discoveredFaculty = nav.facultyListUrl;
        if (!discoveredNotice) discoveredNotice = nav.noticeListUrl;
        if (page.splashFollowed) notes.push(`自动穿过学院过渡引导页 -> ${page.finalUrl}`);
        if (page.charsetFixed) notes.push(`已自动修正历史编码 (${page.detectedCharset} -> UTF-8)`);
      } else {
        notes.push(`指定 URL 探测返回异常 (${page.status || page.error}): ${targetUrl}`);
      }
    }

    const colName = inferredName && COLLEGE_NAME_RE.test(inferredName) ? inferredName : "计算机/目标学院";
    colleges.push({
      name: colName,
      collegeUrl: input.collegeUrl || targetUrl,
      disciplineCategory: inferDisciplineCategory(colName),
      facultyListUrl: discoveredFaculty,
      noticeListUrl: discoveredNotice,
      cmsFingerprint: cms,
      rssUrls: [...rssUrls],
    });
  } else if (domain && !input.skipSubdomainProbe) {
    // 3. 整校主站查找“院系设置/学院导航”
    const home = await politeFetchHtml(`https://www.${domain}/`, {
      timeoutMs: 9000,
      bypassRateLimit: true,
    });
    if (home.ok) {
      const $home = cheerio.load(home.html);
      let dirUrl = "";
      $home("a[href]").each((_, el) => {
        if (dirUrl) return;
        const txt = $home(el).text().replace(/\s+/g, " ").trim();
        if (DEPT_DIRECTORY_RE.test(txt)) {
          dirUrl = normalizeUrl($home(el).attr("href") || "", home.finalUrl);
        }
      });

      const scanHtml = dirUrl
        ? (await politeFetchHtml(dirUrl, { timeoutMs: 9000, bypassRateLimit: true })).html || home.html
        : home.html;
      const scanBase = dirUrl || home.finalUrl;
      const $scan = cheerio.load(scanHtml);
      const seen = new Set<string>();

      $scan("a[href]").each((_, el) => {
        if (colleges.length >= 60) return;
        const text = $scan(el).text().replace(/\s+/g, " ").trim();
        const href = normalizeUrl($scan(el).attr("href") || "", scanBase);
        if (!text || !href || text.length < 3 || text.length > 28) return;
        if (!COLLEGE_NAME_RE.test(text)) return;
        if (/研究生院|继续教育|网络教育|校友会|图书馆|招生就业/.test(text)) return;
        try {
          const host = new URL(href).hostname.toLowerCase();
          if (!host.endsWith(domain)) return;
        } catch {
          return;
        }
        if (seen.has(text)) return;
        seen.add(text);

        colleges.push({
          name: text,
          collegeUrl: href,
          disciplineCategory: inferDisciplineCategory(text),
          facultyListUrl: "",
          noticeListUrl: "",
          cmsFingerprint: "unknown",
          rssUrls: [],
        });
      });

      if (colleges.length > 0) {
        notes.push(`从官网导航发现 ${colleges.length} 个二级学院/教学单位候选`);
      } else {
        notes.push("官网首页未自动提取出明确院系列表，建议直接在「添加学院」或「跳过探测」填入目标院系 URL");
      }
    } else {
      notes.push(`主站 https://www.${domain}/ 暂不可达 (${home.status || home.error})`);
    }
  }

  let suggestedPortalBucket: PortalBucket = "decentralized";
  if (facultyPortal) {
    suggestedPortalBucket =
      facultyPortal.cmsFingerprint === "boda_vsb" ? "boda_cms" : "unified_api";
  } else if (colleges.some((c) => c.cmsFingerprint === "boda_vsb")) {
    suggestedPortalBucket = "boda_cms";
  } else if (input.skipSubdomainProbe) {
    suggestedPortalBucket = "custom";
  }

  return {
    name: input.name,
    officialDomain: domain,
    suggestedPortalBucket,
    facultyPortal,
    admissionPortal,
    colleges,
    rssUrls: [...rssUrls],
    notes,
  };
}
