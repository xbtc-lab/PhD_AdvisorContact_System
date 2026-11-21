import React from "react";
import {
  Bell,
  Inbox,
  Layers,
  PenLine,
  PenSquare,
  RefreshCw,
  Settings,
  Table2,
} from "lucide-react";
import { Button, SegmentedControl } from "./ui";
import { PigeonBadge } from "./Mascot";
import { cn, normalizeStatus } from "../lib/api";
import type { FilterState, Professor, UnreadReplyItem, WorkbenchConfig } from "../types";

export function Topbar({
  viewMode,
  onChangeView,
  professors,
  config,
  filters,
  unreadReplies,
  syncingReplies,
  onToggleMetricFilter,
  onSyncReplies,
  onOpenReplyAlert,
  onOpenQuickCompose,
  onOpenSettings,
  onOpenDispatch,
}: {
  viewMode: "workspace" | "sheet";
  onChangeView: (v: "workspace" | "sheet") => void;
  professors: Professor[];
  config: WorkbenchConfig | null;
  filters: FilterState;
  unreadReplies: UnreadReplyItem[];
  syncingReplies: boolean;
  onToggleMetricFilter: (statusKey: "待撰写" | "待发送" | "已发送" | "已回信") => void;
  onSyncReplies: () => void;
  onOpenReplyAlert: () => void;
  onOpenQuickCompose: () => void;
  onOpenSettings: () => void;
  onOpenDispatch: () => void;
}) {
  const mDraft = professors.filter((p) => normalizeStatus(p.status) === "待撰写").length;
  const mReady = professors.filter((p) => normalizeStatus(p.status) === "待发送").length;
  const mSent = professors.filter((p) => normalizeStatus(p.status) === "已发送").length;
  const mReplied = professors.filter((p) => normalizeStatus(p.status) === "已回信").length;

  const unreadCount = unreadReplies.length;
  const hasAnyConfiguredMail = (config?.accounts || []).some(
    (a) => a.enabled && a.email && a.has_password
  );

  const metrics: {
    key: "待撰写" | "待发送" | "已发送" | "已回信";
    label: string;
    val: number;
    dot: string;
    highlight?: boolean;
  }[] = [
    { key: "待撰写", label: "待撰写", val: mDraft, dot: "bg-[#D4D4D8]" },
    { key: "待发送", label: "待发送", val: mReady, dot: "bg-[#3B82F6]" },
    { key: "已发送", label: "已发送", val: mSent, dot: "bg-[#10B981]" },
    { key: "已回信", label: "已回信", val: mReplied, dot: "bg-[#F43F5E]", highlight: mReplied > 0 },
  ];

  return (
    <header className="h-[56px] bg-white/95 backdrop-blur-md border-b border-slate-900/[0.07] px-4 flex items-center justify-between gap-3 shrink-0 z-20">
      {/* Left: Mascot Brand + View Switcher */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="flex items-center gap-2.5 select-none">
          <PigeonBadge hasUnread={unreadCount > 0} />
          <div className="whitespace-nowrap">
            <span className="text-[15px] font-bold tracking-[-0.02em] text-[#18181B]">
              申博轻邮
            </span>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-900/[0.08] hidden sm:block" />

        <SegmentedControl
          layoutId="topbar-view-tab"
          value={viewMode}
          onValueChange={(v) => onChangeView(v as "workspace" | "sheet")}
          options={[
            { value: "workspace", label: "写信与会话", icon: PenLine },
            { value: "sheet", label: "进度总表", icon: Table2 },
          ]}
        />
      </div>

      {/* Center: Streamlined 4-Stage Pipeline Pills */}
      <div className="hidden lg:flex items-center gap-0.5 bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] rounded-full px-1.5 py-1">
        {metrics.map((m) => {
          const active = filters.status === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onToggleMetricFilter(m.key)}
              title={`点击筛选「${m.label}」的导师`}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] cursor-pointer transition-all duration-150 select-none active:scale-[0.97]",
                active
                  ? "bg-white text-[#18181B] font-semibold shadow-[0_1px_3px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.08]"
                  : m.highlight
                    ? "text-[#BE123C] hover:bg-[#FFF1F2]/70"
                    : "text-[#6B7280] hover:text-[#18181B] hover:bg-white/75"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", m.dot)} />
              <span>{m.label}</span>
              <strong className="tabular-nums text-[12px] font-semibold text-[#18181B]">
                {m.val}
              </strong>
            </button>
          );
        })}
      </div>

      {/* Right: Reply Check, Freehand Write, Batch Send, Settings */}
      <div className="flex items-center gap-1.5 shrink-0">
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onOpenReplyAlert}
            className="inline-flex items-center gap-1.5 h-8.5 px-3 rounded-[9px] bg-[#FFF1F2] text-[#BE123C] ring-1 ring-[#F43F5E]/25 hover:bg-[#FFE4E6] text-[12.5px] font-semibold cursor-pointer transition-all active:scale-[0.97]"
          >
            <Bell className="w-3.5 h-3.5 animate-bounce" />
            <span>{unreadCount} 封新回信</span>
          </button>
        ) : (
          <Button
            variant="ghost"
            onClick={onSyncReplies}
            disabled={syncingReplies}
            title="立即查收已联系导师的新回信"
          >
            {syncingReplies ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#2563EB]" />
            ) : (
              <Inbox className="w-3.5 h-3.5 text-[#52525B]" />
            )}
            <span className="hidden xl:inline">{syncingReplies ? "查信中..." : "查收新回信"}</span>
          </Button>
        )}

        <Button
          variant="secondary"
          onClick={onOpenQuickCompose}
          title="像普通邮箱一样，随时手写并发送一封单封邮件"
        >
          <PenSquare className="w-3.5 h-3.5 text-[#18181B]" />
          <span>写新邮件</span>
        </Button>

        <Button
          variant="subtle"
          onClick={onOpenDispatch}
          title="将多封「待发送」的套磁信按防封间隔错峰发出"
        >
          <Layers className="w-3.5 h-3.5 text-[#52525B]" />
          <span>批量发送</span>
          {mReady > 0 && (
            <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-full bg-[#2563EB] text-white tabular-nums">
              {mReady}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={onOpenSettings}
          title="个人名片、DeepSeek AI 与发件邮箱配置"
          className="px-2.5"
        >
          <Settings className="w-4 h-4 text-[#52525B]" />
          <span className="hidden sm:inline">设置</span>
          {!hasAnyConfiguredMail && (
            <span
              title="尚未配置发件邮箱授权码"
              className="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"
            />
          )}
        </Button>
      </div>
    </header>
  );
}
