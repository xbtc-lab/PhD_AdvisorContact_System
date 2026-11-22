import { useState } from "react";
import {
  Bot,
  Database,
  Mail,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from "lucide-react";
import type { BootstrapData } from "@app/shared";
import { cn } from "@/lib/cn.js";
import { useAppStore, type SettingsSectionKey } from "@/store/useAppStore.js";
import { AiPolicySettingsPanel } from "./settings/AiPolicySettingsPanel.js";
import { AppearanceSettingsPanel } from "./settings/AppearanceSettingsPanel.js";
import { DataBackupSettingsPanel } from "./settings/DataBackupSettingsPanel.js";
import { MailboxSettingsPanel } from "./settings/MailboxSettingsPanel.js";

export interface SettingsViewProps {
  bootstrap: BootstrapData;
}

const SIDEBAR_ITEMS: ReadonlyArray<{
  key: SettingsSectionKey;
  label: string;
  desc: string;
  icon: typeof Palette;
}> = [
  {
    key: "appearance",
    label: "主题与外观",
    desc: "四色微光主题与占位头像",
    icon: Palette,
  },
  {
    key: "mailbox",
    label: "发件邮箱信道",
    desc: "MX 探测与 SMTP/IMAP",
    icon: Mail,
  },
  {
    key: "ai",
    label: "AI 与发信策略",
    desc: "大模型密钥与错峰护栏",
    icon: Bot,
  },
  {
    key: "data",
    label: "数据迁移与备份",
    desc: "CSV/JSON 导入与导出",
    icon: Database,
  },
];

/**
 * 视图 6：系统与技术设置（外观主题 / 多邮箱信道 / AI 与错峰策略 / 备份与 Prompt 控制台）。
 */
export function SettingsView({ bootstrap }: SettingsViewProps) {
  const settingsSection = useAppStore((s) => s.settingsSection);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const setAdminPromptOpen = useAppStore((s) => s.setAdminPromptOpen);
  const [navCollapsed, setNavCollapsed] = useState(false);

  return (
    <div className="max-w-[1220px] mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            {navCollapsed && (
              <button
                type="button"
                onClick={() => setNavCollapsed(false)}
                title="展开系统设置菜单"
                aria-label="展开设置导航"
                className="hidden md:inline-flex w-8 h-8 rounded-full bg-white hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-[#0F172A]">
              系统设置 · 发件信道、AI 引擎与主题外观
            </h1>
          </div>
          <p className="text-[12.5px] text-[#64748B] mt-1">
            所有邮箱授权码与模型密钥仅存于受保护数据库，外观主题实时生效并记忆
          </p>
        </div>
      </div>

      {/* 移动端横向分组切换条（仅 < md 展示） */}
      <div className="md:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {SIDEBAR_ITEMS.map((item) => {
          const active = settingsSection === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSettingsSection(item.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[12px] shrink-0 whitespace-nowrap border cursor-pointer transition-all",
                active
                  ? "bg-[#141417] text-white border-[#141417] font-semibold"
                  : "bg-white text-[#475569] border-slate-200/80 font-medium"
              )}
            >
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAdminPromptOpen(true)}
          className="px-3 py-1.5 rounded-full text-[12px] shrink-0 whitespace-nowrap bg-[#FAFAFB] border border-slate-200/80 text-[#0F172A] font-medium cursor-pointer"
        >
          Prompt 控制台
        </button>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-6 items-start",
          !navCollapsed &&
            "md:grid-cols-[210px_minmax(0,1fr)] lg:grid-cols-[230px_minmax(0,1fr)]"
        )}
      >
        {/* 桌面端左侧设置目录栏（支持收起） */}
        {!navCollapsed && (
          <aside className="hidden md:block card-surface p-2.5 space-y-1.5">
            <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-100 mb-1">
              <span className="text-[11.5px] font-semibold text-[#64748B]">
                设置导航
              </span>
              <button
                type="button"
                onClick={() => setNavCollapsed(true)}
                title="收起设置导航"
                aria-label="收起设置导航"
                className="w-7 h-7 rounded-full bg-[#FAFAFB] hairline inline-flex items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
            {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = settingsSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSettingsSection(item.key)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-[16px] flex items-start gap-2.5 cursor-pointer border-0 transition-all",
                  active
                    ? "bg-[#141417] text-white shadow-[0_6px_14px_-6px_rgba(20,20,23,0.34)]"
                    : "bg-transparent text-[#334155] hover:bg-[#FAFAFB]"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 mt-0.5",
                    active ? "text-white" : "text-[#64748B]"
                  )}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold leading-tight">
                    {item.label}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] mt-0.5 truncate",
                      active ? "text-white/75" : "text-[#94A3B8]"
                    )}
                  >
                    {item.desc}
                  </div>
                </div>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAdminPromptOpen(true)}
              className="w-full text-left px-3 py-2.5 rounded-[16px] flex items-center gap-2.5 cursor-pointer bg-[#FAFAFB] hover:bg-slate-100/80 border border-slate-200/70 text-[#0F172A] transition-all"
            >
              <ShieldCheck className="w-4 h-4 theme-text shrink-0" />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">
                  管理员 Prompt 控制台
                </div>
                <div className="text-[10.5px] text-[#64748B] mt-0.5">
                  系统提示词调优与回滚
                </div>
              </div>
            </button>
            </div>
          </aside>
        )}

        {/* 右侧设置子面板内容 */}
        <section className="min-w-0">
          {settingsSection === "appearance" && (
            <AppearanceSettingsPanel bootstrap={bootstrap} />
          )}
          {settingsSection === "mailbox" && (
            <MailboxSettingsPanel bootstrap={bootstrap} />
          )}
          {settingsSection === "ai" && (
            <AiPolicySettingsPanel bootstrap={bootstrap} />
          )}
          {settingsSection === "data" && (
            <DataBackupSettingsPanel bootstrap={bootstrap} />
          )}
        </section>
      </div>
    </div>
  );
}
