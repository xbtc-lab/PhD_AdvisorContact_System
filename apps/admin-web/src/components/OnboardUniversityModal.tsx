import { useState } from "react";
import { Compass, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import type { CmsFingerprint, OnboardCollegeDraft } from "@app/shared";
import { opsApi } from "@/lib/ops-api.js";
import { CmsBadge } from "./OpsStatusBadge.js";

export function OnboardUniversityModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [officialDomain, setOfficialDomain] = useState("");
  const [skipProbe, setSkipProbe] = useState(false);
  const [directCollegeName, setDirectCollegeName] = useState("计算机科学与技术学院");
  const [directCollegeUrl, setDirectCollegeUrl] = useState("");
  const [directFacultyUrl, setDirectFacultyUrl] = useState("");
  const [directNoticeUrl, setDirectNoticeUrl] = useState("");

  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [probeData, setProbeData] = useState<any>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());

  if (!open) return null;

  async function handleProbe() {
    if (!name.trim()) {
      toast.error("请先填写高校名称");
      return;
    }
    setProbing(true);
    try {
      const res = await opsApi.probeUniversityPreview({
        name: name.trim(),
        officialDomain: officialDomain.trim(),
        collegeUrl: directCollegeUrl.trim(),
        facultyListUrl: directFacultyUrl.trim(),
        noticeListUrl: directNoticeUrl.trim(),
        skipSubdomainProbe: skipProbe,
      });
      setProbeData(res.probe);
      const nextSel = new Set<number>();
      (res.probe?.colleges || []).forEach((_: any, i: number) => {
        if (i < 10) nextSel.add(i);
      });
      setSelectedIndexes(nextSel);
      toast.success("探测完成，请勾选需纳管的学院后确认入库");
    } catch (err: any) {
      toast.error(err?.message || "探测失败");
    } finally {
      setProbing(false);
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("请填写高校或科研院所名称");
      return;
    }
    setSaving(true);
    try {
      let colleges: OnboardCollegeDraft[] = [];
      if (probeData?.colleges?.length) {
        colleges = probeData.colleges
          .filter((_: any, i: number) => selectedIndexes.has(i))
          .map((c: any) => ({
            name: c.name,
            disciplineCategory: c.disciplineCategory || "",
            collegeUrl: c.collegeUrl || "",
            facultyListUrl: c.facultyListUrl || "",
            noticeListUrl: c.noticeListUrl || "",
            phdAdmissionUrl: "",
            cmsFingerprint: (c.cmsFingerprint || "unknown") as CmsFingerprint,
            facultyStrategy: "http" as const,
            noticeStrategy: "date_anchor" as const,
          }));
      } else if (directCollegeName.trim() && (directFacultyUrl.trim() || directCollegeUrl.trim() || directNoticeUrl.trim())) {
        colleges = [
          {
            name: directCollegeName.trim(),
            disciplineCategory: "",
            collegeUrl: directCollegeUrl.trim(),
            facultyListUrl: directFacultyUrl.trim(),
            noticeListUrl: directNoticeUrl.trim(),
            phdAdmissionUrl: "",
            cmsFingerprint: "unknown",
            facultyStrategy: "http",
            noticeStrategy: "date_anchor",
          },
        ];
      }

      await opsApi.onboardUniversity({
        name: name.trim(),
        shortName: shortName.trim(),
        officialDomain: probeData?.officialDomain || officialDomain.trim(),
        sourceScope: "custom_manual",
        rankTier: "other",
        disciplineRankNote: "手动扩展纳入",
        facultyPortalUrl: probeData?.facultyPortal?.finalUrl || "",
        admissionUrl: probeData?.admissionPortal?.finalUrl || "",
        portalBucket: probeData?.suggestedPortalBucket || "custom",
        customTags: ["手动纳管"],
        colleges,
      });

      toast.success(`已成功纳管「${name.trim()}」（含 ${colleges.length} 个学院）`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E7EB] rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A]">
              02B · 手动新增高校 / 非 Top 100 院校探测向导
            </h2>
            <p className="text-[12px] text-[#64748B] mt-0.5">
              支持自动探测统一门户/二级学院，或勾选跳过探测直填单院系 URL 抓取
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-[13px]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-[#475569] mb-1">
                高校 / 科研院所全称 *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：西南石油大学"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#475569] mb-1">简称</label>
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="如：西南石大"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#475569] mb-1">
                官网主域名
              </label>
              <input
                value={officialDomain}
                onChange={(e) => setOfficialDomain(e.target.value)}
                placeholder="如：swpu.edu.cn"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-[12.5px] text-[#334155] cursor-pointer">
            <input
              type="checkbox"
              checked={skipProbe}
              onChange={(e) => setSkipProbe(e.target.checked)}
              className="rounded"
            />
            跳过整校子域名探测，直接指定具体学院与师资/公告页 URL（适合单院系或中科院研究所）
          </label>

          <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
            <div className="text-[12px] font-semibold text-[#334155]">
              可选指定具体学院入口（留空也可先仅做整校探测）
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                value={directCollegeName}
                onChange={(e) => setDirectCollegeName(e.target.value)}
                placeholder="学院名称，如：计算机与软件学院"
                className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white"
              />
              <input
                value={directCollegeUrl}
                onChange={(e) => setDirectCollegeUrl(e.target.value)}
                placeholder="学院首页 URL（可选）"
                className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white ops-mono text-[12px]"
              />
              <input
                value={directFacultyUrl}
                onChange={(e) => setDirectFacultyUrl(e.target.value)}
                placeholder="师资列表 / 博导目录 URL（可选）"
                className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white ops-mono text-[12px]"
              />
              <input
                value={directNoticeUrl}
                onChange={(e) => setDirectNoticeUrl(e.target.value)}
                placeholder="通知公告 / 博士招生栏 URL（可选）"
                className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white ops-mono text-[12px]"
              />
            </div>
            <button
              type="button"
              onClick={handleProbe}
              disabled={probing}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[#141417] text-white text-[12px] font-medium cursor-pointer disabled:opacity-50"
            >
              <Compass className="w-3.5 h-3.5 text-[#FF5C35]" />
              {probing ? "正在实时探测官网..." : "开始实时探测"}
            </button>
          </div>

          {probeData && (
            <div className="space-y-3 border-t border-[#E5E7EB] pt-3">
              <div className="grid grid-cols-2 gap-2.5 text-[12px]">
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B]">统一教师门户：</span>
                  <span className="ops-mono text-[#0F172A]">
                    {probeData.facultyPortal?.finalUrl || "未检测到"}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <span className="text-[#64748B]">研究生招生网：</span>
                  <span className="ops-mono text-[#0F172A]">
                    {probeData.admissionPortal?.finalUrl || "未检测到"}
                  </span>
                </div>
              </div>

              {probeData.notes?.length > 0 && (
                <ul className="text-[12px] text-[#475569] space-y-1 list-disc pl-4">
                  {probeData.notes.map((n: string, i: number) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}

              {probeData.colleges?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[12px] font-semibold text-[#334155]">
                    候选学院（已默认勾选前 10 个，共发现 {probeData.colleges.length} 个）：
                  </div>
                  <div className="max-h-44 overflow-y-auto border border-[#E5E7EB] rounded-xl divide-y divide-[#F1F5F9]">
                    {probeData.colleges.map((c: any, idx: number) => (
                      <label
                        key={idx}
                        className="flex items-center justify-between px-3 py-2 hover:bg-[#F8FAFC] cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedIndexes.has(idx)}
                            onChange={(e) => {
                              const next = new Set(selectedIndexes);
                              if (e.target.checked) next.add(idx);
                              else next.delete(idx);
                              setSelectedIndexes(next);
                            }}
                          />
                          <span className="font-medium text-[#0F172A] truncate">{c.name}</span>
                          <span className="text-[11px] ops-mono text-[#64748B] truncate max-w-[240px]">
                            {c.facultyListUrl || c.collegeUrl}
                          </span>
                        </div>
                        <CmsBadge cms={c.cmsFingerprint} />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-3.5 border-t border-[#E5E7EB] flex items-center justify-end gap-2.5 bg-[#FAFAFB] rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-[#E5E7EB] bg-white text-[13px] cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#FF5C35] hover:bg-[#EA4D28] text-white text-[13px] font-medium cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {saving ? "保存入库中..." : "确认纳管入库"}
          </button>
        </div>
      </div>
    </div>
  );
}
