import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { AdvisorStage, MatchTier, ReplyIntent } from "@app/shared";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MATCH_TIER_STYLES: Record<
  MatchTier,
  { label: string; short: string; badgeClass: string; dotClass: string }
> = {
  perfect: {
    label: "极高匹配 · 首选导师",
    short: "极高匹配",
    badgeClass: "theme-soft-pill",
    dotClass: "theme-dot",
  },
  high: {
    label: "高度匹配 · 重点联系",
    short: "高度匹配",
    badgeClass: "honor-stone",
    dotClass: "bg-[#785A28]",
  },
  try: {
    label: "可以尝试 · 拓展备选",
    short: "可以尝试",
    badgeClass: "bg-[#F4F5F7] text-[#3F4756] border-slate-200/80",
    dotClass: "bg-slate-400",
  },
  unknown: {
    label: "待进一步了解",
    short: "待了解",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
    dotClass: "bg-amber-400",
  },
};

export const STAGE_STYLES: Record<
  AdvisorStage,
  { label: string; badgeClass: string }
> = {
  drafting: {
    label: "待撰写",
    badgeClass: "bg-[#F4F5F7] text-[#475569] border-slate-200/70",
  },
  ready: {
    label: "待发送",
    badgeClass: "honor-stone",
  },
  sent: {
    label: "已发送",
    badgeClass: "theme-soft-pill",
  },
  replied: {
    label: "已回信",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-[0_0_10px_rgba(16,185,129,0.12)]",
  },
  interviewing: {
    label: "面试推进",
    badgeClass: "bg-[#141417] text-white border-[#141417]",
  },
  paused: {
    label: "暂缓",
    badgeClass: "bg-zinc-100 text-zinc-500 border-zinc-200/70",
  },
};

export const REPLY_INTENT_BADGES: Record<
  ReplyIntent,
  { label: string; className: string }
> = {
  positive_interview: {
    label: "积极约面",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  welcome_apply: {
    label: "欢迎报考",
    className: "theme-soft-pill",
  },
  need_materials: {
    label: "需补材料",
    className: "honor-stone",
  },
  no_quota: {
    label: "暂无名额",
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  other: {
    label: "常规回复",
    className: "bg-[#F4F5F7] text-[#475569] border-slate-200",
  },
};

export function formatShortTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `今天 ${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}
