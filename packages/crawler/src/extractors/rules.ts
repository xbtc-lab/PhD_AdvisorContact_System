import * as cheerio from "cheerio";
import type { HonorCategory, OpsRuleConfig, RecruitmentStatus } from "@app/shared";
import { normalizeUrl } from "../utils/ssrf.js";

export interface FacultyListCandidate {
  name: string;
  url: string;
  contextEmail: string;
  contextTitle: string;
  isPhdContext: boolean;
}

export interface FacultyListExtractResult {
  pageIsPhdList: boolean;
  candidates: FacultyListCandidate[];
}

export interface ExtractedAdvisorDetail {
  url: string;
  name: string;
  dept: string;
  title: string;
  honorBadge: string;
  honorCategory: HonorCategory;
  bio: string;
  researchTags: string[];
  email: string;
  photoUrl: string;
  isPhdSupervisor: boolean;
  recruitmentStatus: RecruitmentStatus;
  recruitmentSignalNote: string;
  recruitOpen: boolean;
  kpiOutputsHero: string;
  kpiQuotaHero: string;
  footerNote: string;
  prunedMarkdown: string;
  qualityScore: number;
  needsAi: boolean;
  reviewStatus: "auto_published" | "needs_review";
  reviewReasons: string[];
}

export interface ExtractedNoticeItem {
  title: string;
  url: string;
  publishedAt: string;
  matchedKeywords: string[];
  isPhdRelated: boolean;
}

export interface NoticeExtractResult {
  mode: "date_anchor" | "undated_list" | "custom_selector" | "rss_feed";
  clusterSignature: string;
  totalExtracted: number;
  phdMatchedCount: number;
  items: ExtractedNoticeItem[];
}

export interface DictionarySets {
  honorNational?: string[];
  honorProvincial?: string[];
  noticeWhitelist?: string[];
  noticeBlacklist?: string[];
}

const DEFAULT_HONOR_NATIONAL = [
  "中国科学院院士",
  "中国工程院院士",
  "国家杰出青年",
  "国家杰青",
  "长江学者",
  "国家优秀青年",
  "国家优青",
  "海外优青",
  "万人计划",
  "国家级领军人才",
  "国家重点研发计划首席",
];

const DEFAULT_HONOR_PROVINCIAL = [
  "省学术和技术带头人",
  "天府青城计划",
  "江苏六大人才高峰",
  "特聘教授",
  "东方学者",
  "珠江学者",
  "楚天学者",
  "泰山学者",
  "青年拔尖人才",
  "香江学者",
];

const DEFAULT_NOTICE_WHITELIST = [
  "博士",
  "直博",
  "硕博连读",
  "申请-考核",
  "申请考核",
  "少干",
  "骨干计划",
  "工程博士",
  "补录",
  "综合考核",
  "招生简章",
  "招生说明",
  "博士研究生",
];

const DEFAULT_NOTICE_BLACKLIST = [
  "采购",
  "招标",
  "中标",
  "维修",
  "工会",
  "党日",
  "党支部",
  "党建",
  "运动会",
  "放假",
  "值班",
  "物业",
  "后勤",
  "食堂",
  "报销",
  "迎新",
  "军训",
  "秋游",
];

const FACULTY_CHROME_NOISE_RE =
  /^(首页|学院概况|学院领导|组织架构|组织机构|师资概况|师资队伍|师资力量|师资状况|专任教师|教师名录|教师队伍|博士(?:研究)?生?导师|硕士生导师|科研团队|学科建设|人才培养|科学研究|合作交流|招生信息|招生就业|新闻动态|通知公告|联系我们|关于我们|校友会|党建工作|教研系列|研究系列|实验系列|客座教授|兼职教授|退休教师|中文信息|英文信息|个人主页|教师主页|教师详情|师资详情|导师简介|详细内容|正文|返回首页|上一页|下一页|尾页|更多|more|english|home|faculty|people|news|events)$/i;

const UNIVERSITY_MAILBOX_BLACKLIST_RE =
  /^(webmaster|admin|postmaster|noreply|no-reply|info|contact|service|sjxx|xzxx|xxgk|xcb|office|hr|dean)@/i;

function extractEmailsFromRaw(rawText: string, $?: cheerio.CheerioAPI): string[] {
  const found = new Set<string>();

  if ($) {
    $("a[href^='mailto:']").each((_, el) => {
      const mail = ($(el).attr("href") || "")
        .replace(/^mailto:/i, "")
        .split("?")[0]
        .trim()
        .toLowerCase();
      if (/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(mail) && !UNIVERSITY_MAILBOX_BLACKLIST_RE.test(mail)) {
        found.add(mail);
      }
    });
  }

  // 先归一化 [at]/(at)/（at）/ # / [dot] 等常见高校邮箱防爬写法
  const normalizedText = rawText
    .replace(/&\#64;|&#x40;|&commat;/gi, "@")
    .replace(/&\#46;|&#x2e;/gi, ".")
    .replace(/\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|（\s*at\s*）|\s+at\s+|#)\s*/gi, "@")
    .replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|（\s*dot\s*）)\s*/gi, ".");

  const matches = normalizedText.match(/[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const m of matches) {
    const email = m.toLowerCase().replace(/[.,;:)）]+$/, "");
    if (
      !UNIVERSITY_MAILBOX_BLACKLIST_RE.test(email) &&
      !/\.(png|jpg|jpeg|gif|css|js)$/i.test(email) &&
      email.length <= 64
    ) {
      found.add(email);
    }
  }
  return [...found];
}

function cleanPersonName(raw: string): string {
  let s = raw
    .replace(/\s+/g, " ")
    .replace(/（.*?）|\(.*?\)/g, "")
    .replace(/(教授|副教授|研究员|副研究员|讲师|助理教授|博士生导师|博导)$/g, "")
    .trim();
  // 如果像 "张三 - 计算机学院" 则取首段
  if (/[-|—·]/.test(s)) {
    const first = s.split(/[-|—·]/)[0]?.trim() || "";
    if (first.length >= 2 && first.length <= 16) s = first;
  }
  return s;
}

function looksLikePersonName(text: string): boolean {
  const s = cleanPersonName(text);
  if (!s || s.length < 2 || s.length > 24) return false;
  if (FACULTY_CHROME_NOISE_RE.test(s)) return false;
  if (/\d{4}|http|@|学院|大学|中心|重点实验室|通知|公告|简章|办法|点击/.test(s)) return false;
  // 纯中文名（2–5字）或常见英文学者名
  return /^[\u4e00-\u9fa5·]{2,5}$/.test(s) || /^[A-Za-z][A-Za-z.\s-]{3,22}$/.test(s);
}

/**
 * 抽取师资列表页中的导师详情链接，并保留列表行内的上下文邮箱、职称和“博导专页”标记（用于三源合并）。
 */
export function extractFacultyListFromHtml(
  html: string,
  baseUrl: string,
  opts: { customSelector?: string; isPhdListContext?: boolean } = {}
): FacultyListExtractResult {
  const $ = cheerio.load(html);
  const headingText = [
    $("title").text(),
    $("h1, h2, .crumb, .breadcrumb, .pos, .location, .title").text(),
  ].join(" ");
  const pageIsPhdList =
    Boolean(opts.isPhdListContext) || /博士(?:研究)?生?导师|博导名录/.test(headingText);

  if (!opts.customSelector) {
    $("nav, footer, .nav, .navbar, .footer, .top-nav, .header-nav, script, style").remove();
  }

  const baseHost = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  const seenUrls = new Set<string>();
  const candidates: FacultyListCandidate[] = [];
  const linkSelector = opts.customSelector?.trim() || "main a[href], article a[href], table a[href], ul a[href], .content a[href], body a[href]";

  $(linkSelector).each((_, el) => {
    const rawText = $(el).text().replace(/\s+/g, " ").trim();
    const href = ($(el).attr("href") || "").trim();
    const abs = normalizeUrl(href, baseUrl);
    if (!abs || abs === baseUrl || !looksLikePersonName(rawText)) return;

    try {
      const u = new URL(abs);
      if (u.pathname === "/" && !u.search) return;
      // 允许本校域或统一教师门户跳转
      if (baseHost && u.hostname !== baseHost && !/(faculty|teacher|jszy|gr|homepage|person|ai\.)/.test(u.hostname)) {
        const baseParts = baseHost.split(".").slice(-3).join(".");
        if (!u.hostname.endsWith(baseParts)) return;
      }
      if (/\/list\.(htm|jsp)|tzgg|zsxx|index\.htm$/i.test(u.pathname) && !/teacher|faculty|people/i.test(abs)) {
        return;
      }
    } catch {
      return;
    }

    if (seenUrls.has(abs)) return;
    seenUrls.add(abs);

    const rowContainer = $(el).closest("tr, li, .item, .teacher-item, .card");
    const rowText = rowContainer.length ? rowContainer.text().replace(/\s+/g, " ") : "";
    const rowEmails = rowText ? extractEmailsFromRaw(rowText) : [];
    const titleMatch = rowText.match(
      /(讲席教授|特聘教授|二级教授|兼职教授|客座教授|名誉教授|长聘教授|长聘副教授|准聘副教授|助理教授|副教授|教授|副研究员|研究员|讲师)/
    );

    candidates.push({
      name: cleanPersonName(rawText),
      url: abs,
      contextEmail: rowEmails[0] || "",
      contextTitle: titleMatch?.[1] || "",
      isPhdContext: pageIsPhdList || /博导|博士(?:研究)?生?导师/.test(rowText),
    });
  });

  return { pageIsPhdList, candidates };
}

function extractTitleAndDept(text: string): { title: string; dept: string } {
  const titleMatch = text.match(
    /(讲席教授|特聘教授|二级教授|兼职教授|客座教授|名誉教授|长聘教授|长聘副教授|准聘副教授|助理教授|副教授|教授|正高级工程师|高级工程师|副研究员|研究员|讲师)/
  );
  const deptMatch = text.match(
    /(?:所在(?:学院|单位|系所|教研室)|工作单位|所属院系|学院)\s*[:：]\s*([^\s,，。；;|]{3,28})/
  );
  return {
    title: titleMatch?.[1] || "",
    dept: deptMatch?.[1] || "",
  };
}

function matchHonor(text: string, dicts?: DictionarySets): { badge: string; category: HonorCategory } {
  const natList = dicts?.honorNational?.length ? dicts.honorNational : DEFAULT_HONOR_NATIONAL;
  for (const h of natList) {
    if (h && text.includes(h)) {
      return { badge: h, category: "national" };
    }
  }
  const provList = dicts?.honorProvincial?.length ? dicts.honorProvincial : DEFAULT_HONOR_PROVINCIAL;
  for (const h of provList) {
    if (h && text.includes(h)) {
      return { badge: h, category: "provincial" };
    }
  }
  return { badge: "", category: "regular" };
}

function resolveRecruitmentState(params: {
  fullText: string;
  title: string;
  isPhdListContext: boolean;
}): {
  isPhdSupervisor: boolean;
  recruitmentStatus: RecruitmentStatus;
  recruitmentSignalNote: string;
  recruitOpen: boolean;
  kpiQuotaHero: string;
  footerNote: string;
} {
  const { fullText, title, isPhdListContext } = params;
  const negativeMatch = fullText.match(
    /(已退休|荣休|退休教授|暂停招收?博士|本年度不招收博士|不再招收博士|博士名额已满|停招博士|仅招硕士)/
  );
  const hasExplicitPhdTitle =
    isPhdListContext ||
    /博士(?:研究)?生?导师|博士生指导教师|博导|Ph\.?D\.?\s*Supervisor|Doctoral\s+Supervisor/i.test(
      `${title} ${fullText}`
    );
  const hasSeniorAcademicTitle =
    /^(?:讲席教授|特聘教授|二级教授|长聘教授|长聘副教授|准聘副教授|教授|研究员)$/.test(
      title.trim()
    );

  if (negativeMatch) {
    return {
      isPhdSupervisor: hasExplicitPhdTitle || hasSeniorAcademicTitle,
      recruitmentStatus: "explicitly_closed",
      recruitmentSignalNote: `检测到停招/退休信号：${negativeMatch[1]}`,
      recruitOpen: false,
      kpiQuotaHero: `暂不招博 (${negativeMatch[1]})`,
      footerNote: `检测到「${negativeMatch[1]}」提示，暂不建议作为当年博士首选投递`,
    };
  }

  const explicitPositiveMatch = fullText.match(
    /((?:20\d{2})\s*年?(?:度)?(?:拟)?招收?博士[^。\n]{0,24}|拟招博士\s*\d+\s*名?|尚有博士(?:招生)?名额|欢迎(?:对[^。\n]{0,16})?报考(?:本|我)?(?:团队|课题组|中心)?博士|常年招收?博士(?:研究生)?|招收\s*博士(?:研究生)?[^。\n]{0,18})/
  );
  if (explicitPositiveMatch) {
    const phrase = explicitPositiveMatch[1].replace(/\s+/g, " ").trim().slice(0, 32);
    return {
      isPhdSupervisor: true,
      recruitmentStatus: "confirmed_open",
      recruitmentSignalNote: `明确招博信号：${phrase}`,
      recruitOpen: true,
      kpiQuotaHero: phrase,
      footerNote: `明确招博 · ${phrase}`,
    };
  }

  if (hasExplicitPhdTitle) {
    return {
      isPhdSupervisor: true,
      recruitmentStatus: "phd_default_open",
      recruitmentSignalNote: isPhdListContext
        ? "来自学院博士生导师专页，按博导默认常规在招判定"
        : "主页注明博导/博士生导师资格，按博导默认常规在招判定",
      recruitOpen: true,
      kpiQuotaHero: "常规招博（博导默认在招）",
      footerNote: "博导默认在招 · 建议发信附带研究设想核实当年指标",
    };
  }

  if (hasSeniorAcademicTitle) {
    return {
      isPhdSupervisor: true,
      recruitmentStatus: "phd_default_open",
      recruitmentSignalNote: "正高/长聘职称默认具备博导资格，按常规在招判定",
      recruitOpen: true,
      kpiQuotaHero: "常规招博（正高/博导默认在招）",
      footerNote: "博导默认在招 · 建议发信附带研究设想核实当年指标",
    };
  }

  return {
    isPhdSupervisor: false,
    recruitmentStatus: "unknown",
    recruitmentSignalNote: "主页未识别到明确博导资格或招博声明",
    recruitOpen: false,
    kpiQuotaHero: "未注明博导 / 待核实",
    footerNote: "主页未明确标注博导资格 · 建议人工核实招生资格后投递",
  };
}

function extractResearchTags(text: string): string[] {
  const tags = new Set<string>();
  const sectionMatch = text.match(
    /(?:主要研究方向|研究方向|研究领域|科研方向|Research Interests?)\s*[:：]?\s*([^\n]{4,140})/i
  );
  if (sectionMatch?.[1]) {
    const tokens = sectionMatch[1]
      .split(/[、,，;；/｜|\n]/)
      .map((s) => s.replace(/^\d+[.)、]\s*/, "").trim())
      .filter((s) => s.length >= 2 && s.length <= 22 && !/^[：:]/.test(s));
    for (const t of tokens) {
      tags.add(t);
      if (tags.size >= 5) break;
    }
  }
  return [...tags];
}

function pruneAdvisorText(rawText: string): {
  prunedMarkdown: string;
  paperCount: number;
  bio: string;
} {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const keptLines: string[] = [];
  let paperCount = 0;
  let consecutivePubs = 0;

  for (const line of lines) {
    const looksLikePaper =
      /^(?:\[\d+\]|\d+[.、]\s+.{15,}(?:19|20)\d{2}|[A-Z][a-z]+,\s+[A-Z].*(?:IEEE|ACM|Springer|CVPR|ICML|NeurIPS|Nature|Science))/.test(
        line
      );
    if (looksLikePaper) {
      paperCount += 1;
      consecutivePubs += 1;
      if (consecutivePubs <= 5) {
        keptLines.push(line);
      } else if (consecutivePubs === 6) {
        keptLines.push("...（其余论文清单已按 Rule-First DOM 剪枝折叠）...");
      }
      continue;
    }
    consecutivePubs = 0;
    keptLines.push(line);
  }

  const prunedMarkdown = keptLines.join("\n").slice(0, 6000);
  const bioLines = keptLines.filter(
    (l) => l.length >= 12 && !l.startsWith("...") && !/首页|上一篇|下一篇|版权所有/.test(l)
  );
  const bio = bioLines.slice(0, 3).join(" · ").slice(0, 220);

  return { prunedMarkdown, paperCount, bio };
}

const PHOTO_URL_REJECT_RE =
  /_visitcount|visitcount|favicon|logo|banner|qrcode|erweima|weixin|wechat|\.svg($|\?)|spacer|1x1|blank\.gif|head02\.png/i;

function extractCandidatePhoto($: cheerio.CheerioAPI, baseUrl: string): string {
  const imgs = $(
    "main img, article img, .content img, .teacher img, .profile img, .article img, table img, body img"
  );
  let best = "";
  imgs.each((_, el) => {
    if (best) return;
    const src =
      $(el).attr("src") || $(el).attr("data-original") || $(el).attr("data-src") || "";
    const abs = normalizeUrl(src, baseUrl);
    if (!abs || PHOTO_URL_REJECT_RE.test(abs)) return;
    const alt = ($(el).attr("alt") || "").trim();
    const cls = ($(el).attr("class") || "").toLowerCase();
    const w = Number($(el).attr("width") || 0);
    if (w > 0 && w < 45) return;
    if (/logo|二维码|微信|关注|badge/i.test(alt + cls)) return;
    best = abs;
  });
  return best;
}

/**
 * 纯规则提取单页导师详情（零 LLM 费用）：含列表上下文合并、防爬邮箱还原、4态招博判定、DOM 论文剪枝与质检评分。
 */
export function extractAdvisorDetailFromHtml(
  html: string,
  url: string,
  opts: {
    fallbackName?: string;
    fallbackDept?: string;
    contextEmail?: string;
    contextTitle?: string;
    isPhdListContext?: boolean;
    dictionaries?: DictionarySets;
    rules?: OpsRuleConfig | null;
  } = {}
): ExtractedAdvisorDetail {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, .nav, .navbar, .footer, .sidebar, .crumb").remove();

  const mainRoot = $("main, article, .content, .v_news_content, .wp_articlecontent, .teacher-info, body").first();
  const fullText = (mainRoot.text() || $("body").text() || "").replace(/[ \t]+/g, " ");

  let name = opts.fallbackName || "";
  if (!name && opts.rules?.nameSelector) {
    const customName = cleanPersonName($(opts.rules.nameSelector).first().text());
    if (looksLikePersonName(customName)) name = customName;
  }
  if (!name) {
    const labelMatch = fullText.match(/姓名\s*[:：]\s*([\u4e00-\u9fa5·]{2,5})/);
    if (labelMatch?.[1] && looksLikePersonName(labelMatch[1])) {
      name = labelMatch[1].trim();
    }
  }
  if (!name) {
    $("h1, h2, h3, .name, .teacher-name, .user-name").each((_, el) => {
      if (name) return;
      const cand = cleanPersonName($(el).text());
      if (looksLikePersonName(cand)) name = cand;
    });
  }
  if (!name) {
    const nearProfileMatch =
      fullText.match(/([\u4e00-\u9fa5·]{2,4})\s+(?:职称|所在院系|研究方向)\s*[:：]/) ||
      fullText.match(/个人简介\s+([\u4e00-\u9fa5·]{2,4})\s*[，,]\s*(?:男|女|博士|教授|研究员)/);
    if (nearProfileMatch?.[1] && looksLikePersonName(nearProfileMatch[1])) {
      name = nearProfileMatch[1].trim();
    }
  }
  if (!name) {
    const titleFirst = cleanPersonName($("title").text().split(/[-_|—]/)[0] || "");
    name = looksLikePersonName(titleFirst) ? titleFirst : "未命名导师";
  }

  const emails = extractEmailsFromRaw(fullText, $);
  const email = emails[0] || opts.contextEmail || "";

  const { title: parsedTitle, dept: parsedDept } = extractTitleAndDept(fullText);
  let title = parsedTitle || opts.contextTitle || "";
  const dept = opts.fallbackDept || parsedDept || "";

  const honor = matchHonor(fullText, opts.dictionaries);
  const recruit = resolveRecruitmentState({
    fullText,
    title,
    isPhdListContext: Boolean(opts.isPhdListContext),
  });

  if (recruit.isPhdSupervisor && title && !/博导/.test(title)) {
    title = `${title} · 博导`;
  } else if (recruit.isPhdSupervisor && !title) {
    title = "博导";
  }

  const researchTags = extractResearchTags(fullText);
  const { prunedMarkdown, paperCount, bio } = pruneAdvisorText(fullText);
  const photoUrl = extractCandidatePhoto($, url);

  let kpiOutputsHero = "官网公开主页在研";
  if (paperCount >= 5) {
    kpiOutputsHero = `官网列出论文 ${paperCount}+ 篇`;
  } else if (paperCount > 0) {
    kpiOutputsHero = `官网列出代表作 ${paperCount} 篇`;
  }

  // 计算规则质检分（0-100），决定是否入人工待审队列
  let qualityScore = 40;
  const reviewReasons: string[] = [];
  if (looksLikePersonName(name)) qualityScore += 15;
  else reviewReasons.push("姓名规则置信度偏低");
  if (email) qualityScore += 20;
  else reviewReasons.push("官网未直接公开邮箱");
  if (title) qualityScore += 10;
  if (researchTags.length > 0) qualityScore += 10;
  else reviewReasons.push("未规则切分出研究方向标签");
  if (bio.length >= 24) qualityScore += 5;

  const needsAi = qualityScore < 65 || researchTags.length === 0;
  const reviewStatus = qualityScore >= 70 && Boolean(email) ? "auto_published" : "needs_review";

  return {
    url,
    name,
    dept,
    title,
    honorBadge: honor.badge,
    honorCategory: honor.category,
    bio,
    researchTags,
    email,
    photoUrl,
    isPhdSupervisor: recruit.isPhdSupervisor,
    recruitmentStatus: recruit.recruitmentStatus,
    recruitmentSignalNote: recruit.recruitmentSignalNote,
    recruitOpen: recruit.recruitOpen,
    kpiOutputsHero,
    kpiQuotaHero: recruit.kpiQuotaHero,
    footerNote: recruit.footerNote,
    prunedMarkdown,
    qualityScore,
    needsAi,
    reviewStatus,
    reviewReasons,
  };
}

const DATE_RE =
  /(\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b20\d{2}年\d{1,2}月\d{1,2}日|\b\d{1,2}\s+20\d{2}\/\d{1,2}\b|\b\d{1,2}\s+(?:一|二|三|四|五|六|七|八|九|十|十一|十二)月|\b(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01])\b)/;

function normalizeNoticeDate(raw: string): string {
  const s = raw.trim();
  // "28 2026/10" -> "2026-10-28"
  const ddYyyyMm = s.match(/^(\d{1,2})\s+(20\d{2})\/(\d{1,2})$/);
  if (ddYyyyMm) {
    return `${ddYyyyMm[2]}-${ddYyyyMm[3].padStart(2, "0")}-${ddYyyyMm[1].padStart(2, "0")}`;
  }
  const ymd = s.match(/^(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }
  return s;
}

/**
 * 学院公告通用抽取：优先日期锚点同构兄弟聚类，若站点完全不展示日期则回退最大 <ul><li> 列表聚类。
 */
export function extractNoticesFromHtml(
  html: string,
  baseUrl: string,
  opts: { customSelector?: string; dictionaries?: DictionarySets } = {}
): NoticeExtractResult {
  const $ = cheerio.load(html);
  const whitelist = opts.dictionaries?.noticeWhitelist?.length
    ? opts.dictionaries.noticeWhitelist
    : DEFAULT_NOTICE_WHITELIST;
  const blacklist = opts.dictionaries?.noticeBlacklist?.length
    ? opts.dictionaries.noticeBlacklist
    : DEFAULT_NOTICE_BLACKLIST;

  if (!opts.customSelector) {
    $("nav, footer, .nav, .navbar, .footer, .header-nav, script, style").remove();
  }

  let mode: NoticeExtractResult["mode"] = "date_anchor";
  let clusterSignature = "";
  const rawItems: Array<{ title: string; url: string; publishedAt: string }> = [];
  const seenUrls = new Set<string>();

  if (opts.customSelector?.trim()) {
    mode = "custom_selector";
    clusterSignature = opts.customSelector.trim();
    $(clusterSignature).each((_, container) => {
      const a = $(container).is("a") ? $(container) : $(container).find("a[href]").first();
      const title = (a.attr("title") || a.text()).replace(/\s+/g, " ").trim();
      const href = normalizeUrl(a.attr("href") || "", baseUrl);
      if (!title || !href || seenUrls.has(href)) return;
      seenUrls.add(href);
      const dateMatch = $(container).text().match(DATE_RE);
      rawItems.push({
        title,
        url: href,
        publishedAt: dateMatch ? normalizeNoticeDate(dateMatch[1]) : "",
      });
    });
  } else {
    // 1. 按父容器签名聚类含日期的 <li> / <tr> / .list-item
    const clusters = new Map<
      string,
      Array<{ title: string; url: string; publishedAt: string }>
    >();
    $("li, tr, .news_item, .list-item, .article-item").each((_, el) => {
      const txt = $(el).text().replace(/\s+/g, " ").trim();
      const dateMatch = txt.match(DATE_RE);
      if (!dateMatch) return;
      const a = $(el).find("a[href]").first();
      const title = (a.attr("title") || a.text()).replace(/\s+/g, " ").trim();
      const href = normalizeUrl(a.attr("href") || "", baseUrl);
      if (!title || title.length < 6 || !href) return;

      const parent = $(el).parent();
      const parentCls = (parent.attr("class") || "").trim().split(/\s+/).filter(Boolean).join(".");
      const sig = `${parent.prop("tagName") || "UL"}${parentCls ? "." + parentCls : ""} > ${el.tagName}`;
      const list = clusters.get(sig) || [];
      list.push({ title, url: href, publishedAt: normalizeNoticeDate(dateMatch[1]) });
      clusters.set(sig, list);
    });

    let bestSig = "";
    let bestCluster: Array<{ title: string; url: string; publishedAt: string }> = [];
    for (const [sig, list] of clusters.entries()) {
      if (list.length > bestCluster.length) {
        bestSig = sig;
        bestCluster = list;
      }
    }

    if (bestCluster.length >= 2) {
      clusterSignature = bestSig;
      for (const item of bestCluster) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        rawItems.push(item);
      }
    } else {
      // 2. 无日期列表兜底（例如 SWPU list.jsp）
      mode = "undated_list";
      const undatedClusters = new Map<string, Array<{ title: string; url: string }>>();
      $("ul > li, ol > li").each((_, li) => {
        const a = $(li).find("a[href]").first();
        const title = (a.attr("title") || a.text()).replace(/\s+/g, " ").trim();
        const href = normalizeUrl(a.attr("href") || "", baseUrl);
        if (!title || title.length < 8 || !href) return;
        const parent = $(li).parent();
        const sig = `${parent.prop("tagName")}.${(parent.attr("class") || "").trim().split(/\s+/).join(".")} > li`;
        const list = undatedClusters.get(sig) || [];
        list.push({ title, url: href });
        undatedClusters.set(sig, list);
      });
      for (const [sig, list] of undatedClusters.entries()) {
        if (list.length > bestCluster.length) {
          bestSig = sig;
          bestCluster = list.map((x) => ({ ...x, publishedAt: "" }));
        }
      }
      clusterSignature = bestSig;
      for (const item of bestCluster) {
        if (seenUrls.has(item.url)) continue;
        seenUrls.add(item.url);
        rawItems.push(item);
      }
    }
  }

  const items: ExtractedNoticeItem[] = rawItems.map((it) => {
    const matchedKeywords = whitelist.filter((kw) => kw && it.title.includes(kw));
    const hitBlack = blacklist.some((kw) => kw && it.title.includes(kw));
    const isPhdRelated = matchedKeywords.length > 0 && !hitBlack;
    return {
      title: it.title,
      url: it.url,
      publishedAt: it.publishedAt,
      matchedKeywords,
      isPhdRelated,
    };
  });

  return {
    mode,
    clusterSignature,
    totalExtracted: items.length,
    phdMatchedCount: items.filter((i) => i.isPhdRelated).length,
    items,
  };
}

/**
 * 可选 RSS/Atom Feed 解析器（仅在站点公开声明 <link rel="alternate"> 或人工配置 rss_feed 时触发）。
 */
export function extractNoticesFromRssXml(
  xml: string,
  baseUrl: string,
  dictionaries?: DictionarySets
): NoticeExtractResult {
  const $ = cheerio.load(xml, { xmlMode: true });
  const whitelist = dictionaries?.noticeWhitelist?.length
    ? dictionaries.noticeWhitelist
    : DEFAULT_NOTICE_WHITELIST;
  const blacklist = dictionaries?.noticeBlacklist?.length
    ? dictionaries.noticeBlacklist
    : DEFAULT_NOTICE_BLACKLIST;

  const items: ExtractedNoticeItem[] = [];
  $("item, entry").each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    const linkHref =
      $(el).find("link").first().attr("href") || $(el).find("link").first().text().trim();
    const url = normalizeUrl(linkHref, baseUrl);
    const pubDate =
      $(el).find("pubDate, updated, published").first().text().trim();
    if (!title || !url || /你没有设置RSS文章源/.test(title)) return;
    const matchedKeywords = whitelist.filter((kw) => kw && title.includes(kw));
    const hitBlack = blacklist.some((kw) => kw && title.includes(kw));
    items.push({
      title,
      url,
      publishedAt: pubDate.slice(0, 16),
      matchedKeywords,
      isPhdRelated: matchedKeywords.length > 0 && !hitBlack,
    });
  });

  return {
    mode: "rss_feed",
    clusterSignature: "xml:item",
    totalExtracted: items.length,
    phdMatchedCount: items.filter((i) => i.isPhdRelated).length,
    items,
  };
}
