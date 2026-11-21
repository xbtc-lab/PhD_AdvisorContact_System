import React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { motion } from "motion/react";
import { Plus, Search, SlidersHorizontal, Sparkles, UserPlus, X } from "lucide-react";
import { Button, SelectBox } from "./ui";
import {
  avatarPalette,
  cn,
  deptShort,
  MATCH_OPTIONS,
  matchShort,
  matchTone,
  normalizeStatus,
  schoolShort,
  STATUS_OPTIONS,
  statusDotTone,
  statusTone,
} from "../lib/api";
import type { FilterState, Professor, UnreadReplyItem } from "../types";

export function ProfessorRail({
  professors,
  filtered,
  sheets,
  selectedId,
  filters,
  unreadReplies,
  replyCounts,
  onFiltersChange,
  onSelectProfessor,
  onOpenAiImport,
  onOpenQuickAdd,
}: {
  professors: Professor[];
  filtered: Professor[];
  sheets: string[];
  selectedId: string | null;
  filters: FilterState;
  unreadReplies: UnreadReplyItem[];
  replyCounts: Record<string, number>;
  onFiltersChange: (patch: Partial<FilterState>) => void;
  onSelectProfessor: (id: string) => void;
  onOpenAiImport: () => void;
  onOpenQuickAdd: () => void;
}) {
  const unreadByProf = new Set(unreadReplies.map((u) => u.professor_id));
  const activeFilterCount =
    (filters.matchTier !== "ALL" ? 1 : 0) + (filters.status !== "ALL" ? 1 : 0);

  return (
    <aside className="w-[304px] shrink-0 bg-[#F8F9FB] border-r border-slate-900/[0.07] flex flex-col min-h-0">
      <div className="p-3 border-b border-slate-900/[0.06] space-y-2.5 bg-[#F8F9FB]">
        {/* Search + AI Find/Import + Manual Add */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => onFiltersChange({ query: e.target.value })}
              placeholder="搜姓名、方向、邮箱"
              className="w-full h-8 pl-8 pr-7 bg-white border border-slate-900/[0.09] rounded-[9px] text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF] shadow-[0_1px_2px_rgba(15,23,42,0.02)] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/12 transition-all"
            />
            {filters.query && (
              <button
                type="button"
                onClick={() => onFiltersChange({ query: "" })}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded inline-flex items-center justify-center text-[#9CA3AF] hover:bg-slate-900/[0.05] cursor-pointer"
                aria-label="清空搜索"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <Button
            variant="blue"
            size="sm"
            onClick={onOpenAiImport}
            title="粘贴学院官网师资页面文字，让 DeepSeek 自动整理导师并评估匹配度"
            className="h-8 px-2.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI 导表</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={onOpenQuickAdd}
            title="手动添加一位导师"
            className="h-8 w-8 p-0"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#52525B]" />
          </Button>
        </div>

        {/* School Horizontal Pills */}
        <div
          className="bg-[#EEF0F4]/90 p-[3px] rounded-[9px] flex items-center gap-0.5 overflow-x-auto no-scrollbar"
          onWheel={(e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
              e.currentTarget.scrollLeft += e.deltaY;
            }
          }}
        >
          {[
            { id: "ALL", label: "全部", title: "全部高校" },
            ...sheets.map((s) => ({ id: s, label: schoolShort(s), title: s })),
          ].map((item) => {
            const active = filters.school === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.title}
                onClick={() => onFiltersChange({ school: item.id })}
                className={cn(
                  "relative z-10 h-6 px-2.5 rounded-[6.5px] text-[11.5px] shrink-0 whitespace-nowrap cursor-pointer transition-colors duration-150 select-none",
                  active ? "text-[#18181B] font-semibold" : "text-[#6B7280] hover:text-[#18181B]"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="rail-school-pill"
                    transition={{ type: "spring", stiffness: 520, damping: 38 }}
                    className="absolute inset-0 -z-10 rounded-[6.5px] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  />
                )}
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Quick Status Filter Chips + Match Tier Popover */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {[
              { id: "ALL", label: "全部" },
              { id: "已回信", label: "有回信" },
              { id: "待发送", label: "待发送" },
            ].map((chip) => {
              const active = filters.status === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onFiltersChange({ status: chip.id })}
                  className={cn(
                    "h-6 px-2 rounded-full text-[11.5px] cursor-pointer transition-all select-none",
                    active
                      ? "bg-[#18181B] text-white font-medium"
                      : "text-[#6B7280] hover:bg-white hover:text-[#18181B]"
                  )}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-[#9CA3AF] tabular-nums">
              {filtered.length}/{professors.length}
            </span>

            <PopoverPrimitive.Root>
              <PopoverPrimitive.Trigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 h-6.5 px-2 rounded-[7px] text-[11.5px] cursor-pointer transition-all select-none active:scale-[0.97]",
                    activeFilterCount > 0
                      ? "bg-[#EFF6FF] ring-1 ring-[#3B82F6]/25 text-[#1D4ED8] font-medium"
                      : "bg-white ring-1 ring-slate-900/[0.08] text-[#52525B] hover:ring-slate-900/[0.16]"
                  )}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>筛选{activeFilterCount > 0 ? `·${activeFilterCount}` : ""}</span>
                </button>
              </PopoverPrimitive.Trigger>
              <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 w-[256px] bg-white rounded-[14px] shadow-popover p-3.5 space-y-3 popover-motion"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-semibold text-[#18181B]">按匹配度与状态筛选</span>
                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onFiltersChange({ matchTier: "ALL", status: "ALL" })}
                        className="text-[11.5px] text-[#2563EB] hover:underline cursor-pointer"
                      >
                        重置
                      </button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-[#71717A]">匹配度</div>
                    <SelectBox
                      variant="form"
                      value={filters.matchTier}
                      onValueChange={(v) => onFiltersChange({ matchTier: v })}
                      options={[
                        { value: "ALL", label: "全部匹配度" },
                        ...MATCH_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                      ]}
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-[#71717A]">沟通状态</div>
                    <SelectBox
                      variant="form"
                      value={filters.status}
                      onValueChange={(v) => onFiltersChange({ status: v })}
                      options={[
                        { value: "ALL", label: "全部状态" },
                        ...STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
                      ]}
                    />
                  </div>
                </PopoverPrimitive.Content>
              </PopoverPrimitive.Portal>
            </PopoverPrimitive.Root>
          </div>
        </div>
      </div>

      {/* Professor Cards List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="py-12 px-4 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-white ring-1 ring-slate-900/[0.06] mx-auto flex items-center justify-center text-[#9CA3AF]">
              <Search className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <div className="text-[12.5px] font-medium text-[#52525B]">这里暂时还没有导师</div>
              <div className="text-[11.5px] text-[#9CA3AF]">试试清空筛选，或用 AI 一键导入学院师资</div>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              <Button size="sm" variant="blue" onClick={onOpenAiImport}>
                <Sparkles className="w-3 h-3" />
                <span>AI 导表</span>
              </Button>
              <Button size="sm" variant="secondary" onClick={onOpenQuickAdd}>
                <Plus className="w-3 h-3" />
                <span>手动添加</span>
              </Button>
            </div>
          </div>
        ) : (
          filtered.map((p) => {
            const active = p.id === selectedId;
            const hasUnread = unreadByProf.has(p.id);
            const rCount = replyCounts[p.id] || 0;
            const normStatus = normalizeStatus(p.status);
            const initial = (p.name || "导").trim().charAt(0);
            return (
              <div
                key={p.id}
                onClick={() => onSelectProfessor(p.id)}
                className={cn(
                  "group relative flex items-start gap-2.5 px-3 py-2.5 rounded-[12px] cursor-pointer transition-all duration-150 select-none",
                  active
                    ? "bg-white ring-1 ring-slate-900/[0.1] shadow-[0_3px_12px_-3px_rgba(15,23,42,0.09),0_1px_2px_rgba(15,23,42,0.04)]"
                    : "hover:bg-white/90 hover:-translate-y-[1px] hover:ring-1 hover:ring-slate-900/[0.06]"
                )}
              >
                {/* Pastel Surname Avatar + Unread Reply Coral Dot */}
                <div className="relative mt-0.5 shrink-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full ring-1 flex items-center justify-center text-[12.5px] font-bold select-none",
                      avatarPalette(p.sheet + p.name)
                    )}
                  >
                    {initial}
                  </div>
                  {hasUnread && (
                    <span
                      title="有未读导师回信"
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-white animate-pulse"
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-[#18181B] whitespace-nowrap truncate">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-[#71717A] truncate text-right">
                      {schoolShort(p.sheet)}
                      {p.dept ? ` · ${deptShort(p.dept)}` : ""}
                    </span>
                  </div>

                  <div className="text-[11.5px] text-[#6B7280] truncate mt-0.5 leading-snug">
                    {p.tags || p.research || "点击右侧档案补充研究方向"}
                  </div>

                  <div className="flex items-center justify-between gap-1.5 mt-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-[2px] rounded-[6px] text-[10.5px] font-medium leading-none",
                        matchTone(p.priority)
                      )}
                    >
                      {matchShort(p.priority)}
                    </span>

                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-[2px] rounded-full text-[10.5px] font-medium leading-none",
                        statusTone(normStatus)
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDotTone(normStatus))} />
                      <span>
                        {normStatus}
                        {rCount > 0 && normStatus === "已回信" ? ` (${rCount})` : ""}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
