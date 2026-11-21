import React, { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, MailCheck, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, DrawerSheet, SwitchControl } from "./ui";
import { apiFetch, cn, formatCountdown, toLocalInputValue } from "../lib/api";
import type { DispatchPlan, JobState, PolicyConfig } from "../types";

export function DispatchDrawer({
  open,
  onOpenChange,
  job,
  policy,
  onJobStarted,
  onAfterQuotaReset,
  askConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  job: JobState | null;
  policy?: PolicyConfig;
  onJobStarted: () => void;
  onAfterQuotaReset: () => Promise<void>;
  askConfirm: (opts: { title: string; message: string; confirmText?: string }) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"send" | "draft">("send");
  const [ignoreQuota, setIgnoreQuota] = useState(false);
  const [sendTiming, setSendTiming] = useState<"now" | "scheduled">("now");
  const [scheduleInput, setScheduleInput] = useState("");
  const [plan, setPlan] = useState<DispatchPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  async function refreshPlan(m = mode, iq = ignoreQuota, timing = sendTiming, sched = scheduleInput, notify = false) {
    setLoadingPlan(true);
    try {
      const startAt = m === "send" && timing === "scheduled" ? sched.trim() : "";
      const res = await apiFetch<{ plan: DispatchPlan }>("/api/dispatch/plan", "POST", {
        mode: m,
        ignore_quota: iq,
        start_at: startAt,
      });
      setPlan(res.plan);
      if (notify) toast.success("已刷新待发队列");
    } catch (e: any) {
      toast.error(`刷新队列失败：${e.message}`);
    } finally {
      setLoadingPlan(false);
    }
  }

  useEffect(() => {
    if (open) {
      refreshPlan();
    }
  }, [open]);

  function ensureDefaultSchedule() {
    if (scheduleInput) return scheduleInput;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const val = toLocalInputValue(d);
    setScheduleInput(val);
    return val;
  }

  function applyPreset(preset: "1h" | "tomorrow9" | "tomorrow14") {
    const d = new Date();
    if (preset === "1h") {
      d.setHours(d.getHours() + 1);
      d.setSeconds(0, 0);
    } else if (preset === "tomorrow9") {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + 1);
      d.setHours(14, 30, 0, 0);
    }
    const val = toLocalInputValue(d);
    setScheduleInput(val);
    refreshPlan(mode, ignoreQuota, "scheduled", val);
  }

  async function handleStart() {
    if (!plan || plan.ready_count === 0) return;
    const startAt = mode === "send" && sendTiming === "scheduled" ? scheduleInput.trim() : "";
    if (mode === "send") {
      if (startAt) {
        const dt = new Date(startAt);
        if (Number.isNaN(dt.getTime()) || dt.getTime() <= Date.now()) {
          toast.warning("请选择一个晚于当前时间的预约发送时间");
          return;
        }
        const ok = await askConfirm({
          title: "确认预约批量发送",
          message: `将在 ${startAt.replace("T", " ")} 自动启动，共发送 ${plan.ready_count} 封邮件。\n每封自动随机间隔 ${policy?.min_delay_sec ?? 180}~${policy?.max_delay_sec ?? 420} 秒，保持软件开启即可。`,
          confirmText: "确认预约",
        });
        if (!ok) return;
      } else {
        const ok = await askConfirm({
          title: "确认启动批量慢速发送",
          message: `即将错峰发出 ${plan.ready_count} 封邮件，发完自动更新表格状态。确认开始吗？`,
          confirmText: "开始发送",
        });
        if (!ok) return;
      }
    }

    try {
      await apiFetch("/api/dispatch/start", "POST", {
        mode,
        ignore_quota: ignoreQuota,
        start_at: startAt,
      });
      toast.success(startAt ? "已预约定时发送" : "批量发送任务已开始");
      onJobStarted();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleResetQuota() {
    try {
      await apiFetch("/api/quota/reset", "POST", {});
      await onAfterQuotaReset();
      await refreshPlan();
      toast.success("已重置今日发信计数");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const isRunning = Boolean(job?.running);
  const showLive = Boolean(job && (job.running || job.finished_at));
  const pct = job && job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0;

  return (
    <DrawerSheet
      open={open}
      onOpenChange={onOpenChange}
      wide
      title="批量发送助手"
      subtitle="只发 1 封邮件时可在主界面直接点「立即发送」；攒了多封「待发送」信件时，用这里自动错峰发出更稳妥"
      footer={
        <>
          <div className="flex items-center gap-3">
            <SwitchControl
              checked={ignoreQuota}
              onCheckedChange={(v) => {
                setIgnoreQuota(v);
                refreshPlan(mode, v, sendTiming, scheduleInput);
              }}
              label="允许超出今日限额"
            />
            <button
              type="button"
              onClick={handleResetQuota}
              className="text-[11.5px] text-[#71717A] hover:text-[#18181B] hover:underline cursor-pointer"
            >
              重置计数
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="danger"
                onClick={async () => {
                  await apiFetch("/api/dispatch/stop", "POST", {});
                  toast.warning("已下发停止信号，当前邮件处理完即停");
                }}
              >
                停止剩余发送
              </Button>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
            <Button
              variant="primary"
              disabled={isRunning || !plan || plan.ready_count === 0}
              onClick={handleStart}
            >
              {mode === "draft"
                ? `一键存入邮箱草稿箱（${plan?.ready_count ?? 0} 封）`
                : sendTiming === "scheduled"
                  ? `预约错峰发送（${plan?.ready_count ?? 0} 封）`
                  : `开始错峰发送（${plan?.ready_count ?? 0} 封）`}
            </Button>
          </div>
        </>
      }
    >
      {/* Mode Switch Cards */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setMode("send");
            refreshPlan("send", ignoreQuota, sendTiming, scheduleInput);
          }}
          className={cn(
            "text-left p-4 rounded-[14px] cursor-pointer transition-all select-none active:scale-[0.99]",
            mode === "send"
              ? "bg-white ring-2 ring-[#18181B] shadow-card"
              : "bg-white ring-1 ring-slate-900/[0.07] hover:bg-[#F8F9FB]"
          )}
        >
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-[#18181B]" />
            <span className="font-bold text-[13px] text-[#18181B]">错峰慢速直接发送</span>
          </div>
          <div className="text-[11.5px] text-[#6B7280] mt-1 leading-relaxed">
            每封随机间隔几分钟并自动避开同校连续发信，支持预约时间发送
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setMode("draft");
            refreshPlan("draft", ignoreQuota, sendTiming, scheduleInput);
          }}
          className={cn(
            "text-left p-4 rounded-[14px] cursor-pointer transition-all select-none active:scale-[0.99]",
            mode === "draft"
              ? "bg-white ring-2 ring-[#18181B] shadow-card"
              : "bg-white ring-1 ring-slate-900/[0.07] hover:bg-[#F8F9FB]"
          )}
        >
          <div className="flex items-center gap-2">
            <MailCheck className="w-4 h-4 text-[#18181B]" />
            <span className="font-bold text-[13px] text-[#18181B]">先批量存进邮箱草稿箱</span>
          </div>
          <div className="text-[11.5px] text-[#6B7280] mt-1 leading-relaxed">
            统一写入发件邮箱的草稿箱，方便你再去网页或手机上逐一确认后手动点发
          </div>
        </button>
      </div>

      {/* Schedule Options */}
      {mode === "send" && plan && (
        <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4 flex items-center gap-2.5 flex-wrap">
          <span className="text-[12.5px] font-semibold text-[#18181B]">发送时机：</span>
          <label
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full ring-1 text-[12px] cursor-pointer transition-colors",
              sendTiming === "now"
                ? "bg-[#18181B] text-white ring-[#18181B] font-medium"
                : "bg-[#F8F9FB] ring-slate-900/[0.08] text-[#52525B]"
            )}
          >
            <input
              type="radio"
              name="sendTiming"
              checked={sendTiming === "now"}
              onChange={() => {
                setSendTiming("now");
                refreshPlan(mode, ignoreQuota, "now", scheduleInput);
              }}
              className="hidden"
            />
            <span>立即开始</span>
          </label>

          <label
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full ring-1 text-[12px] cursor-pointer transition-colors",
              sendTiming === "scheduled"
                ? "bg-[#18181B] text-white ring-[#18181B] font-medium"
                : "bg-[#F8F9FB] ring-slate-900/[0.08] text-[#52525B]"
            )}
          >
            <input
              type="radio"
              name="sendTiming"
              checked={sendTiming === "scheduled"}
              onChange={() => {
                setSendTiming("scheduled");
                const val = ensureDefaultSchedule();
                refreshPlan(mode, ignoreQuota, "scheduled", val);
              }}
              className="hidden"
            />
            <span>预约时间自动发</span>
          </label>

          {sendTiming === "scheduled" && (
            <div className="inline-flex items-center gap-1.5 flex-wrap">
              <input
                type="datetime-local"
                value={scheduleInput}
                onChange={(e) => {
                  setScheduleInput(e.target.value);
                  refreshPlan(mode, ignoreQuota, "scheduled", e.target.value);
                }}
                className="h-7 px-2 ring-1 ring-slate-900/[0.1] rounded-[7px] font-mono text-[12px] bg-white outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              {[
                { k: "1h" as const, l: "+1小时" },
                { k: "tomorrow9" as const, l: "明早 09:00" },
                { k: "tomorrow14" as const, l: "明下午 14:30" },
              ].map((p) => (
                <button
                  key={p.k}
                  type="button"
                  onClick={() => applyPreset(p.k)}
                  className="text-[12px] text-[#2563EB] font-medium px-2 py-0.5 rounded-[6px] hover:bg-[#EFF6FF] cursor-pointer"
                >
                  {p.l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Friendly White Visual Progress Card (No scary black hacker console!) */}
      {showLive && job && (
        <div className="bg-white ring-1 ring-slate-900/[0.08] rounded-[16px] shadow-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {job.running ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
              )}
              <h3 className="m-0 text-[13.5px] font-bold text-[#18181B]">
                {job.running ? "正在执行发送队列" : "本轮任务已完成"}
              </h3>
            </div>
            <span className="font-mono text-[12px] tabular-nums text-[#52525B]">
              {job.completed}/{job.total}（成功 {job.succeeded} · 失败 {job.failed}）
            </span>
          </div>

          <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div className="h-full rounded-full bg-[#18181B] transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center justify-between text-[12.5px] text-[#52525B]">
            <span>
              {job.running && (job.schedule_wait_seconds || 0) > 0
                ? `已预约于 ${job.scheduled_start_at} 自动开始`
                : job.running && job.waiting_seconds > 0
                  ? job.next_item
                    ? `防拦截休息中，下一封发给 ${job.next_item.name}（${job.next_item.sheet}）`
                    : "准备下一封..."
                  : job.running && job.current_item
                    ? `正在投递：${job.current_item.name}（${job.current_item.sheet}）`
                    : `完成时间：${job.finished_at}`}
            </span>
            {job.running && ((job.schedule_wait_seconds || 0) > 0 || job.waiting_seconds > 0) && (
              <span className="inline-flex items-center gap-1 font-mono text-[12px] px-2.5 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] font-semibold">
                <Clock className="w-3 h-3" />
                <span>
                  {formatCountdown((job.schedule_wait_seconds || 0) > 0 ? (job.schedule_wait_seconds || 0) : job.waiting_seconds)}
                </span>
              </span>
            )}
          </div>

          <div className="space-y-1.5 max-h-[160px] overflow-y-auto pt-1">
            {(job.items || []).map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between px-3 py-2 rounded-[9px] bg-[#F8F9FB] text-[12px]"
              >
                <span className="font-medium text-[#18181B]">
                  {it.name} <span className="text-[#71717A] font-normal">· {it.sheet}</span>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    it.exec_status === "ok"
                      ? "text-[#047857]"
                      : it.exec_status === "error"
                        ? "text-[#BE123C]"
                        : it.exec_status === "processing"
                          ? "text-[#2563EB]"
                          : "text-[#9CA3AF]"
                  )}
                >
                  {it.exec_status === "ok" && <CheckCircle2 className="w-3.5 h-3.5" />}
                  {it.exec_status === "error" && <XCircle className="w-3.5 h-3.5" />}
                  {it.exec_status === "processing" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{it.exec_msg || "排队中"}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue Preview List */}
      <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-[13.5px] font-bold text-[#18181B]">
            本次待发名单（自动拉取状态为「待发送」的导师）
          </h3>
          <Button
            size="sm"
            variant="ghost"
            loading={loadingPlan}
            onClick={() => refreshPlan(mode, ignoreQuota, sendTiming, scheduleInput, true)}
          >
            刷新名单
          </Button>
        </div>

        <div className="max-h-[300px] overflow-y-auto ring-1 ring-slate-900/[0.06] rounded-[11px]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#F8F9FB] text-[#71717A]">
                <th className="sticky top-0 bg-[#F8F9FB] text-left px-3 py-2 border-b border-slate-900/[0.06] w-10 font-medium">序</th>
                <th className="sticky top-0 bg-[#F8F9FB] text-left px-3 py-2 border-b border-slate-900/[0.06] w-36 font-medium">导师 / 高校</th>
                <th className="sticky top-0 bg-[#F8F9FB] text-left px-3 py-2 border-b border-slate-900/[0.06] font-medium">收件邮箱 &amp; 标题</th>
                <th className="sticky top-0 bg-[#F8F9FB] text-left px-3 py-2 border-b border-slate-900/[0.06] w-28 font-medium">发件箱</th>
                <th className="sticky top-0 bg-[#F8F9FB] text-left px-3 py-2 border-b border-slate-900/[0.06] w-40 font-medium">检查结果</th>
              </tr>
            </thead>
            <tbody>
              {!plan || plan.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-[#71717A]">
                    目前没有标为「待发送」的信件。你可以在主界面把写好的信点「加入批量待发」，或直接点「立即发送这一封」。
                  </td>
                </tr>
              ) : (
                plan.items.map((it, i) => (
                  <tr key={it.id} className="border-b border-slate-900/[0.05] last:border-b-0 hover:bg-[#F8F9FB]/70">
                    <td className="px-3 py-2 font-mono text-[#9CA3AF] tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-[#18181B]">{it.name}</div>
                      <div className="text-[11px] text-[#71717A]">{it.sheet}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[#18181B]">{it.to_email || "未填邮箱"}</div>
                      <div className="text-[11px] text-[#71717A] truncate max-w-[260px]">
                        {it.subject || "（无标题）"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {it.account_id ? (
                        <div className="font-medium text-[#18181B]">{it.account_id}</div>
                      ) : (
                        <span className="text-[#9CA3AF]">未分配</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {it.ready ? (
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#047857] text-[11px] font-medium">
                            准备就绪
                          </span>
                          {it.warnings?.length > 0 && (
                            <div className="text-[11px] text-[#B45309] mt-0.5">{it.warnings.join("；")}</div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-[#FFF1F2] text-[#BE123C] text-[11px] font-medium">
                            需补充信息
                          </span>
                          <div className="text-[11px] text-[#BE123C] mt-0.5">{it.issues.join("；")}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DrawerSheet>
  );
}
