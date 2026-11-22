import type { AdvisorStage, MatchTier } from "./constants.js";

export function normalizeMatchTier(raw?: string | null): MatchTier {
  const s = (raw || "").trim();
  if (s === "perfect" || s === "极高匹配" || s.startsWith("P0")) return "perfect";
  if (s === "high" || s === "高度匹配" || s.startsWith("P1")) return "high";
  if (s === "try" || s === "可以尝试" || s.startsWith("P2")) return "try";
  if (s === "unknown" || s === "待进一步了解" || s.includes("核实")) return "unknown";
  return "high";
}

export function normalizeAdvisorStage(raw?: string | null): AdvisorStage {
  const s = (raw || "").trim();
  if (s === "interviewing" || s === "面试推进") return "interviewing";
  if (s === "replied" || s === "已回信" || s.startsWith("已回复")) return "replied";
  if (s === "sent" || s === "已发送") return "sent";
  if (s === "ready" || s === "待发送" || s === "已确认待发" || s === "已写入草稿") return "ready";
  if (s === "paused" || s === "暂缓") return "paused";
  return "drafting";
}

export function extractDomain(addr?: string | null): string {
  const s = (addr || "").trim();
  const at = s.indexOf("@");
  if (at === -1) return "";
  return s.slice(at + 1).trim().toLowerCase();
}

export function interleaveByDomain<T extends { email?: string | null }>(items: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const dom = extractDomain(item.email);
    const list = buckets.get(dom) || [];
    list.push(item);
    buckets.set(dom, list);
  }

  const result: T[] = [];
  let lastDom: string | null = null;
  while (true) {
    const candidates = Array.from(buckets.entries())
      .filter(([, list]) => list.length > 0)
      .sort((a, b) => b[1].length - a[1].length);
    if (candidates.length === 0) break;

    const picked = candidates.find(([dom]) => dom !== lastDom) ?? candidates[0];
    const [dom, list] = picked;
    const next = list.shift();
    if (next) result.push(next);
    lastDom = dom;
  }
  return result;
}

export function normalizeSubjectKey(subj?: string | null): string {
  let s = (subj || "").trim();
  while (true) {
    const ns = s.replace(/^(?:re|fwd|fw|回复|转发|答复)\s*[:：]\s*/i, "").trim();
    if (ns === s) break;
    s = ns;
  }
  return s.toLowerCase();
}

const SCHOOL_SHORT_MAP: Record<string, string> = {
  厦门大学: "厦大",
  东南大学: "东大",
  中山大学: "中大",
  同济大学: "同济",
  电子科技大学: "电子科大",
  哈尔滨工业大学: "哈工大",
  华中科技大学: "华科大",
  中国海洋大学: "海大",
  重庆大学: "重大",
  西北工业大学: "西工大",
  大连理工大学: "大工",
  吉林大学: "吉大",
  西安交通大学: "西交",
  清华大学: "清华",
  北京大学: "北大",
  浙江大学: "浙大",
  复旦大学: "复旦",
  上海交通大学: "上交",
  武汉大学: "武大",
  南京大学: "南大",
  中国人民大学: "人大",
  北京师范大学: "北师大",
  中国科学技术大学: "中科大",
};

export function schoolShort(name: string): string {
  const clean = (name || "").trim();
  return SCHOOL_SHORT_MAP[clean] || clean.replace(/大学$/, "");
}

export function deptShort(dept: string): string {
  return (dept || "")
    .replace(/（.*?）/g, "")
    .replace("计算机科学与工程学院", "计算机学院")
    .replace("计算机科学与技术学院", "计算机学院")
    .replace("生物科学与医学工程学院", "生医学院")
    .replace("网络空间安全学院", "网安学院")
    .replace("电子与信息工程学院", "电信学院")
    .replace("生命科学与技术学院", "生科院")
    .split("/")[0]
    .trim();
}

export function formatCountdown(sec: number): string {
  const sTot = Math.max(0, Math.floor(sec));
  const h = Math.floor(sTot / 3600);
  const m = Math.floor((sTot % 3600) / 60);
  const s = sTot % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function sanitizeFilename(name: string): string {
  return String(name || "")
    .replace(/[\\/:*?"<>|\s]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function toLocalInputValue(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
