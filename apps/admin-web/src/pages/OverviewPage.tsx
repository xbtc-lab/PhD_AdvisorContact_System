import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Compass, Plus, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { opsApi } from "@/lib/ops-api.js";
import type { OpsNavKey } from "@/components/OpsLayout.js";

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-[#10B981]",
  unprobed: "bg-[#CBD5E1]",
  degraded: "bg-[#F59E0B]",
  broken: "bg-[#EF4444]",
};

export function OverviewPage({
  onNavigate,
  onOpenOnboardModal,
}: {
  onNavigate: (nav: OpsNavKey) => void;
  onOpenOnboardModal: () => void;
}) {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["ops-overview"],
    queryFn: opsApi.getOverview,
  });

  const syncMutation = useMutation({
    mutationFn: () => opsApi.syncSoftScience({ year: 2025, limit: 100 }),
    onSuccess: (res) => {
      toast.success(`软科 Top 100 同步完成：新增 ${res.insertedCount} 所，更新 ${res.updatedCount} 所`);
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
      queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
      queryClient.invalidateQueries({ queryKey: ["ops-runs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = overviewQuery.data;
  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">01 · 运维驾驶舱 Overview</h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            软科 Top 100 + 非 Top 100 手动扩展院校采集监控 · 博导默认常规在招语义已启用
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#141417] text-white text-[12.5px] font-medium cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "正在同步软科..." : "一键同步软科 Top 100"}
          </button>
          <button
            type="button"
            onClick={onOpenOnboardModal}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#FF5C35] hover:bg-[#EA4D28] text-white text-[12.5px] font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新增非 Top 100 高校
          </button>
        </div>
      </div>

      {/* 4 Core KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ops-card p-5 space-y-1.5">
          <div className="text-[12px] text-[#64748B]">已纳管高校 / 学院</div>
          <div className="text-[26px] font-bold ops-mono tracking-tight">
            {kpis ? `${kpis.top100Count} + ${kpis.customManualCount}` : "--"}
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            Top 100 + 手动扩展 · 覆盖 {kpis?.totalColleges ?? 0} 个二级学院
          </div>
        </div>

        <div className="ops-card p-5 space-y-1.5">
          <div className="text-[12px] text-[#64748B]">公共导师库（常规在招）</div>
          <div className="text-[26px] font-bold ops-mono tracking-tight">
            {kpis ? kpis.totalAdvisors : "--"}
          </div>
          <div className="text-[11.5px] text-[#059669]">
            博导/在招 {kpis?.phdOpenCount ?? 0} 人（含明确招博 {kpis?.confirmedOpenCount ?? 0}）
          </div>
        </div>

        <div className="ops-card p-5 space-y-1.5">
          <div className="text-[12px] text-[#64748B]">规则直出占比 · 待审池</div>
          <div className="text-[26px] font-bold ops-mono tracking-tight text-[#059669]">
            {kpis ? `${kpis.ruleDirectRate}%` : "--"}
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            待核查导师 {kpis?.pendingAdvisors ?? 0} · 待审通知 {kpis?.pendingNotices ?? 0}
          </div>
        </div>

        <div className="ops-card p-5 space-y-1.5">
          <div className="text-[12px] text-[#64748B]">本月 AI 兜底开销</div>
          <div className="text-[26px] font-bold ops-mono tracking-tight">
            ¥{kpis ? kpis.monthCostCny.toFixed(2) : "0.00"}
          </div>
          <div className="text-[11.5px] text-[#64748B]">
            月预算上限 ¥{data?.guardrails?.monthlyBudgetCny ?? 200} · 默认纯规则 ¥0
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 高校健康矩阵 */}
        <div className="ops-card p-5 lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[14.5px] font-bold">高校源建档与健康度矩阵</h2>
              <p className="text-[12px] text-[#64748B]">
                绿=已健康运行 · 灰=待探测 · 黄/红=降级或需沙盒修复
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate("sources")}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[#FF5C35] cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              进入院校源管理 →
            </button>
          </div>

          <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-10 gap-1.5 pt-1">
            {(data?.matrix || []).map((u) => (
              <div
                key={u.id}
                title={`${u.rank ? `#${u.rank} ` : "[扩展] "}${u.name} (${u.healthStatus})`}
                onClick={() => onNavigate("sources")}
                className="h-7 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] hover:border-[#141417] px-1 flex items-center justify-center gap-1 cursor-pointer transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[u.healthStatus] || HEALTH_DOT.unprobed}`} />
                <span className="text-[10px] truncate text-[#334155]">
                  {u.shortName}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 最近抓取运行记录 */}
        <div className="ops-card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-bold">最近抓取任务</h2>
            <button
              type="button"
              onClick={() => onNavigate("runs")}
              className="text-[12px] text-[#64748B] hover:text-[#0F172A] cursor-pointer"
            >
              全部 →
            </button>
          </div>

          {(data?.recentRuns || []).length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-[#64748B] space-y-2">
              <Sparkles className="w-5 h-5 mx-auto text-[#94A3B8]" />
              <div>尚无运行记录，可先点击右上角「同步软科 Top 100」或去学院行触发抓取</div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data!.recentRuns.slice(0, 6).map((r) => (
                <div key={r.id} className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold truncate">{r.scope}</span>
                    <span
                      className={`text-[10.5px] ops-mono px-1.5 py-0.5 rounded ${
                        r.status === "succeeded"
                          ? "bg-[#ECFDF5] text-[#059669]"
                          : r.status === "failed"
                          ? "bg-[#FEF2F2] text-[#DC2626]"
                          : "bg-[#FFFBEB] text-[#D97706]"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748B] line-clamp-2">{r.summary || r.runKind}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
