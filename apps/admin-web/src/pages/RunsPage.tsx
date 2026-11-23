import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flame, Snowflake } from "lucide-react";
import { toast } from "sonner";
import { opsApi } from "@/lib/ops-api.js";

export function RunsPage() {
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [logCat, setLogCat] = useState("all");

  const schedulesQuery = useQuery({
    queryKey: ["ops-schedules"],
    queryFn: opsApi.getSchedules,
  });

  const runsQuery = useQuery({
    queryKey: ["ops-runs"],
    queryFn: opsApi.getRuns,
  });

  const logsQuery = useQuery({
    queryKey: ["ops-run-logs", selectedRunId, logCat],
    queryFn: () => opsApi.getRunLogs(selectedRunId!, logCat),
    enabled: Boolean(selectedRunId),
  });

  const seasonMutation = useMutation({
    mutationFn: (seasonMode: "peak" | "off_peak") => opsApi.switchSeason(seasonMode),
    onSuccess: (res) => {
      toast.success(
        res.seasonMode === "peak"
          ? "已切换为旺季高频巡检模式（9–11月 / 3–5月）"
          : "已切换为淡季低频省资源模式"
      );
      queryClient.invalidateQueries({ queryKey: ["ops-schedules"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      opsApi.updateSchedule(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-schedules"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const schedules = schedulesQuery.data?.items || [];
  const activeSeason = schedules[0]?.seasonMode || "off_peak";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">03 · 定时管道与运行日志 Scheduler</h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            管理 4 条核心 Cron 管道、一键切换淡/旺季巡检频率，以及按错误类别排查抓取日志
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-[#E5E7EB] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => seasonMutation.mutate("peak")}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium cursor-pointer ${
              activeSeason === "peak" ? "bg-[#FF5C35] text-white" : "text-[#475569]"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            招博旺季高频
          </button>
          <button
            type="button"
            onClick={() => seasonMutation.mutate("off_peak")}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-medium cursor-pointer ${
              activeSeason === "off_peak" ? "bg-[#141417] text-white" : "text-[#475569]"
            }`}
          >
            <Snowflake className="w-3.5 h-3.5" />
            淡季低频省流
          </button>
        </div>
      </div>

      {/* 4 Schedules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {schedules.map((s) => (
          <div key={s.id} className="ops-card p-4 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-[13.5px]">{s.name}</span>
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) =>
                      toggleScheduleMutation.mutate({ id: s.id, enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-[#141417]"
                  />
                </label>
              </div>
              <p className="text-[11.5px] text-[#64748B]">{s.description}</p>
            </div>
            <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px] ops-mono text-[#475569]">
              <span>CRON: {s.cronExpr}</span>
              <span>{s.aiMode}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Run History & Logs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
        <div className="ops-card p-5 md:col-span-3 min-w-0 space-y-3">
          <h2 className="text-[15px] font-bold">采集运行记录（点击查看分类日志）</h2>
          <div className="divide-y divide-[#F1F5F9]">
            {(runsQuery.data?.items || []).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRunId(r.id)}
                className={`w-full text-left py-3 px-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer ${
                  selectedRunId === r.id ? "bg-[#F8FAFC]" : "hover:bg-[#FAFAFB]"
                }`}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="font-semibold text-[13px] truncate">{r.scope}</div>
                  <div className="text-[11.5px] text-[#64748B] truncate">{r.summary}</div>
                  <div className="text-[11px] ops-mono text-[#94A3B8]">
                    {r.startedAt.replace("T", " ").slice(0, 19)} · 总页 {r.totalPages} · 规则{" "}
                    {r.ruleParsed} · AI {r.aiCalls} · ¥{r.actualCostCny.toFixed(2)}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] ops-mono ${
                    r.status === "succeeded"
                      ? "bg-[#ECFDF5] text-[#059669]"
                      : r.status === "failed"
                      ? "bg-[#FEF2F2] text-[#DC2626]"
                      : "bg-[#FFFBEB] text-[#D97706]"
                  }`}
                >
                  {r.status}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="ops-card p-5 md:col-span-2 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-bold">运行明细日志</h2>
            <select
              value={logCat}
              onChange={(e) => setLogCat(e.target.value)}
              className="h-8 px-2 rounded-lg border border-[#E5E7EB] text-[12px]"
            >
              <option value="all">全部类别</option>
              <option value="403_blocked">403_blocked</option>
              <option value="timeout">timeout</option>
              <option value="upstream_failed">upstream_failed</option>
            </select>
          </div>
          {!selectedRunId ? (
            <div className="py-12 text-center text-[12.5px] text-[#64748B]">
              点击左侧任意运行记录查看日志明细
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto text-[12px]">
              {(logsQuery.data?.items || []).map((log: any) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] space-y-1"
                >
                  <div className="flex items-center justify-between ops-mono text-[10.5px]">
                    <span
                      className={
                        log.level === "error"
                          ? "text-[#DC2626]"
                          : log.level === "warn"
                          ? "text-[#D97706]"
                          : "text-[#059669]"
                      }
                    >
                      [{log.level.toUpperCase()}] {log.errorCategory || "ok"}
                    </span>
                    <span className="text-[#94A3B8]">{log.createdAt.slice(11, 19)}</span>
                  </div>
                  <div className="text-[#0F172A]">{log.message}</div>
                  {log.url && (
                    <div className="ops-mono text-[10.5px] text-[#64748B] truncate">{log.url}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
