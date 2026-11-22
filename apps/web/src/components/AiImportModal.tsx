import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Globe, Sparkles, Square, Upload } from "lucide-react";
import { toast } from "sonner";
import type { AiExtractProfessorItem, BootstrapData } from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import { MATCH_TIER_STYLES, cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { Button } from "./ui/Button.js";

export interface AiImportModalProps {
  bootstrap: BootstrapData;
}

interface CandidateRow extends AiExtractProfessorItem {
  selected: boolean;
}

/**
 * AI 智能采集与结构化导表弹窗：
 * 支持填写学院师资目录 URL 或粘贴网页文本，经 cloud-core 提取出结构化导师候选集并确认批量入库。
 */
export function AiImportModal({ bootstrap }: AiImportModalProps) {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.aiImportOpen);
  const setOpen = useAppStore((s) => s.setAiImportOpen);

  const [institutionName, setInstitutionName] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [rawText, setRawText] = useState("");
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);

  const extractMutation = useMutation({
    mutationFn: () =>
      cloudApi.extractAdvisors({
        institutionName: institutionName.trim() || "待补充高校",
        pageUrl: pageUrl.trim(),
        rawText: rawText.trim(),
      }),
    onSuccess: (res) => {
      const rows = res.professors.map((p) => ({ ...p, selected: true }));
      setCandidates(rows);
      if (rows.length === 0) {
        toast.info("未在页面内容中识别到导师条目，建议直接全选网页文本粘贴导入");
      } else {
        toast.success(`成功结构化提取 ${rows.length} 位导师（未盲猜任何缺失邮箱）`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      const picked = candidates.filter((c) => c.selected);
      if (picked.length === 0) throw new Error("请至少勾选一位导师");
      return workerApi.batchImportAdvisors({
        institutionName: institutionName.trim() || "待补充高校",
        advisors: picked.map(({ selected: _s, ...item }) => item),
      });
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(
        `已成功导入 ${res.added} 位导师${res.skipped > 0 ? `（跳过重复 ${res.skipped} 位）` : ""}`
      );
      setCandidates([]);
      setRawText("");
      setPageUrl("");
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectedCount = candidates.filter((c) => c.selected).length;

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#2563EB]" />
          <span>AI 师资网页智能采集与建档</span>
        </span>
      }
      description="自动抓取学院师资列表或解析粘贴网页正文；严格遵守防幻觉约束，绝不根据拼音盲猜导师邮箱"
      maxWidthClass="max-w-3xl"
      footer={
        candidates.length > 0 ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCandidates([])}
            >
              返回重新提取
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={selectedCount === 0}
              loading={importMutation.isPending}
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => importMutation.mutate()}
            >
              确认批量入库 ({selectedCount} 位)
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={
                (!pageUrl.trim() && !rawText.trim()) ||
                !bootstrap.aiConfig.hasApiKey
              }
              loading={extractMutation.isPending}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => extractMutation.mutate()}
            >
              开始 AI 结构化提取
            </Button>
          </>
        )
      }
    >
      {candidates.length === 0 ? (
        <div className="space-y-3.5 text-[12px]">
          {!bootstrap.aiConfig.hasApiKey && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
              尚未配置 DeepSeek / LLM API Key，请先在「设置 → AI 与策略」中完成连通测试。
            </div>
          )}

          <div>
            <label className="text-slate-600 font-medium">目标高校名称 *</label>
            <input
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="例如：浙江大学 / 复旦大学"
              className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="text-slate-600 font-medium inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>院系师资目录网址（可选，将尝试轻量抓取正文）</span>
            </label>
            <input
              type="url"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              placeholder="https://cs.example.edu.cn/szdw/..."
              className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="text-slate-600 font-medium">
              或直接粘贴网页师资全文 / Markdown（若高校内网反爬或 JS 渲染时最可靠）
            </label>
            <textarea
              rows={7}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="从浏览器 Ctrl+A / Ctrl+C 复制学院师资介绍网页文本粘贴到此处..."
              className="mt-1 w-full p-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">
              目标高校：<strong className="text-[#111827]">{institutionName || "待补充高校"}</strong> · 共解析出{" "}
              <strong>{candidates.length}</strong> 位候选导师
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const allPicked = candidates.every((c) => c.selected);
                setCandidates((prev) =>
                  prev.map((item) => ({ ...item, selected: !allPicked }))
                );
              }}
            >
              {candidates.every((c) => c.selected) ? "取消全选" : "全部勾选"}
            </Button>
          </div>

          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {candidates.map((row, idx) => {
              const tierStyle = MATCH_TIER_STYLES[row.matchTier];
              return (
                <div
                  key={`${row.name}-${idx}`}
                  onClick={() =>
                    setCandidates((prev) =>
                      prev.map((item, i) =>
                        i === idx ? { ...item, selected: !item.selected } : item
                      )
                    )
                  }
                  className={cn(
                    "p-3 rounded-2xl border cursor-pointer transition-colors space-y-1",
                    row.selected
                      ? "bg-white border-[#2563EB]/40 shadow-[0_2px_10px_rgba(37,99,235,0.06)]"
                      : "bg-slate-50/70 border-slate-200/70 opacity-65"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {row.selected ? (
                        <CheckSquare className="w-4 h-4 text-[#2563EB] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <span className="font-semibold text-[13px] text-[#111827]">
                        {row.name}
                      </span>
                      <span className="text-slate-500 truncate">
                        {row.dept} {row.title}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10.5px] font-medium border shrink-0",
                        tierStyle.badgeClass
                      )}
                    >
                      {tierStyle.short}
                    </span>
                  </div>

                  <div className="pl-6 space-y-0.5">
                    <div className="font-mono text-[11px]">
                      {row.email ? (
                        <span className="text-emerald-700">{row.email}</span>
                      ) : (
                        <span className="text-amber-600">
                          原文未公开邮箱（已留空）
                        </span>
                      )}
                    </div>
                    {row.research && (
                      <p className="text-slate-600 line-clamp-2">
                        {row.research}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ModalDialog>
  );
}
