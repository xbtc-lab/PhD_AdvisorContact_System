import { useEffect, useState } from "react";
import { Play, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { opsApi, type OpsCollegeRow } from "@/lib/ops-api.js";
import { CmsBadge, RecruitmentBadge } from "./OpsStatusBadge.js";

export type SandboxMode = "advisor_list" | "advisor_detail" | "notice_list";

export function SandboxDrawer({
  open,
  initialUrl,
  initialMode,
  targetCollege,
  onClose,
  onSavedRule,
}: {
  open: boolean;
  initialUrl: string;
  initialMode: SandboxMode;
  targetCollege: OpsCollegeRow | null;
  onClose: () => void;
  onSavedRule: () => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [mode, setMode] = useState<SandboxMode>(initialMode);
  const [customSelector, setCustomSelector] = useState("");
  const [isPhdListContext, setIsPhdListContext] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [output, setOutput] = useState<{ diagnostics: any; result: any } | null>(null);

  useEffect(() => {
    setUrl(initialUrl);
    setMode(initialMode);
    setOutput(null);
    if (targetCollege) {
      setCustomSelector(
        initialMode === "notice_list"
          ? targetCollege.noticeRuleJson?.noticeItemSelector || ""
          : targetCollege.facultyRuleJson?.detailLinkSelector || ""
      );
      setIsPhdListContext(Boolean(targetCollege.facultyRuleJson?.isPhdListContext));
    }
  }, [initialUrl, initialMode, targetCollege]);

  if (!open) return null;

  async function runTest(overrideUrl?: string, overrideMode?: SandboxMode) {
    const targetUrl = (overrideUrl ?? url).trim();
    const activeMode = overrideMode ?? mode;
    if (!targetUrl) {
      toast.error("请输入测试 URL");
      return;
    }
    setTesting(true);
    try {
      const res = await opsApi.sandboxTestUrl({
        url: targetUrl,
        mode: activeMode,
        customSelector: customSelector.trim() || undefined,
        isPhdListContext,
        limit: 20,
      });
      setOutput({ diagnostics: res.diagnostics, result: res.result });
      toast.success("规则沙盒试抓完成（AI 消耗 ¥0）");
    } catch (err: any) {
      toast.error(err?.message || "试抓失败");
    } finally {
      setTesting(false);
    }
  }

  async function saveBackToCollege() {
    if (!targetCollege) return;
    setSaving(true);
    try {
      const patch =
        mode === "notice_list"
          ? {
              noticeListUrl: url.trim(),
              noticeStrategy: (customSelector.trim() ? "css_rule" : "date_anchor") as any,
              noticeRuleJson: customSelector.trim()
                ? { noticeItemSelector: customSelector.trim() }
                : null,
              cmsFingerprint: output?.diagnostics?.cmsFingerprint || targetCollege.cmsFingerprint,
            }
          : mode === "advisor_list"
          ? {
              facultyListUrl: url.trim(),
              facultyRuleJson: {
                detailLinkSelector: customSelector.trim() || undefined,
                isPhdListContext,
              },
              cmsFingerprint: output?.diagnostics?.cmsFingerprint || targetCollege.cmsFingerprint,
            }
          : {
              facultyRuleJson: {
                ...(targetCollege.facultyRuleJson || {}),
                nameSelector: customSelector.trim() || undefined,
                isPhdListContext,
              },
            };

      await opsApi.updateCollege(targetCollege.id, patch);
      toast.success(`已将规则写回「${targetCollege.name}」`);
      onSavedRule();
    } catch (err: any) {
      toast.error(err?.message || "保存规则失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/25 backdrop-blur-[1px]">
      <div className="bg-white w-full max-w-2xl h-full border-l border-[#E5E7EB] flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A]">
              可视化规则沙盒 {targetCollege ? `· ${targetCollege.name}` : ""}
            </h2>
            <p className="text-[12px] text-[#64748B]">
              真网 Rule-First 试抓验证（含 WebVPN 还原 / GBK 自动转码 / 4 态招博判断）
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4 text-[13px]">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "advisor_list", label: "师资列表页" },
                { key: "advisor_detail", label: "导师详情页" },
                { key: "notice_list", label: "通知公告页" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setMode(tab.key);
                  setOutput(null);
                  if (targetCollege) {
                    if (tab.key === "notice_list" && targetCollege.noticeListUrl) {
                      setUrl(targetCollege.noticeListUrl);
                    } else if (tab.key === "advisor_list" && targetCollege.facultyListUrl) {
                      setUrl(targetCollege.facultyListUrl);
                    }
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer border ${
                  mode === tab.key
                    ? "bg-[#141417] text-white border-[#141417]"
                    : "bg-white text-[#475569] border-[#E5E7EB]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-[12px] font-medium text-[#475569] mb-1">目标网页 URL</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://cs.seu.edu.cn/49473/list.htm"
                className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-[12px] font-medium text-[#475569] mb-1">
                  可选 CSS 选择器覆盖（留空走自动通用启发式）
                </label>
                <input
                  value={customSelector}
                  onChange={(e) => setCustomSelector(e.target.value)}
                  placeholder="如：ul.news_list > li 或 .teacher-card a"
                  className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono text-[12px]"
                />
              </div>
              <label className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] cursor-pointer text-[12px]">
                <input
                  type="checkbox"
                  checked={isPhdListContext}
                  onChange={(e) => setIsPhdListContext(e.target.checked)}
                />
                此页为“博导专页”（触发博导默认在招）
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => runTest()}
                disabled={testing}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#141417] text-white text-[12.5px] font-medium cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 text-[#FF5C35]" />
                {testing ? "正在抓取并解析..." : "实时规则试抓 (¥0)"}
              </button>
              {targetCollege && (
                <button
                  type="button"
                  onClick={saveBackToCollege}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] text-[12.5px] font-medium cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? "保存中..." : "将规则写回学院"}
                </button>
              )}
            </div>
          </div>

          {output && (
            <div className="space-y-4 border-t border-[#E5E7EB] pt-4">
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <CmsBadge cms={output.diagnostics.cmsFingerprint} />
                <span className="px-2 py-0.5 rounded bg-[#F1F5F9] ops-mono">
                  HTTP {output.diagnostics.status} · {output.diagnostics.elapsedMs}ms
                </span>
                {output.diagnostics.wasWebVpnUnwrapped && (
                  <span className="px-2 py-0.5 rounded bg-[#ECFDF5] text-[#059669]">
                    已还原 WebVPN 链接
                  </span>
                )}
                {output.diagnostics.charsetFixed && (
                  <span className="px-2 py-0.5 rounded bg-[#FFFBEB] text-[#D97706]">
                    已转码 {output.diagnostics.detectedCharset}
                  </span>
                )}
                {output.diagnostics.splashFollowed && (
                  <span className="px-2 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB]">
                    已穿过过渡引导页
                  </span>
                )}
              </div>

              {mode === "advisor_list" && output.result?.candidates && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px] text-[#475569]">
                    <span>
                      共发现 <strong>{output.result.totalCandidates}</strong> 位候选导师（展示前{" "}
                      {output.result.candidates.length} 位）
                      {output.result.pageIsPhdList ? " · 识别为博导目录页" : ""}
                    </span>
                  </div>
                  <div className="border border-[#E5E7EB] rounded-xl divide-y divide-[#F1F5F9]">
                    {output.result.candidates.map((cand: any, i: number) => (
                      <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-[#0F172A]">
                            {cand.name}{" "}
                            {cand.contextTitle && (
                              <span className="text-[11px] text-[#64748B] ml-1">
                                {cand.contextTitle}
                              </span>
                            )}
                            {cand.contextEmail && (
                              <span className="text-[11px] ops-mono text-[#059669] ml-2">
                                {cand.contextEmail}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] ops-mono text-[#64748B] truncate">
                            {cand.url}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setUrl(cand.url);
                            setMode("advisor_detail");
                            if (cand.isPhdContext || output.result.pageIsPhdList) {
                              setIsPhdListContext(true);
                            }
                            runTest(cand.url, "advisor_detail");
                          }}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#141417] hover:text-white border border-[#E2E8F0] text-[11px] cursor-pointer transition-colors"
                        >
                          试抓详情
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mode === "advisor_detail" && output.result && (
                <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFAFB] space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {output.result.photoUrl ? (
                        <img
                          src={output.result.photoUrl}
                          alt={output.result.name}
                          className="w-12 h-12 rounded-xl object-cover border border-[#E5E7EB]"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-[#141417] text-white flex items-center justify-center font-bold">
                          {(output.result.name || "?").slice(0, 1)}
                        </div>
                      )}
                      <div>
                        <div className="text-[15px] font-bold text-[#0F172A]">
                          {output.result.name}
                          <span className="text-[12px] font-normal text-[#64748B] ml-2">
                            {output.result.title}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <RecruitmentBadge status={output.result.recruitmentStatus} />
                          {output.result.honorBadge && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#FAF7F2] border border-[#E7DEC8] text-[#785A28]">
                              {output.result.honorBadge}
                            </span>
                          )}
                          <span className="text-[11px] ops-mono text-[#475569]">
                            质检分 {output.result.qualityScore}/100
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E7EB]">
                      <span className="text-[#64748B]">邮箱：</span>
                      <span className="ops-mono">{output.result.email || "未公开"}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#E5E7EB]">
                      <span className="text-[#64748B]">招生口径：</span>
                      <span>{output.result.kpiQuotaHero}</span>
                    </div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-[#E5E7EB] text-[12px]">
                    <span className="text-[#64748B]">研究方向标签：</span>
                    <span>
                      {output.result.researchTags?.length
                        ? output.result.researchTags.join(" · ")
                        : "未切分出明确标签（可按需送入 AI 精炼）"}
                    </span>
                  </div>

                  {output.result.photoFilteredOut && (
                    <div className="text-[11.5px] text-[#D97706] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      已自动拦截伪头像/无效图片链接（客户端将安全回退 facehash）：{" "}
                      <code className="ops-mono">{output.result.rawCandidatePhotoUrl}</code>
                    </div>
                  )}

                  <div className="bg-white p-2.5 rounded-lg border border-[#E5E7EB] text-[12px] text-[#475569]">
                    {output.result.bio}
                  </div>
                </div>
              )}

              {mode === "notice_list" && output.result?.items && (
                <div className="space-y-2">
                  <div className="text-[12px] text-[#475569]">
                    聚类模式 <code className="ops-mono">{output.result.mode}</code>（容器{" "}
                    <code className="ops-mono">{output.result.clusterSignature || "-"}</code>）：提取{" "}
                    <strong>{output.result.totalExtracted}</strong> 条，命中招博白名单{" "}
                    <strong className="text-[#059669]">{output.result.phdMatchedCount}</strong> 条
                  </div>
                  <div className="border border-[#E5E7EB] rounded-xl divide-y divide-[#F1F5F9]">
                    {output.result.items.map((n: any, i: number) => (
                      <div key={i} className="px-3 py-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <a
                            href={n.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-[#0F172A] hover:underline block"
                          >
                            {n.title}
                          </a>
                          <div className="text-[11px] ops-mono text-[#64748B] mt-0.5">
                            {n.publishedAt || "无日期"}
                            {n.matchedKeywords?.length > 0 && (
                              <span className="ml-2 text-[#059669]">
                                命中: {n.matchedKeywords.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] ${
                            n.isPhdRelated
                              ? "bg-[#ECFDF5] text-[#059669]"
                              : "bg-[#F1F5F9] text-[#64748B]"
                          }`}
                        >
                          {n.isPhdRelated ? "招博相关" : "已过滤"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
