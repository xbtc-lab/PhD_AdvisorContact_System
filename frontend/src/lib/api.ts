import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FilterState, Professor } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function apiFetch<T = any>(
  url: string,
  method: "GET" | "POST" = "GET",
  body: unknown = null
): Promise<T> {
  const opts: RequestInit = { method, headers: {} };
  if (body !== null) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

/** 4 natural academic match tiers (replacing P0/P1/P2 jargon) */
export const MATCH_OPTIONS = [
  { value: "极高匹配", label: "极高匹配 · 首选导师", short: "极高匹配" },
  { value: "高度匹配", label: "高度匹配 · 重点联系", short: "高度匹配" },
  { value: "可以尝试", label: "可以尝试 · 拓展备选", short: "可以尝试" },
  { value: "待进一步了解", label: "待进一步了解", short: "待了解" },
];

/** 5 streamlined stages (unified 已回信 without positive/negative split) */
export const STATUS_OPTIONS = [
  "待撰写",
  "待发送",
  "已发送",
  "已回信",
  "暂缓",
];

export function normalizeMatchTier(raw: string): string {
  const s = (raw || "").trim();
  if (s === "极高匹配" || s.startsWith("P0")) return "极高匹配";
  if (s === "高度匹配" || s.startsWith("P1")) return "高度匹配";
  if (s === "可以尝试" || s.startsWith("P2")) return "可以尝试";
  if (s === "待进一步了解" || s.includes("核实")) return "待进一步了解";
  return "高度匹配";
}

export function normalizeStatus(raw: string): string {
  const s = (raw || "").trim();
  if (s === "已回信" || s.startsWith("已回复")) return "已回信";
  if (s === "已发送") return "已发送";
  if (s === "待发送" || s === "已确认待发" || s === "已写入草稿") return "待发送";
  if (s === "暂缓") return "暂缓";
  return "待撰写";
}

export function matchShort(raw: string): string {
  const norm = normalizeMatchTier(raw);
  return norm === "待进一步了解" ? "待了解" : norm;
}

export function matchTone(raw: string): string {
  const norm = normalizeMatchTier(raw);
  switch (norm) {
    case "极高匹配":
      return "bg-[#FFF1F2] text-[#BE123C] ring-1 ring-[#F43F5E]/20";
    case "高度匹配":
      return "bg-[#FFFBEB] text-[#B45309] ring-1 ring-[#F59E0B]/22";
    case "可以尝试":
      return "bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#3B82F6]/20";
    default:
      return "bg-[#F4F5F7] text-[#52525B] ring-1 ring-slate-900/[0.07]";
  }
}

export function statusDotTone(raw: string): string {
  const norm = normalizeStatus(raw);
  switch (norm) {
    case "已回信":
      return "bg-[#F43F5E]";
    case "已发送":
      return "bg-[#10B981]";
    case "待发送":
      return "bg-[#3B82F6]";
    case "暂缓":
      return "bg-[#A1A1AA]";
    default:
      return "bg-[#D4D4D8]";
  }
}

export function statusTone(raw: string): string {
  const norm = normalizeStatus(raw);
  switch (norm) {
    case "已回信":
      return "bg-[#FFF1F2] text-[#BE123C] font-semibold ring-1 ring-[#F43F5E]/22";
    case "已发送":
      return "bg-[#ECFDF5] text-[#047857] ring-1 ring-[#10B981]/22";
    case "待发送":
      return "bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#3B82F6]/20";
    case "暂缓":
      return "bg-[#F4F5F7] text-[#71717A] ring-1 ring-slate-900/[0.06]";
    default:
      return "text-[#71717A] bg-transparent px-0";
  }
}

const AVATAR_PALETTES = [
  "bg-[#EFF6FF] text-[#1D4ED8] ring-[#3B82F6]/18",
  "bg-[#F5F3FF] text-[#6D28D9] ring-[#8B5CF6]/18",
  "bg-[#FFF1F2] text-[#BE123C] ring-[#F43F5E]/18",
  "bg-[#ECFDF5] text-[#047857] ring-[#10B981]/18",
  "bg-[#FFFBEB] text-[#B45309] ring-[#F59E0B]/18",
  "bg-[#F0F9FF] text-[#0369A1] ring-[#0EA5E9]/18",
];

export function avatarPalette(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
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
};

export function schoolShort(s: string): string {
  return SCHOOL_SHORT_MAP[s] || (s || "").replace("大学", "");
}

export function deptShort(d: string): string {
  return (d || "")
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

export function matchesProfFilters(p: Professor, f: FilterState): boolean {
  const q = (f.query || "").trim().toLowerCase();
  if (f.school !== "ALL" && p.sheet !== f.school) return false;
  if (f.matchTier !== "ALL" && normalizeMatchTier(p.priority) !== f.matchTier) return false;
  if (f.status !== "ALL" && normalizeStatus(p.status) !== f.status) return false;
  if (q) {
    const hay =
      `${p.name} ${p.sheet} ${p.dept} ${p.title} ${p.tags} ${p.research} ${p.email} ${p.note} ${p.hook} ${p.subject} ${p.reply_note}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function formatCountdown(sec: number): string {
  const sTot = Math.max(0, Math.floor(sec));
  const h = Math.floor(sTot / 3600);
  const m = Math.floor((sTot % 3600) / 60);
  const s = sTot % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function toLocalInputValue(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
