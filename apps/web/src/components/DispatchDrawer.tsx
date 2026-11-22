import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
  Rocket,
  Save,
  ShieldAlert,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { formatCountdown, type BootstrapData, type DispatchPlan } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ConfirmDialog } from "./ui/BaseDialog.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { Button } from "./ui/Button.js";
import { FamilyDrawer } from "./ui/FamilyDrawer.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { SlidingNumber } from "./ui/SlidingNumber.js";

export interface DispatchDrawerProps {
  bootstrap: BootstrapData;
}

/**
 * 批量套磁错峰发件与定时调度队列抽屉：
 * 支持生成干跑预演计划、配额拦截预警、未来时刻定时发信与实时进度日志轮询。
 */
export function DispatchDrawer({ bootstrap }: DispatchDrawerProps) {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.dispatchOpen);
  const setOpen = useAppStore((s) => s.setDispatchOpen);
  const batchSelectedIds = useAppStore((s) => s.batchSelectedIds);
  const clearBatchSelected = useAppStore((s) => s.clearBatchSelected);
  const triggerCelebration = useAppStore((s) => s.triggerCelebration);

  const [mode, setMode] = useState<"send" | "draft">("send");
  const [scheduledStartAt, setScheduledStartAt] = useState("");
  const [ignoreQuota, setIgnoreQuota] = useState(false);
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["dispatch-status"],
    queryFn: workerApi.getDispatchStatus,
    enabled: open,
    refetchInterval: (q) => {
      const st = q.state.data?.job?.status;
      return st === "running" || st === "waiting_schedule" ? 1200 : false;
    },
  });

  const job = statusQuery.data?.job ?? bootstrap.job;
  const isJobActive =
    job?.status === "running" || job?.status === "waiting_schedule";

  const scopedAdvisorIds = batchSelectedIds.length > 0 ? batchSelectedIds : undefined;

  const planMutation = useMutation({
    mutationFn: () =>
      workerApi.buildDispatchPlan({
        mode,
        advisorIds: scopedAdvisorIds,
        ignoreQuota,
        scheduledStartAt: scheduledStartAt.trim(),
      }),
    onSuccess: (res) => {
      setPlan(res.plan);
      toast.success(
        `计划预演完成：可立即执行 ${res.plan.readyCount} 位，受阻 ${res.plan.blockedCount} 位`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: () =>
      workerApi.startDispatch({
        mode,
        advisorIds: scopedAdvisorIds,
        ignoreQuota,
        scheduledStartAt: scheduledStartAt.trim(),
      }),
    onSuccess: async (res) => {
      setConfirmStartOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["dispatch-status"] });
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(
        res.job.status === "waiting_schedule"
          ? "定时队列已挂起等待到时执行"
          : "批量调度队列已启动"
      );
      if (mode === "send") {
        triggerCelebration(`批量发件队列已启动（共 ${res.job.total} 封）`);
      }
    },
    onError: (err: Error) => {
      setConfirmStartOpen(false);
      toast.error(err.message);
    },
  });

  const stopMutation = useMutation({
    mutationFn: workerApi.stopDispatch,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-status"] });
      toast.info("已下发停止信号，当前封处理完后将安全中止");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetQuotaMutation = useMutation({
    mutationFn: workerApi.resetTodayQuota,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-status"] });
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已重置今日客户端发信计数窗口");
      if (plan) planMutation.mutate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const readyCount = bootstrap.advisors.filter((a) => a.stage === "ready").length;

  return (
    <FamilyDrawer
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <Rocket className="w-4 h-4 theme-text" />
          <span>错峰批量调度与定时队列</span>
        </span>
      }
      description={
        batchSelectedIds.length > 0
          ? `仅针对已勾选的 ${batchSelectedIds.length} 位导师排期 · 避开连续同校域名，随机间隔 ${bootstrap.policy.minDelaySec}~${bootstrap.policy.maxDelaySec} 秒`
          : `自动排期所有处于「待发送」状态的导师（当前 ${readyCount} 位）· 避开连续同校域名，随机间隔 ${bootstrap.policy.minDelaySec}~${bootstrap.policy.maxDelaySec} 秒`
      }
      widthClass="w-full max-w-[780px]"
    >
      <div className="space-y-5 text-[12px]">
        {batchSelectedIds.length > 0 && (
          <div className="px-4 py-2.5 rounded-[14px] theme-soft-pill flex items-center justify-between gap-3">
            <span className="font-medium">
              当前仅针对「我的导师」中已勾选的 {batchSelectedIds.length} 位导师生成发件/草稿计划
            </span>
            <button
              type="button"
              onClick={() => {
                clearBatchSelected();
                setPlan(null);
              }}
              className="text-[11.5px] font-semibold underline cursor-pointer bg-transparent border-0"
            >
              取消勾选，改为全部待发送导师
            </button>
          </div>
        )}
        {/* 参数控制区 */}
        <section className="tactile-card rounded-2xl p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl<"send" | "draft">
              size="sm"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setPlan(null);
              }}
              options={[
                {
                  value: "send",
                  label: "实发邮件队列",
                  icon: <Rocket className="w-3.5 h-3.5" />,
                },
                {
                  value: "draft",
                  label: "批量存至草稿箱",
                  icon: <Save className="w-3.5 h-3.5" />,
                },
              ]}
            />

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                loading={resetQuotaMutation.isPending}
                onClick={() => resetQuotaMutation.mutate()}
              >
                清零今日计数
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={planMutation.isPending}
                icon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => planMutation.mutate()}
              >
                生成预演计划
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 items-center">
            <div>
              <label className="text-[11px] text-slate-500">
                定时启动时刻（留空表示立即开始）
              </label>
              <input
                type="datetime-local"
                value={scheduledStartAt}
                onChange={(e) => setScheduledStartAt(e.target.value)}
                className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
              />
            </div>
            <div className="pt-4">
              <BaseSwitch
                checked={ignoreQuota}
                label="忽略单箱今日上限限制（谨慎开启）"
                onCheckedChange={setIgnoreQuota}
              />
            </div>
          </div>
        </section>

        {/* 预演计划配额与导师检查清单 */}
        {plan && (
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#111827]">
                预演排期明细（可执行 {plan.readyCount} / 总计 {plan.total}）
              </h3>
              <Button
                variant={mode === "send" ? "primary" : "glass"}
                size="sm"
                disabled={plan.readyCount === 0 || isJobActive}
                loading={startMutation.isPending}
                icon={<Play className="w-3.5 h-3.5" />}
                onClick={() => {
                  if (mode === "send") {
                    setConfirmStartOpen(true);
                  } else {
                    startMutation.mutate();
                  }
                }}
              >
                {scheduledStartAt ? "挂起定时任务" : "启动执行队列"}
              </Button>
            </div>

            {plan.accounts.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {plan.accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-0.5"
                  >
                    <div className="font-semibold text-[#111827] truncate">
                      {acc.label}
                    </div>
                    <div className="text-[10.5px] font-mono text-slate-500">
                      已用 {acc.usedToday} · 计划 +{acc.planned} · 剩余{" "}
                      {acc.remainingAfter}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {plan.items.map((item) => (
                <div
                  key={item.advisorId}
                  className={cn(
                    "px-3 py-2 rounded-xl border flex items-start justify-between gap-3",
                    item.ready
                      ? "bg-white border-slate-200/80"
                      : "bg-rose-50/60 border-rose-200/80"
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      {item.ready ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                      <span className="font-semibold text-[#111827]">
                        {item.advisorName}
                      </span>
                      <span className="text-slate-500">
                        {item.institutionName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {item.toEmail}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      主题：{item.subject || "（空白）"} · 附件：
                      {item.resumeName || "无"} · 分配发件箱：{item.accountLabel || "未分配"}
                    </div>
                    {item.issues.length > 0 && (
                      <div className="text-[11px] text-rose-600">
                        拦截原因：{item.issues.join("；")}
                      </div>
                    )}
                    {item.warnings.length > 0 && (
                      <div className="text-[11px] text-amber-600 inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        {item.warnings.join("；")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 实时任务监控与日志终端 */}
        {job && (
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-[#111827]">
                  最近队列执行状态
                </span>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10.5px] font-medium border",
                    job.status === "running" &&
                      "bg-blue-50 text-[#2563EB] border-blue-200",
                    job.status === "waiting_schedule" &&
                      "bg-indigo-50 text-indigo-700 border-indigo-200",
                    job.status === "completed" &&
                      "bg-emerald-50 text-emerald-700 border-emerald-200",
                    job.status === "stopped" &&
                      "bg-amber-50 text-amber-700 border-amber-200"
                  )}
                >
                  {job.status === "running"
                    ? "正在执行"
                    : job.status === "waiting_schedule"
                      ? "定时倒计时中"
                      : job.status === "completed"
                        ? "已完成"
                        : "已停止"}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[12px] text-slate-600">
                  成功 <SlidingNumber value={job.succeeded} className="text-emerald-600 font-bold" /> / 失败{" "}
                  <SlidingNumber value={job.failed} className="text-rose-500 font-bold" /> / 共{" "}
                  {job.total}
                </span>
                {isJobActive && (
                  <Button
                    variant="danger"
                    size="xs"
                    loading={stopMutation.isPending}
                    icon={<Square className="w-3 h-3" />}
                    onClick={() => stopMutation.mutate()}
                  >
                    紧急停止
                  </Button>
                )}
              </div>
            </div>

            {(job.scheduleWaitSeconds > 0 || job.waitingSeconds > 0) && (
              <div className="px-3 py-2 rounded-xl bg-blue-50/80 border border-blue-200/75 text-[#1D4ED8] flex items-center gap-2 font-mono">
                <Clock className="w-4 h-4" />
                {job.scheduleWaitSeconds > 0
                  ? `距离定时启动还剩 ${formatCountdown(job.scheduleWaitSeconds)}`
                  : `安全错峰间隔等待中：${formatCountdown(job.waitingSeconds)}`}
              </div>
            )}

            <div className="rounded-xl bg-slate-900 text-slate-200 p-3 font-mono text-[11px] max-h-44 overflow-y-auto space-y-1">
              {job.logs.length === 0 ? (
                <div className="text-slate-500">暂无输出日志</div>
              ) : (
                job.logs.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={confirmStartOpen}
        onOpenChange={setConfirmStartOpen}
        title={`确认启动实发邮件队列（${plan?.readyCount || 0} 封）？`}
        description={
          scheduledStartAt
            ? `任务将于 ${scheduledStartAt} 自动开始错峰投递，中途随时可点击「紧急停止」。`
            : "系统将按同域交错与随机延迟策略逐封真实发送 SMTP 邮件，不可撤回。"
        }
        confirmLabel="确认启动"
        loading={startMutation.isPending}
        onConfirm={() => startMutation.mutate()}
      />
    </FamilyDrawer>
  );
}
