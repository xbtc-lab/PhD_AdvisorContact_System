import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AiExtractMode } from "@app/shared";
import { opsApi } from "@/lib/ops-api.js";

export function GuardrailsPage() {
  const queryClient = useQueryClient();

  const guardrailsQuery = useQuery({
    queryKey: ["ops-guardrails"],
    queryFn: opsApi.getGuardrails,
  });
  const keysQuery = useQuery({
    queryKey: ["ops-llm-keys"],
    queryFn: opsApi.getLlmKeys,
  });
  const dictsQuery = useQuery({
    queryKey: ["ops-dictionaries"],
    queryFn: opsApi.getDictionaries,
  });

  // Guardrails state
  const [aiMode, setAiMode] = useState<AiExtractMode>("rule_only");
  const [monthlyBudget, setMonthlyBudget] = useState(200);
  const [domainRps, setDomainRps] = useState(1.0);
  const [cbThreshold, setCbThreshold] = useState(5);

  useEffect(() => {
    const g = guardrailsQuery.data?.guardrails;
    if (g) {
      setAiMode(g.defaultAiMode);
      setMonthlyBudget(g.monthlyBudgetCny);
      setDomainRps(g.domainRps);
      setCbThreshold(g.circuitBreakerThreshold);
    }
  }, [guardrailsQuery.data]);

  const saveGuardrailsMutation = useMutation({
    mutationFn: () =>
      opsApi.updateGuardrails({
        defaultAiMode: aiMode,
        monthlyBudgetCny: Number(monthlyBudget),
        domainRps: Number(domainRps),
        circuitBreakerThreshold: Number(cbThreshold),
      }),
    onSuccess: () => {
      toast.success("已更新全局采集护栏与默认 AI 模式");
      queryClient.invalidateQueries({ queryKey: ["ops-guardrails"] });
      queryClient.invalidateQueries({ queryKey: ["ops-overview"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // LLM Key form
  const [keyLabel, setKeyLabel] = useState("");
  const [keyProvider, setKeyProvider] = useState("deepseek");
  const [keySecret, setKeySecret] = useState("");
  const [keyDailyLimit, setKeyDailyLimit] = useState(5);
  const [keyOffPeakOnly, setKeyOffPeakOnly] = useState(true);

  const addKeyMutation = useMutation({
    mutationFn: () =>
      opsApi.createLlmKey({
        label: keyLabel.trim(),
        provider: keyProvider,
        baseUrl:
          keyProvider === "qwen"
            ? "https://dashscope.aliyuncs.com/compatible-mode/v1"
            : "https://api.deepseek.com",
        model: keyProvider === "qwen" ? "qwen-plus" : "deepseek-chat",
        apiKey: keySecret.trim(),
        dailyBudgetCny: Number(keyDailyLimit),
        monthlyBudgetCny: 100,
        rpmLimit: 30,
        offPeakOnly: keyOffPeakOnly,
        priority: 1,
      }),
    onSuccess: () => {
      toast.success("已加密入库 API Key 限额配置");
      setKeyLabel("");
      setKeySecret("");
      queryClient.invalidateQueries({ queryKey: ["ops-llm-keys"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => opsApi.deleteLlmKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops-llm-keys"] });
    },
  });

  // Dictionary Editor
  const [dictInput, setDictInput] = useState<Record<string, string>>({});
  const updateDictMutation = useMutation({
    mutationFn: ({ kind, entries }: { kind: string; entries: string[] }) =>
      opsApi.updateDictionary(kind, entries),
    onSuccess: () => {
      toast.success("词典已热更新生效");
      queryClient.invalidateQueries({ queryKey: ["ops-dictionaries"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">05 · 规则词典与 AI 限额护栏 Guardrails</h1>
        <p className="text-[12.5px] text-[#64748B] mt-0.5">
          控制 Rule-First 三档模式、多 API Key 日/月限额熔断，以及动态维护人才帽子与招博词典
        </p>
      </div>

      {/* Global Mode & Politeness */}
      <div className="ops-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">全局 AI 模式与礼貌限速配置</h2>
          <button
            type="button"
            onClick={() => saveGuardrailsMutation.mutate()}
            disabled={saveGuardrailsMutation.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#141417] text-white text-[12.5px] font-medium cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-[#FF5C35]" />
            保存护栏配置
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(
            [
              {
                key: "rule_only",
                title: "纯规则模式 (rule_only)",
                desc: "严格零 LLM 调用（¥0），遇到非结构化长简历直接入待审池",
              },
              {
                key: "manual",
                title: "手动按需模式 (manual)",
                desc: "批量抓取走规则，仅人工点击单条纠偏时才调用 AI",
              },
              {
                key: "auto_fallback",
                title: "规则优先 + AI 兜底",
                desc: "80–90% 规则直出，仅未达标页面且 Key 额度充足时自动兜底",
              },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setAiMode(m.key)}
              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                aiMode === m.key
                  ? "border-[#FF5C35] bg-[#FFF7ED]"
                  : "border-[#E5E7EB] bg-white hover:bg-[#FAFAFB]"
              }`}
            >
              <div className="font-bold text-[13px]">{m.title}</div>
              <div className="text-[11.5px] text-[#64748B] mt-1">{m.desc}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px] pt-1">
          <div>
            <label className="block text-[12px] font-medium text-[#475569] mb-1">
              月度总预算熔断阈值 (CNY)
            </label>
            <input
              type="number"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#475569] mb-1">
              单域名每秒请求速率 (RPS)
            </label>
            <input
              type="number"
              step="0.2"
              value={domainRps}
              onChange={(e) => setDomainRps(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[#475569] mb-1">
              连续失败熔断阈值（次）
            </label>
            <input
              type="number"
              value={cbThreshold}
              onChange={(e) => setCbThreshold(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
            />
          </div>
        </div>
      </div>

      {/* Multi API Key Pool */}
      <div className="ops-card p-5 space-y-4">
        <h2 className="text-[15px] font-bold">多 API Key 限额池（AES-256-GCM 加密托管）</h2>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2.5 items-end text-[12.5px]">
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-[#64748B] mb-1">Key 别名</label>
            <input
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              placeholder="如：DeepSeek 谷时池"
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">模型厂商</label>
            <select
              value={keyProvider}
              onChange={(e) => setKeyProvider(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white"
            >
              <option value="deepseek">DeepSeek</option>
              <option value="qwen">阿里 Qwen</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">API Secret Key</label>
            <input
              type="password"
              value={keySecret}
              onChange={(e) => setKeySecret(e.target.value)}
              placeholder="sk-..."
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">日限额 (¥)</label>
            <input
              type="number"
              value={keyDailyLimit}
              onChange={(e) => setKeyDailyLimit(Number(e.target.value))}
              className="w-full h-9 px-3 rounded-lg border border-[#E5E7EB] ops-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => addKeyMutation.mutate()}
            disabled={!keyLabel.trim() || keySecret.trim().length < 6}
            className="inline-flex items-center justify-center gap-1 h-9 px-3 rounded-lg bg-[#141417] text-white font-medium cursor-pointer disabled:opacity-45"
          >
            <Plus className="w-3.5 h-3.5" />
            添加 Key
          </button>
        </div>

        {(keysQuery.data?.items || []).length > 0 && (
          <div className="divide-y divide-[#F1F5F9] border border-[#E5E7EB] rounded-xl">
            {keysQuery.data!.items.map((k) => (
              <div key={k.id} className="px-4 py-2.5 flex items-center justify-between text-[12.5px]">
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {k.label}{" "}
                    <span className="ops-mono text-[11px] text-[#64748B] ml-2">
                      {k.provider}/{k.model} · {k.maskedKey}
                    </span>
                  </div>
                  <div className="text-[11px] ops-mono text-[#64748B]">
                    今日已用 ¥{k.usedTodayCny.toFixed(2)} / 日限 ¥{k.dailyBudgetCny} · 月限 ¥
                    {k.monthlyBudgetCny} {k.offPeakOnly ? "· 仅谷时启用" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteKeyMutation.mutate(k.id)}
                  className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rule Dictionaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(dictsQuery.data?.items || []).map((dict) => (
          <div key={dict.kind} className="ops-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[13.5px]">{dict.name}</h3>
                <div className="text-[11px] ops-mono text-[#64748B]">
                  {dict.kind} · {dict.entries.length} 词条
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dict.entries.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] bg-[#F1F5F9] text-[#334155]"
                >
                  {word}
                  <button
                    type="button"
                    onClick={() =>
                      updateDictMutation.mutate({
                        kind: dict.kind,
                        entries: dict.entries.filter((e) => e !== word),
                      })
                    }
                    className="text-[#94A3B8] hover:text-[#DC2626] cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={dictInput[dict.kind] || ""}
                onChange={(e) =>
                  setDictInput((prev) => ({ ...prev, [dict.kind]: e.target.value }))
                }
                placeholder="输入新增词条..."
                className="flex-1 h-8 px-2.5 rounded-lg border border-[#E5E7EB] text-[12px]"
              />
              <button
                type="button"
                onClick={() => {
                  const word = (dictInput[dict.kind] || "").trim();
                  if (!word) return;
                  updateDictMutation.mutate({
                    kind: dict.kind,
                    entries: [...dict.entries, word],
                  });
                  setDictInput((prev) => ({ ...prev, [dict.kind]: "" }));
                }}
                className="h-8 px-3 rounded-lg bg-[#141417] text-white text-[12px] cursor-pointer"
              >
                追加
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
