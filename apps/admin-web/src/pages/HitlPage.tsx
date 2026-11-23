import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, Lock, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { RecruitmentStatus } from "@app/shared";
import { opsApi, type OpsAdvisorRow } from "@/lib/ops-api.js";
import { RecruitmentBadge } from "@/components/OpsStatusBadge.js";

const LOCKABLE_FIELDS = [
  { key: "email", label: "邮箱" },
  { key: "title", label: "职称" },
  { key: "honorBadge", label: "人才帽子" },
  { key: "recruitmentStatus", label: "招博状态" },
  { key: "researchTags", label: "研究方向标签" },
];

export function HitlPage() {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<"advisors" | "notices">("advisors");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [selectedAdv, setSelectedAdv] = useState<OpsAdvisorRow | null>(null);

  // Form states for selected advisor
  const [editEmail, setEditEmail] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editHonor, setEditHonor] = useState("");
  const [editRecruitStatus, setEditRecruitStatus] =
    useState<RecruitmentStatus>("phd_default_open");
  const [editQuotaHero, setEditQuotaHero] = useState("");
  const [editTags, setEditTags] = useState("");
  const [lockedSet, setLockedSet] = useState<Set<string>>(new Set());

  const advisorsQuery = useQuery({
    queryKey: ["ops-hitl-advisors", reviewFilter, searchQ],
    queryFn: () => opsApi.getHitlAdvisors({ reviewStatus: reviewFilter, q: searchQ }),
  });

  const noticesQuery = useQuery({
    queryKey: ["ops-hitl-notices"],
    queryFn: () => opsApi.getHitlNotices("all"),
  });

  useEffect(() => {
    if (!selectedAdv && advisorsQuery.data?.items?.length) {
      loadEditor(advisorsQuery.data.items[0]);
    }
  }, [advisorsQuery.data]);

  function loadEditor(adv: OpsAdvisorRow) {
    setSelectedAdv(adv);
    setEditEmail(adv.email || "");
    setEditTitle(adv.title || "");
    setEditHonor(adv.honorBadge || "");
    setEditRecruitStatus(adv.recruitmentStatus || "phd_default_open");
    setEditQuotaHero(adv.kpiQuotaHero || "");
    setEditTags((adv.researchTags || []).join("、"));
    setLockedSet(new Set(adv.manualLockedFields || []));
  }

  const saveAdvisorMutation = useMutation({
    mutationFn: () => {
      if (!selectedAdv) throw new Error("未选择导师");
      const tags = editTags
        .split(/[、,，;；]/)
        .map((s) => s.trim())
        .filter(Boolean);
      return opsApi.updateHitlAdvisor(selectedAdv.id, {
        email: editEmail.trim(),
        title: editTitle.trim(),
        honorBadge: editHonor.trim(),
        recruitmentStatus: editRecruitStatus,
        kpiQuotaHero: editQuotaHero.trim(),
        researchTags: tags,
        reviewStatus: "verified",
        manualLockedFields: [...lockedSet],
      });
    },
    onSuccess: (res) => {
      toast.success(`已校对保存「${res.advisor.name}」（含 ${res.advisor.manualLockedFields.length} 项字段锁）`);
      setSelectedAdv(res.advisor);
      queryClient.invalidateQueries({ queryKey: ["ops-hitl-advisors"] });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reviewNoticeMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "false_positive" }) =>
      opsApi.reviewNotice(id, { action }),
    onSuccess: (_, vars) => {
      toast.success(vars.action === "approve" ? "已核准为有效招博通知" : "已标为误报忽略");
      queryClient.invalidateQueries({ queryKey: ["ops-hitl-notices"] });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function toggleLock(key: string) {
    setLockedSet((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">04 · 人工审核与字段锁纠偏台 HITL</h1>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">
            支持导师档案人工纠偏与字段防覆盖锁定（🔒）、招博公告核准与误报过滤
          </p>
        </div>

        <div className="flex gap-1.5 bg-white border border-[#E5E7EB] p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setSubTab("advisors")}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer ${
              subTab === "advisors" ? "bg-[#141417] text-white" : "text-[#475569]"
            }`}
          >
            04A · 导师档案校对
          </button>
          <button
            type="button"
            onClick={() => setSubTab("notices")}
            className={`px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium cursor-pointer ${
              subTab === "notices" ? "bg-[#141417] text-white" : "text-[#475569]"
            }`}
          >
            04B · 招博通知审核 ({noticesQuery.data?.items?.length || 0})
          </button>
        </div>
      </div>

      {subTab === "advisors" ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 items-start">
          {/* Queue */}
          <div className="ops-card p-4 md:col-span-2 min-w-0 space-y-3">
            <div className="flex gap-2">
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="搜导师名、邮箱、院系..."
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-[#E5E7EB] text-[12.5px]"
              />
              <select
                value={reviewFilter}
                onChange={(e) => setReviewFilter(e.target.value)}
                className="shrink-0 h-9 px-2.5 rounded-lg border border-[#E5E7EB] bg-white text-[12px]"
              >
                <option value="all">全部状态</option>
                <option value="needs_review">待审核</option>
                <option value="auto_published">规则自动发布</option>
                <option value="verified">已人工核准</option>
              </select>
            </div>

            <div className="divide-y divide-[#F1F5F9] max-h-[540px] overflow-y-auto">
              {(advisorsQuery.data?.items || []).map((adv) => (
                <button
                  key={adv.id}
                  type="button"
                  onClick={() => loadEditor(adv)}
                  className={`w-full text-left py-3 px-2.5 rounded-xl flex items-start justify-between gap-2 cursor-pointer ${
                    selectedAdv?.id === adv.id ? "bg-[#FFF7ED]" : "hover:bg-[#FAFAFB]"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="font-bold text-[13.5px]">
                      {adv.name}{" "}
                      <span className="font-normal text-[11.5px] text-[#64748B]">
                        {adv.universityName}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RecruitmentBadge status={adv.recruitmentStatus} />
                      <span className="text-[11px] ops-mono text-[#64748B]">
                        Q:{adv.qualityScore}
                      </span>
                      {adv.manualLockedFields?.length > 0 && (
                        <span className="text-[10.5px] text-[#D97706] inline-flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" />
                          {adv.manualLockedFields.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10.5px] ops-mono text-[#94A3B8]">{adv.reviewStatus}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Inspector */}
          <div className="ops-card p-6 md:col-span-3 min-w-0 space-y-4">
            {!selectedAdv ? (
              <div className="py-16 text-center text-[#64748B] text-[13px]">
                请从左侧选择一位导师进行校对
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-[#E5E7EB] pb-4">
                  <div className="flex items-center gap-3.5">
                    {selectedAdv.photoUrl ? (
                      <img
                        src={selectedAdv.photoUrl}
                        alt={selectedAdv.name}
                        className="w-12 h-12 rounded-xl object-cover border border-[#E5E7EB]"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-[#141417] text-white flex items-center justify-center font-bold">
                        {selectedAdv.name.slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <h2 className="text-[18px] font-bold">
                        {selectedAdv.name}{" "}
                        <span className="text-[13px] font-normal text-[#64748B]">
                          {selectedAdv.universityName} · {selectedAdv.dept}
                        </span>
                      </h2>
                      <div className="text-[12px] text-[#64748B] mt-0.5">
                        {selectedAdv.recruitmentSignalNote || selectedAdv.bio}
                      </div>
                    </div>
                  </div>
                  {selectedAdv.homepageUrl && (
                    <a
                      href={selectedAdv.homepageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[12px] text-[#FF5C35] hover:underline shrink-0"
                    >
                      打开官网原页
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#475569]">官方邮箱</label>
                      <button
                        type="button"
                        onClick={() => toggleLock("email")}
                        className={`text-[11px] inline-flex items-center gap-0.5 cursor-pointer ${
                          lockedSet.has("email") ? "text-[#FF5C35] font-semibold" : "text-[#94A3B8]"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        {lockedSet.has("email") ? "已锁定防覆盖" : "锁定"}
                      </button>
                    </div>
                    <input
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#475569]">职称头衔</label>
                      <button
                        type="button"
                        onClick={() => toggleLock("title")}
                        className={`text-[11px] inline-flex items-center gap-0.5 cursor-pointer ${
                          lockedSet.has("title") ? "text-[#FF5C35] font-semibold" : "text-[#94A3B8]"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        {lockedSet.has("title") ? "已锁定" : "锁定"}
                      </button>
                    </div>
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#475569]">
                        招博状态（4 态模型）
                      </label>
                      <button
                        type="button"
                        onClick={() => toggleLock("recruitmentStatus")}
                        className={`text-[11px] inline-flex items-center gap-0.5 cursor-pointer ${
                          lockedSet.has("recruitmentStatus")
                            ? "text-[#FF5C35] font-semibold"
                            : "text-[#94A3B8]"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        {lockedSet.has("recruitmentStatus") ? "已锁定" : "锁定"}
                      </button>
                    </div>
                    <select
                      value={editRecruitStatus}
                      onChange={(e) => setEditRecruitStatus(e.target.value as RecruitmentStatus)}
                      className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white"
                    >
                      <option value="confirmed_open">confirmed_open · 明确招博</option>
                      <option value="phd_default_open">phd_default_open · 博导默认在招</option>
                      <option value="explicitly_closed">explicitly_closed · 明确停招/退休</option>
                      <option value="unknown">unknown · 资格未确认</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[12px] font-medium text-[#475569]">人才帽子</label>
                      <button
                        type="button"
                        onClick={() => toggleLock("honorBadge")}
                        className={`text-[11px] inline-flex items-center gap-0.5 cursor-pointer ${
                          lockedSet.has("honorBadge")
                            ? "text-[#FF5C35] font-semibold"
                            : "text-[#94A3B8]"
                        }`}
                      >
                        <Lock className="w-3 h-3" />
                        {lockedSet.has("honorBadge") ? "已锁定" : "锁定"}
                      </button>
                    </div>
                    <input
                      value={editHonor}
                      onChange={(e) => setEditHonor(e.target.value)}
                      className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[#475569] mb-1">
                    招博名额展示卡口径
                  </label>
                  <input
                    value={editQuotaHero}
                    onChange={(e) => setEditQuotaHero(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-[13px]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[12px] font-medium text-[#475569]">
                      研究方向标签（顿号或逗号分隔）
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleLock("researchTags")}
                      className={`text-[11px] inline-flex items-center gap-0.5 cursor-pointer ${
                        lockedSet.has("researchTags")
                          ? "text-[#FF5C35] font-semibold"
                          : "text-[#94A3B8]"
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      {lockedSet.has("researchTags") ? "已锁定" : "锁定"}
                    </button>
                  </div>
                  <input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] text-[13px]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-[11.5px] text-[#64748B]">
                    已勾选 {LOCKABLE_FIELDS.filter((f) => lockedSet.has(f.key)).length} 项字段锁，后续自动重抓将跳过覆盖
                  </div>
                  <button
                    type="button"
                    onClick={() => saveAdvisorMutation.mutate()}
                    disabled={saveAdvisorMutation.isPending}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#141417] text-white text-[13px] font-medium cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5 text-[#FF5C35]" />
                    {saveAdvisorMutation.isPending ? "保存中..." : "核准通过并保存锁定"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="ops-card divide-y divide-[#F1F5F9]">
          {(noticesQuery.data?.items || []).length === 0 ? (
            <div className="p-12 text-center text-[13px] text-[#64748B]">
              暂无已抓回的招博通知，可先在「院校源与沙盒」触发带通知抓取的学院任务
            </div>
          ) : (
            (noticesQuery.data?.items || []).map((n) => (
              <div key={n.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <a
                    href={n.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[14px] text-[#0F172A] hover:underline block"
                  >
                    {n.title}
                  </a>
                  <div className="text-[12px] text-[#64748B] flex flex-wrap items-center gap-2.5">
                    <span>{n.universityName}</span>
                    <span className="ops-mono">{n.publishedAt || "无发布日期"}</span>
                    <span>命中词：{n.matchedKeywords.join(" / ")}</span>
                    <span className="ops-mono text-[11px] px-1.5 py-0.5 rounded bg-[#F1F5F9]">
                      {n.reviewStatus}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => reviewNoticeMutation.mutate({ id: n.id, action: "approve" })}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] text-[12px] font-medium cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    核准有效
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      reviewNoticeMutation.mutate({ id: n.id, action: "false_positive" })
                    }
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2] text-[12px] font-medium cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    误报忽略
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
