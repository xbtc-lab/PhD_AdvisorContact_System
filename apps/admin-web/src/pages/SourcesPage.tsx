import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Compass,
  FlaskConical,
  Play,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import {
  opsApi,
  type OpsCollegeRow,
  type OpsUniversityRow,
} from "@/lib/ops-api.js";
import { CmsBadge, HealthBadge } from "@/components/OpsStatusBadge.js";
import { SandboxDrawer, type SandboxMode } from "@/components/SandboxDrawer.js";

const PORTAL_BUCKET_LABELS: Record<string, string> = {
  unified_api: "统一门户 API",
  boda_cms: "博达站群",
  chaoxing_cms: "超星学术",
  decentralized: "分散院系",
  custom: "手动定制",
};

export function SourcesPage({ onOpenOnboardModal }: { onOpenOnboardModal: () => void }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "top100" | "custom_manual">("all");
  const [health, setHealth] = useState("all");
  const [expandedUnis, setExpandedUnis] = useState<Set<string>>(new Set(["uni-seu", "uni-thu", "uni-swpu"]));

  // 添加二级学院弹窗状态
  const [addingCollegeFor, setAddingCollegeFor] = useState<OpsUniversityRow | null>(null);
  const [colName, setColName] = useState("计算机科学与技术学院");
  const [colUrl, setColUrl] = useState("");
  const [colFacultyUrl, setColFacultyUrl] = useState("");
  const [colNoticeUrl, setColNoticeUrl] = useState("");

  // 规则沙盒抽屉状态
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [sandboxUrl, setSandboxUrl] = useState("");
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("advisor_list");
  const [sandboxCollege, setSandboxCollege] = useState<OpsCollegeRow | null>(null);

  const unisQuery = useQuery({
    queryKey: ["ops-universities", q, scope, health],
    queryFn: () => opsApi.getUniversities({ q, sourceScope: scope, healthStatus: health }),
  });

  const syncMutation = useMutation({
    mutationFn: () => opsApi.syncSoftScience({ year: 2025, limit: 100 }),
    onSuccess: (res) => {
      toast.success(`软科 Top 100 同步完成：新增 ${res.insertedCount}，更新 ${res.updatedCount}`);
      queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const probeUniMutation = useMutation({
    mutationFn: ({ id, domain }: { id: string; domain?: string }) =>
      opsApi.probeExistingUniversity(id, domain),
    onSuccess: async (res) => {
      toast.success(
        `${res.university.name} 探测完成：${res.probe.colleges.length} 个院系候选，分桶=${res.university.portalBucket}`
      );
      if (res.probe?.colleges?.length > 0 && res.university.colleges?.length === 0) {
        // 自动帮用户把前 3 个含计算机关键词或前 3 个学院加入方便直接开抓，其他留手动
        const csFirst = res.probe.colleges.filter((c: any) => /计算机|软件|人工智能|信息/.test(c.name)).slice(0, 2);
        for (const cand of csFirst) {
          await opsApi
            .createCollege({
              universityId: res.university.id,
              name: cand.name,
              disciplineCategory: cand.disciplineCategory || "",
              collegeUrl: cand.collegeUrl,
              facultyListUrl: cand.facultyListUrl || "",
              noticeListUrl: cand.noticeListUrl || "",
              phdAdmissionUrl: "",
              cmsFingerprint: cand.cmsFingerprint || "unknown",
              facultyStrategy: "http",
              noticeStrategy: "date_anchor",
            })
            .catch(() => {});
        }
      }
      queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const crawlCollegeMutation = useMutation({
    mutationFn: (collegeId: string) =>
      opsApi.crawlCollege(collegeId, { maxAdvisors: 15, crawlNotices: true, validatePhotos: true }),
    onSuccess: (res) => {
      toast.success(res.summary);
      queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
      queryClient.invalidateQueries({ queryKey: ["ops-hitl-advisors"] });
      queryClient.invalidateQueries({ queryKey: ["ops-hitl-notices"] });
      queryClient.invalidateQueries({ queryKey: ["ops-runs"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addCollegeMutation = useMutation({
    mutationFn: () =>
      opsApi.createCollege({
        universityId: addingCollegeFor!.id,
        name: colName.trim(),
        disciplineCategory: "",
        collegeUrl: colUrl.trim(),
        facultyListUrl: colFacultyUrl.trim(),
        noticeListUrl: colNoticeUrl.trim(),
        phdAdmissionUrl: "",
        cmsFingerprint: "unknown",
        facultyStrategy: "http",
        noticeStrategy: "date_anchor",
      }),
    onSuccess: () => {
      toast.success("已添加学院抓取配置");
      if (addingCollegeFor) {
        setExpandedUnis((prev) => new Set(prev).add(addingCollegeFor.id));
      }
      setAddingCollegeFor(null);
      queryClient.invalidateQueries({ queryKey: ["ops-universities"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleExpand(id: string) {
    setExpandedUnis((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openSandbox(url: string, mode: SandboxMode, col: OpsCollegeRow | null) {
    setSandboxUrl(url);
    setSandboxMode(mode);
    setSandboxCollege(col);
    setSandboxOpen(true);
  }

  const items = unisQuery.data?.items || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">02 · 院校源与规则沙盒 Sources</h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            管理软科 Top 100 与手动新增院校 · 支持整校探测、学院级 URL 配置与规则沙盒试抓
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openSandbox("https://cs.seu.edu.cn/49473/list.htm", "notice_list", null)}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] text-[12.5px] font-medium cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5 text-[#FF5C35]" />
            打开自由沙盒
          </button>
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#141417] text-white text-[12.5px] font-medium cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            同步软科 Top 100
          </button>
          <button
            type="button"
            onClick={onOpenOnboardModal}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-[#FF5C35] hover:bg-[#EA4D28] text-white text-[12.5px] font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新增高校 / 非 Top 100
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="ops-card p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索校名、域名或学院..."
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#E5E7EB] text-[12.5px]"
            />
          </div>

          {(
            [
              { key: "all", label: "全部院校" },
              { key: "top100", label: "软科 Top 100" },
              { key: "custom_manual", label: "非 Top 100 扩展" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScope(tab.key)}
              className={`h-8 px-3 rounded-lg text-[12px] font-medium cursor-pointer ${
                scope === tab.key
                  ? "bg-[#141417] text-white"
                  : "bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]"
              }`}
            >
              {tab.label}
            </button>
          ))}

          <select
            value={health}
            onChange={(e) => setHealth(e.target.value)}
            className="h-8 px-2.5 rounded-lg border border-[#E5E7EB] text-[12px] bg-white"
          >
            <option value="all">全部健康状态</option>
            <option value="healthy">健康可用</option>
            <option value="unprobed">待探测</option>
            <option value="degraded">部分降级</option>
            <option value="broken">采集异常</option>
          </select>
        </div>

        <span className="text-[12px] text-[#64748B] ops-mono">共 {items.length} 所高校</span>
      </div>

      {/* Tree Table */}
      <div className="ops-card overflow-hidden">
        <div className="divide-y divide-[#E5E7EB]">
          {items.map((uni) => {
            const isExpanded = expandedUnis.has(uni.id);
            return (
              <div key={uni.id}>
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-[#FAFAFB]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(uni.id)}
                      className="p-1 rounded hover:bg-[#F1F5F9] text-[#64748B] cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[11px] ops-mono text-[#334155]">
                      {uni.softScienceRank ? `#${uni.softScienceRank}` : "扩展"}
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[14px]">{uni.name}</span>
                        <span
                          className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                            uni.sourceScope === "custom_manual"
                              ? "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]"
                              : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]"
                          }`}
                        >
                          {uni.sourceScope === "custom_manual" ? "手动扩展" : "Top 100"}
                        </span>
                        <HealthBadge status={uni.healthStatus} />
                        <span className="text-[11px] ops-mono text-[#64748B]">
                          {uni.officialDomain || "未填主域名"}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-[#64748B] mt-0.5 flex flex-wrap gap-3">
                        <span>分桶：{PORTAL_BUCKET_LABELS[uni.portalBucket] || uni.portalBucket}</span>
                        <span>学院 {uni.colleges.length} 个</span>
                        <span>导师 {uni.advisorCount} 位</span>
                        <span>通知 {uni.noticeCount} 条</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => probeUniMutation.mutate({ id: uni.id })}
                      disabled={probeUniMutation.isPending || !uni.officialDomain}
                      title={!uni.officialDomain ? "请先填写官网主域名" : "探测统一门户/研招网与学院"}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] text-[12px] cursor-pointer disabled:opacity-45"
                    >
                      <Compass className="w-3.5 h-3.5 text-[#FF5C35]" />
                      探测门户
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCollegeFor(uni);
                        setColUrl(uni.officialDomain ? `https://cs.${uni.officialDomain}/` : "");
                        setColFacultyUrl("");
                        setColNoticeUrl("");
                      }}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-[#141417] text-white text-[12px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      添加学院
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-[#FAFAFB] border-t border-[#F1F5F9] px-10 py-2.5 space-y-2">
                    {uni.colleges.length === 0 ? (
                      <div className="text-[12px] text-[#64748B] py-1.5">
                        该校暂无纳管二级学院，点击右侧「+ 添加学院」填入师资列表与公告栏 URL 即可试抓并入库。
                      </div>
                    ) : (
                      uni.colleges.map((col) => (
                        <div
                          key={col.id}
                          className="bg-white border border-[#E5E7EB] rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-[13px]">{col.name}</span>
                              <CmsBadge cms={col.cmsFingerprint} />
                              <HealthBadge status={col.healthStatus} />
                              <span className="text-[11px] ops-mono text-[#64748B]">
                                导师 {col.advisorCount} · 通知 {col.noticeCount}
                              </span>
                            </div>
                            <div className="text-[11px] ops-mono text-[#64748B] space-y-0.5">
                              <div className="truncate max-w-[560px]">
                                师资页：{col.facultyListUrl || "未配置"}
                              </div>
                              <div className="truncate max-w-[560px]">
                                公告页：{col.noticeListUrl || "未配置"}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openSandbox(
                                  col.facultyListUrl || col.collegeUrl,
                                  "advisor_list",
                                  col
                                )
                              }
                              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] text-[12px] cursor-pointer"
                            >
                              <FlaskConical className="w-3.5 h-3.5 text-[#FF5C35]" />
                              沙盒试抓
                            </button>
                            <button
                              type="button"
                              onClick={() => crawlCollegeMutation.mutate(col.id)}
                              disabled={crawlCollegeMutation.isPending}
                              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#FF5C35] hover:bg-[#EA4D28] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
                            >
                              <Play className="w-3 h-3" />
                              立即规则抓取
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add College Modal */}
      {addingCollegeFor && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] w-full max-w-lg p-6 space-y-4 shadow-xl">
            <h3 className="text-[16px] font-bold">
              为「{addingCollegeFor.name}」添加二级学院抓取源
            </h3>
            <div className="space-y-3 text-[13px]">
              <div>
                <label className="block text-[12px] font-medium text-[#475569] mb-1">
                  学院全称 *
                </label>
                <input
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#475569] mb-1">
                  学院官网首页 URL
                </label>
                <input
                  value={colUrl}
                  onChange={(e) => setColUrl(e.target.value)}
                  placeholder="https://cs.seu.edu.cn/"
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#475569] mb-1">
                  师资名录 / 博导列表页 URL
                </label>
                <input
                  value={colFacultyUrl}
                  onChange={(e) => setColFacultyUrl(e.target.value)}
                  placeholder="https://cse.seu.edu.cn/49354/list.htm"
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[#475569] mb-1">
                  通知公告 / 博士招生栏 URL
                </label>
                <input
                  value={colNoticeUrl}
                  onChange={(e) => setColNoticeUrl(e.target.value)}
                  placeholder="https://cs.seu.edu.cn/49473/list.htm"
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddingCollegeFor(null)}
                className="h-9 px-4 rounded-xl border border-[#E5E7EB] text-[13px] cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => addCollegeMutation.mutate()}
                disabled={addCollegeMutation.isPending || !colName.trim()}
                className="h-9 px-4 rounded-xl bg-[#141417] text-white text-[13px] font-medium cursor-pointer"
              >
                {addCollegeMutation.isPending ? "保存中..." : "保存学院配置"}
              </button>
            </div>
          </div>
        </div>
      )}

      <SandboxDrawer
        open={sandboxOpen}
        initialUrl={sandboxUrl}
        initialMode={sandboxMode}
        targetCollege={sandboxCollege}
        onClose={() => setSandboxOpen(false)}
        onSavedRule={() => queryClient.invalidateQueries({ queryKey: ["ops-universities"] })}
      />
    </div>
  );
}
