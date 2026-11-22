import { useEffect, useRef, useState } from "react";
import {
  Compass,
  FileUser,
  Inbox,
  PenLine,
  Plus,
  Search,
  Settings,
  Users,
} from "lucide-react";
import type { BootstrapData } from "@app/shared";
import { cn } from "@/lib/cn.js";
import { useAppStore, type ActiveTab } from "@/store/useAppStore.js";
import { CueMascot } from "./ui/BrandMascot.js";

export interface AppHeaderProps {
  bootstrap: BootstrapData;
}

/**
 * PhD Cue V3.2 顶部极简导航栏：
 * 品牌吉祥物 + 悬浮玻璃 5 主标签胶囊导航 + 右侧快捷工具弹层、命令搜索与系统设置入口。
 */
export function AppHeader({ bootstrap }: AppHeaderProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setAiImportOpen = useAppStore((s) => s.setAiImportOpen);
  const setQuickAddOpen = useAppStore((s) => s.setQuickAddOpen);
  const setQuickComposeOpen = useAppStore((s) => s.setQuickComposeOpen);
  const setCsvImportOpen = useAppStore((s) => s.setCsvImportOpen);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);

  const [plusOpen, setPlusOpen] = useState(false);
  const plusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plusOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (plusRef.current && !plusRef.current.contains(e.target as Node)) {
        setPlusOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [plusOpen]);

  const hasInboxSignal =
    bootstrap.unreadReplies.length > 0 ||
    Object.values(bootstrap.trackingSummaries || {}).some(
      (s) => s.resumeClicks > 0 || s.cardClicks > 0
    );

  const navItems: Array<{
    key: ActiveTab;
    label: string;
    badge?: number;
    dot?: boolean;
  }> = [
    { key: "discover", label: "发现导师" },
    { key: "mine", label: "我的导师", badge: bootstrap.advisors.length },
    { key: "write", label: "写信工坊" },
    { key: "inbox", label: "往来动态", dot: hasInboxSignal },
    { key: "profile", label: "我的履历" },
  ];

  return (
    <header className="h-[58px] md:h-[68px] px-4 md:px-7 flex items-center justify-between gap-3 shrink-0 relative z-30 max-w-[1280px] w-full mx-auto">
      {/* 品牌锚点：点击返回发现导师首页 */}
      <button
        type="button"
        onClick={() => setActiveTab("discover")}
        className="flex items-center gap-2.5 cursor-pointer bg-transparent border-0 p-0 group shrink-0"
      >
        <CueMascot size={32} />
        <span className="text-[15.5px] font-bold tracking-[-0.02em] text-[#0F172A]">
          PhD Cue
        </span>
      </button>

      {/* 桌面端悬浮玻璃 5 主标签药丸导航 */}
      <nav
        aria-label="主导航"
        className="glass-bar p-1 rounded-full hidden md:inline-flex items-center gap-1 overflow-x-auto no-scrollbar"
      >
        {navItems.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={cn(
                "px-4 py-1.5 rounded-full text-[13px] cursor-pointer border-0 transition-all inline-flex items-center gap-1.5 whitespace-nowrap",
                isActive
                  ? "bg-[#141417] text-white font-semibold shadow-[0_6px_14px_-5px_rgba(20,20,23,0.32)]"
                  : "bg-transparent text-[#475569] font-medium hover:text-[#0F172A]"
              )}
            >
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[11px] cue-mono leading-none",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-[#F4F5F7] text-[#475569]"
                  )}
                >
                  {item.badge}
                </span>
              )}
              {item.dot && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 右侧快捷工具弹层 + 命令搜索 + 设置按钮 */}
      <div className="flex items-center gap-2 relative shrink-0" ref={plusRef}>
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          title="全局搜索与快捷指令 (Ctrl+K)"
          aria-label="全局搜索"
          className="glass-bar h-9 w-9 sm:w-auto sm:px-3 rounded-full inline-flex items-center justify-center gap-1.5 text-[12px] text-[#64748B] hover:text-[#0F172A] cursor-pointer theme-hover-border transition-all"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="cue-mono text-[11px] text-[#94A3B8] hidden sm:inline">⌘K</span>
        </button>

        <button
          type="button"
          onClick={() => setPlusOpen((v) => !v)}
          title="补充未收录导师 / 自由发信"
          aria-label="快捷新建菜单"
          className="glass-bar w-9 h-9 rounded-full inline-flex items-center justify-center text-[#0F172A] cursor-pointer theme-hover-border transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          title="系统与外观设置"
          aria-label="系统与外观设置"
          className={cn(
            "h-9 w-9 sm:w-auto sm:px-3.5 rounded-full inline-flex items-center justify-center gap-2 text-[12.5px] cursor-pointer transition-all",
            activeTab === "settings"
              ? "bg-[#141417] text-white font-semibold border border-transparent shadow-[0_6px_14px_-5px_rgba(20,20,23,0.3)]"
              : "glass-bar font-medium text-[#475569] hover:text-[#0F172A] theme-hover-border"
          )}
        >
          <Settings className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">设置</span>
        </button>

        {plusOpen && (
          <div className="absolute right-0 top-12 w-64 glass-popover rounded-2xl p-2 z-50 space-y-1">
            <button
              type="button"
              onClick={() => {
                setPlusOpen(false);
                setAiImportOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#FAFAFB] cursor-pointer border-0 bg-transparent"
            >
              <div className="text-[12.5px] font-semibold text-[#0F172A]">
                AI 智能采集师资页面
              </div>
              <div className="text-[11.5px] text-[#64748B] mt-0.5">
                粘贴学院师资网址或文本批量结构化建档
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setPlusOpen(false);
                setQuickAddOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#FAFAFB] cursor-pointer border-0 bg-transparent"
            >
              <div className="text-[12.5px] font-semibold text-[#0F172A]">
                手动补充未收录导师
              </div>
              <div className="text-[11.5px] text-[#64748B] mt-0.5">
                为特定实验室或冷门课题组录入个人台账
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setPlusOpen(false);
                setQuickComposeOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#FAFAFB] cursor-pointer border-0 bg-transparent"
            >
              <div className="text-[12.5px] font-semibold text-[#0F172A]">
                自由撰写单封邮件
              </div>
              <div className="text-[11.5px] text-[#64748B] mt-0.5">
                直接填写收件邮箱并随信附带个人简历
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setPlusOpen(false);
                setCsvImportOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-[#FAFAFB] cursor-pointer border-0 bg-transparent"
            >
              <div className="text-[12.5px] font-semibold text-[#0F172A]">
                导入个人 CSV 名单
              </div>
              <div className="text-[11.5px] text-[#64748B] mt-0.5">
                兼容导出格式的导师表格一键合并入库
              </div>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

/**
 * 移动端底部固定 5 主标签栏（仅在 < md 屏幕展示）。
 */
export function MobileBottomNav({ bootstrap }: AppHeaderProps) {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const hasInboxSignal =
    bootstrap.unreadReplies.length > 0 ||
    Object.values(bootstrap.trackingSummaries || {}).some(
      (s) => s.resumeClicks > 0 || s.cardClicks > 0
    );

  const mobileItems: Array<{
    key: ActiveTab;
    label: string;
    icon: typeof Compass;
    badge?: number;
    dot?: boolean;
  }> = [
    { key: "discover", label: "发现", icon: Compass },
    { key: "mine", label: "导师", icon: Users, badge: bootstrap.advisors.length },
    { key: "write", label: "写信", icon: PenLine },
    { key: "inbox", label: "动态", icon: Inbox, dot: hasInboxSignal },
    { key: "profile", label: "履历", icon: FileUser },
  ];

  return (
    <nav
      aria-label="移动端底部导航"
      className="md:hidden shrink-0 bg-white/95 backdrop-blur-xl hairline-t px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] flex items-center justify-around relative z-30"
    >
      {mobileItems.map((item) => {
        const Icon = item.icon;
        const active = activeTab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveTab(item.key)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1 px-2 rounded-xl border-0 bg-transparent cursor-pointer transition-colors",
              active ? "text-[#0F172A] font-semibold" : "text-[#64748B] font-medium"
            )}
          >
            <div className="relative inline-flex">
              <Icon className={cn("w-4 h-4", active && "theme-text")} />
              {item.dot && (
                <span className="absolute -top-0.5 -right-1 w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              )}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-3 px-1 rounded-full text-[9px] cue-mono leading-[14px] bg-[#F4F5F7] text-[#334155]">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10.5px] leading-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
