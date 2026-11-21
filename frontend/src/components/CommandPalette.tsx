import React, { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, PenSquare, Search, Settings, Sparkles, Table2, User } from "lucide-react";
import { cn, normalizeStatus, schoolShort, statusDotTone } from "../lib/api";
import type { Professor } from "../types";

export function CommandPalette({
  open,
  onOpenChange,
  professors,
  onSelectProfessor,
  onRunAction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  professors: Professor[];
  onSelectProfessor: (pid: string) => void;
  onRunAction: (action: "ai_import" | "settings" | "sheet" | "quick_compose") => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const matched = professors
    .filter((p) => {
      if (!q) return true;
      return `${p.name} ${p.sheet} ${p.dept} ${p.tags} ${p.research} ${p.email}`.toLowerCase().includes(q);
    })
    .slice(0, 12);

  type PaletteEntry =
    | { kind: "action"; id: string; action: "ai_import" | "quick_compose" | "sheet" | "settings" }
    | { kind: "prof"; id: string; prof: Professor };

  const flatEntries: PaletteEntry[] = [
    ...(!q
      ? [
          { kind: "action" as const, id: "act-compose", action: "quick_compose" as const },
          { kind: "action" as const, id: "act-ai", action: "ai_import" as const },
          { kind: "action" as const, id: "act-sheet", action: "sheet" as const },
          { kind: "action" as const, id: "act-settings", action: "settings" as const },
        ]
      : []),
    ...matched.map((p) => ({ kind: "prof" as const, id: p.id, prof: p })),
  ];

  function triggerEntry(entry: PaletteEntry) {
    onOpenChange(false);
    if (entry.kind === "action") onRunAction(entry.action);
    else onSelectProfessor(entry.prof.id);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-slate-950/24 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[15%] -translate-x-1/2 z-[91] w-[92vw] max-w-[560px] bg-white ring-1 ring-slate-900/[0.09] rounded-[16px] shadow-[0_24px_64px_-8px_rgba(15,23,42,0.22)] overflow-hidden outline-none"
        >
          <DialogPrimitive.Title className="sr-only">快速搜索导师或执行操作</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-900/[0.06]">
            <Search className="w-4 h-4 text-[#9CA3AF] shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && flatEntries.length > 0) {
                  e.preventDefault();
                  setActiveIdx((i) => (i + 1) % flatEntries.length);
                } else if (e.key === "ArrowUp" && flatEntries.length > 0) {
                  e.preventDefault();
                  setActiveIdx((i) => (i - 1 + flatEntries.length) % flatEntries.length);
                } else if (e.key === "Enter" && flatEntries[activeIdx]) {
                  e.preventDefault();
                  triggerEntry(flatEntries[activeIdx]);
                }
              }}
              placeholder="输入导师姓名、学校或方向快速跳转..."
              className="flex-1 border-none outline-none text-[13.5px] text-[#18181B] placeholder:text-[#9CA3AF] bg-transparent"
            />
            <kbd className="kbd-cap">ESC</kbd>
          </div>

          <div className="max-h-[370px] overflow-y-auto p-1.5 space-y-0.5">
            {!q && (
              <div className="px-2.5 pt-1 pb-1 text-[11px] text-[#9CA3AF] font-medium">
                常用操作
              </div>
            )}
            {!q &&
              [
                {
                  key: "act-compose",
                  action: "quick_compose" as const,
                  icon: PenSquare,
                  label: "写一封新邮件（自由手写发送）",
                },
                {
                  key: "act-ai",
                  action: "ai_import" as const,
                  icon: Sparkles,
                  label: "AI 识别网页导入导师并评匹配度",
                },
                {
                  key: "act-sheet",
                  action: "sheet" as const,
                  icon: Table2,
                  label: "查看各校联系进度总表",
                },
                {
                  key: "act-settings",
                  action: "settings" as const,
                  icon: Settings,
                  label: "打开名片、邮箱与 DeepSeek 设置",
                },
              ].map((item, idx) => {
                const Icon = item.icon;
                const active = activeIdx === idx;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => triggerEntry({ kind: "action", id: item.key, action: item.action })}
                    className={cn(
                      "w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[9px] text-left text-[12.5px] cursor-pointer transition-colors",
                      active
                        ? "bg-[#EFF6FF] text-[#1D4ED8] font-medium"
                        : "text-[#18181B] hover:bg-[#F8F9FB]"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className={cn("w-3.5 h-3.5", active ? "text-[#2563EB]" : "text-[#71717A]")} />
                      <span>{item.label}</span>
                    </span>
                    {active && <ArrowRight className="w-3.5 h-3.5 text-[#2563EB]/70" />}
                  </button>
                );
              })}

            <div className="px-2.5 pt-2.5 pb-1 text-[11px] text-[#9CA3AF] font-medium">
              导师名录（{matched.length}）
            </div>
            {matched.length === 0 ? (
              <div className="py-7 text-center text-[12.5px] text-[#9CA3AF]">未找到匹配导师</div>
            ) : (
              matched.map((p, idx) => {
                const entryIdx = (q ? 0 : 4) + idx;
                const active = activeIdx === entryIdx;
                const st = normalizeStatus(p.status);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(entryIdx)}
                    onClick={() => triggerEntry({ kind: "prof", id: p.id, prof: p })}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-[9px] text-left cursor-pointer transition-colors",
                      active ? "bg-[#F4F5F7]" : "hover:bg-[#F8F9FB]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
                      <span className="font-semibold text-[13px] text-[#18181B] shrink-0">{p.name}</span>
                      <span className="text-[11.5px] text-[#71717A] truncate">
                        {schoolShort(p.sheet)} · {p.tags || p.research}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[#71717A] shrink-0">
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusDotTone(st))} />
                      <span>{st}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
