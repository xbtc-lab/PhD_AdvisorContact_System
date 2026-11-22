import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Command,
  Inbox,
  LayoutGrid,
  MailPlus,
  RefreshCw,
  Rocket,
  Settings,
  Sparkles,
  Table2,
} from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { CueMascot } from "./ui/BrandMascot.js";
import { Button } from "./ui/Button.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { BaseTooltip } from "./ui/BaseTooltip.js";

export interface TopbarProps {
  bootstrap: BootstrapData;
}

/**
 * 顶部磨砂导航栏：承载视图切换、全局 Cmd+K 命令面板入口及高频工具动作。
 */
export function Topbar({ bootstrap }: TopbarProps) {
  const queryClient = useQueryClient();
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setAiImportOpen = useAppStore((s) => s.setAiImportOpen);
  const setQuickComposeOpen = useAppStore((s) => s.setQuickComposeOpen);
  const setReplyAlertOpen = useAppStore((s) => s.setReplyAlertOpen);
  const setDispatchOpen = useAppStore((s) => s.setDispatchOpen);
  const openSettings = useAppStore((s) => s.openSettings);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);

  const unreadCount = bootstrap.unreadReplies.length;
  const activeJobRunning =
    bootstrap.job?.status === "running" ||
    bootstrap.job?.status === "waiting_schedule";
  const mailReady = bootstrap.mailAccounts.some((a) => a.enabled && a.hasCredential);
  const aiReady = bootstrap.aiConfig.hasApiKey;

  const syncMutation = useMutation({
    mutationFn: workerApi.syncReplies,
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      if (res.skipped) {
        toast.info(res.reason || "暂未配置可用 IMAP 发件箱");
        return;
      }
      if (res.newReplies.length > 0) {
        toast.success(`收到 ${res.newReplies.length} 封导师新回信！`);
        setReplyAlertOpen(true);
      } else if (res.unreadReplies.length > 0) {
        toast.info(`共有 ${res.unreadReplies.length} 封未读回信等待查看`);
        setReplyAlertOpen(true);
      } else {
        toast.success("已同步收件箱，暂无新的导师回信");
      }
      if (res.errors.length > 0) {
        toast.warning(`部分邮箱同步提示：${res.errors[0]}`);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "同步回信失败");
    },
  });

  return (
    <header className="h-14 shrink-0 px-4 glass-surface border-x-0 border-t-0 border-b border-slate-200/75 flex items-center justify-between gap-3 z-30">
      {/* 左侧：品牌 Mascot 与工作视图切换 */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2.5 pr-1">
          <CueMascot size={32} />
          <div className="leading-tight hidden sm:block">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-bold tracking-tight text-[#111827]">
                PhD Studio
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#2563EB] border border-blue-200/80">
                v2
              </span>
            </div>
            <p className="text-[10px] text-slate-400">科研套磁与回信追踪台</p>
          </div>
        </div>

        <SegmentedControl
          size="sm"
          value={viewMode}
          onChange={setViewMode}
          options={[
            {
              value: "workspace",
              label: "写信工作台",
              icon: <LayoutGrid className="w-3.5 h-3.5" />,
            },
            {
              value: "table",
              label: "导师数据台账",
              icon: <Table2 className="w-3.5 h-3.5" />,
              badge: bootstrap.advisors.length,
            },
          ]}
        />
      </div>

      {/* 中部：全局快捷搜索命令入口 (Ctrl/Cmd + K) */}
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="hidden lg:flex items-center justify-between gap-4 w-64 h-8 px-3 rounded-2xl bg-slate-100/80 hover:bg-white border border-slate-200/80 hover:border-[#2563EB]/35 text-[12px] text-slate-400 hover:text-slate-600 transition-all cursor-pointer shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Command className="w-3.5 h-3.5 text-slate-400" />
          <span>搜索导师、高校或快速跳转...</span>
        </span>
        <kbd className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono text-slate-500">
          ⌘K
        </kbd>
      </button>

      {/* 右侧：高频工具按钮组 */}
      <div className="flex items-center gap-2 shrink-0">
        <BaseTooltip content="直接填写收件地址写一封独立邮件">
          <Button
            variant="ghost"
            size="sm"
            icon={<MailPlus className="w-3.5 h-3.5" />}
            onClick={() => setQuickComposeOpen(true)}
          >
            <span className="hidden xl:inline">写新邮件</span>
          </Button>
        </BaseTooltip>

        <Button
          variant="glass"
          size="sm"
          icon={<Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />}
          onClick={() => setAiImportOpen(true)}
        >
          AI 采集导师
        </Button>

        <div className="relative inline-flex items-center">
          <Button
            variant={unreadCount > 0 ? "coral" : "secondary"}
            size="sm"
            loading={syncMutation.isPending}
            icon={
              unreadCount > 0 ? (
                <Inbox className="w-3.5 h-3.5" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )
            }
            onClick={() => {
              if (unreadCount > 0) {
                setReplyAlertOpen(true);
              } else {
                syncMutation.mutate();
              }
            }}
          >
            {unreadCount > 0 ? `未读回信 (${unreadCount})` : "收取回信"}
          </Button>
          {unreadCount > 0 && (
            <BaseTooltip content="立即重新拉取 IMAP 新回信">
              <button
                type="button"
                aria-label="重新同步收件箱"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="ml-1 w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-[#2563EB] inline-flex items-center justify-center cursor-pointer"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5",
                    syncMutation.isPending && "animate-spin"
                  )}
                />
              </button>
            </BaseTooltip>
          )}
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={<Rocket className="w-3.5 h-3.5" />}
          onClick={() => setDispatchOpen(true)}
          className="relative"
        >
          <span>群发调度</span>
          {activeJobRunning && (
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping ml-0.5" />
          )}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          icon={<Settings className="w-3.5 h-3.5" />}
          onClick={() => openSettings(mailReady ? "profile" : "mailbox")}
          className="relative"
        >
          <span className="hidden md:inline">设置</span>
          {(!mailReady || !aiReady) && (
            <span
              title="还有邮箱或 AI Key 待配置"
              className="w-2 h-2 rounded-full bg-amber-400"
            />
          )}
        </Button>
      </div>
    </header>
  );
}
