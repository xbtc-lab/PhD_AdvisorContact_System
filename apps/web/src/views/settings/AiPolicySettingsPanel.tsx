import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, RotateCcw, Save, ShieldCheck, Wifi } from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData, PolicyConfig } from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import { BaseSwitch } from "@/components/ui/BaseSwitch.js";
import { Button } from "@/components/ui/Button.js";

export interface AiPolicySettingsPanelProps {
  bootstrap: BootstrapData;
}

const LLM_PRESETS = [
  {
    label: "DeepSeek 官方",
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    label: "SiliconFlow",
    provider: "openai-compatible",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3",
  },
  {
    label: "OpenRouter",
    provider: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-chat",
  },
];

/**
 * 系统设置子面板 3：大语言模型接口密钥配置与错峰安全发信护栏策略。
 */
export function AiPolicySettingsPanel({
  bootstrap,
}: AiPolicySettingsPanelProps) {
  const queryClient = useQueryClient();

  const [provider, setProvider] = useState(bootstrap.aiConfig.provider);
  const [baseUrl, setBaseUrl] = useState(bootstrap.aiConfig.baseUrl);
  const [model, setModel] = useState(bootstrap.aiConfig.model);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);

  const [policy, setPolicy] = useState<PolicyConfig>(bootstrap.policy);

  useEffect(() => {
    setProvider(bootstrap.aiConfig.provider);
    setBaseUrl(bootstrap.aiConfig.baseUrl);
    setModel(bootstrap.aiConfig.model);
    setApiKey("");
    setApiKeyDirty(false);
    setClearApiKey(false);
    setPolicy(bootstrap.policy);
  }, [bootstrap.aiConfig, bootstrap.policy]);

  const testAiMutation = useMutation({
    mutationFn: () =>
      cloudApi.testAi({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKeyDirty ? apiKey.trim() : undefined,
        apiKeyDirty,
      }),
    onSuccess: (res) => {
      toast.success(
        `LLM 响应成功 (${res.latencyMs}ms · ${res.model})：${res.message}`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveAiMutation = useMutation({
    mutationFn: () =>
      workerApi.updateSettings({
        aiConfig: {
          provider: provider.trim() || "deepseek",
          baseUrl: baseUrl.trim() || "https://api.deepseek.com",
          model: model.trim() || "deepseek-chat",
          apiKey: apiKeyDirty ? apiKey.trim() : undefined,
          apiKeyDirty,
          clearApiKey,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("AI 引擎配置已安全加密落库");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const savePolicyMutation = useMutation({
    mutationFn: () => workerApi.updateSettings({ policy }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("错峰安全与附件约束策略已更新");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const resetQuotaMutation = useMutation({
    mutationFn: () => workerApi.resetTodayQuota(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      await queryClient.invalidateQueries({ queryKey: ["dispatch-status"] });
      toast.success("已清零今日客户端发信配额计数");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* AI 模型配置 */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
              <Bot className="w-4 h-4 theme-text" />
              Cue AI 写信与导师分析引擎（OpenAI 兼容协议）
            </h2>
            <p className="text-[12px] text-[#64748B] mt-1">
              密钥以 AES-256 密文存入数据库；驱动「写信工坊」多会话润色、「发现导师」匹配分析及主页师资提取
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {LLM_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setProvider(p.provider);
                  setBaseUrl(p.baseUrl);
                  setModel(p.model);
                }}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FAFAFB] hairline text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              API Base URL
            </label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com"
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] cue-mono text-[#0F172A] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              模型标识（Model ID）
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="deepseek-chat"
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] cue-mono text-[#0F172A] outline-none"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                API Key
              </label>
              {bootstrap.aiConfig.hasApiKey && !clearApiKey && (
                <button
                  type="button"
                  onClick={() => {
                    setClearApiKey(true);
                    setApiKey("");
                    setApiKeyDirty(false);
                  }}
                  className="text-[11px] text-rose-600 hover:underline bg-transparent border-0 cursor-pointer"
                >
                  清除已存密钥
                </button>
              )}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setApiKeyDirty(true);
                setClearApiKey(false);
              }}
              placeholder={
                clearApiKey
                  ? "已标记清除现有密钥，保存后生效"
                  : bootstrap.aiConfig.hasApiKey && !apiKeyDirty
                  ? `已加密配置密钥 (${bootstrap.aiConfig.apiKeyLen} 位)，如需更换请直接输入`
                  : "粘贴 sk-... 密钥"
              }
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="secondary"
            size="sm"
            loading={testAiMutation.isPending}
            icon={<Wifi className="w-3.5 h-3.5" />}
            onClick={() => testAiMutation.mutate()}
          >
            测试 AI 连通性
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saveAiMutation.isPending}
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={() => saveAiMutation.mutate()}
          >
            保存 AI 配置
          </Button>
        </div>
      </div>

      {/* 发信风控与频率策略 */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 theme-text" />
              批量错峰发信与附件防退信护栏
            </h2>
            <p className="text-[12px] text-[#64748B] mt-1">
              高校邮件网关对短时同域名突发性投递极度敏感，合理设置随机延迟与体积阈值可显著提升收件箱直达率
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            loading={resetQuotaMutation.isPending}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => resetQuotaMutation.mutate()}
          >
            清零今日已发计数
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              最小随机等待间隔（秒）
            </label>
            <input
              type="number"
              min={5}
              max={3600}
              value={policy.minDelaySec}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  minDelaySec: Number(e.target.value) || 180,
                })
              }
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              最大随机等待间隔（秒）
            </label>
            <input
              type="number"
              min={5}
              max={7200}
              value={policy.maxDelaySec}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  maxDelaySec: Number(e.target.value) || 420,
                })
              }
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              附件体积上限预警（MB）
            </label>
            <input
              type="number"
              step={0.5}
              min={0.5}
              max={25}
              value={policy.maxAttachmentMb}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  maxAttachmentMb: Number(e.target.value) || 2.5,
                })
              }
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <BaseSwitch
            checked={policy.avoidConsecutiveSameDomain}
            onCheckedChange={(avoidConsecutiveSameDomain) =>
              setPolicy({ ...policy, avoidConsecutiveSameDomain })
            }
            label="队列调度自动错开连续同一所高校域名（如连续两封 @zju.edu.cn）"
          />

          <Button
            variant="primary"
            size="sm"
            loading={savePolicyMutation.isPending}
            icon={<Save className="w-3.5 h-3.5" />}
            onClick={() => savePolicyMutation.mutate()}
          >
            保存发信安全策略
          </Button>
        </div>
      </div>
    </div>
  );
}
