import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Mail,
  Pencil,
  Plus,
  Search,
  Server,
  ShieldAlert,
  Trash2,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import {
  MAILBOX_PRESETS,
  type BootstrapData,
  type DiscoverMailAccountResult,
  type MailAccountPublic,
  type MailAccountTestResult,
} from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { BaseSwitch } from "@/components/ui/BaseSwitch.js";
import { Button } from "@/components/ui/Button.js";

export interface MailboxSettingsPanelProps {
  bootstrap: BootstrapData;
}

interface MailboxFormState {
  id?: string;
  label: string;
  email: string;
  displayName: string;
  providerType: "imap_smtp" | "ms_graph" | "gmail_api";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "SSL" | "STARTTLS" | "NONE";
  imapHost: string;
  imapPort: number;
  draftsFolder: string;
  credential: string;
  credentialDirty: boolean;
  hasExistingCred: boolean;
  existingCredLen: number;
  dailyLimit: number;
  enabled: boolean;
  note: string;
}

function emptyMailboxForm(): MailboxFormState {
  return {
    label: "",
    email: "",
    displayName: "",
    providerType: "imap_smtp",
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "",
    imapPort: 993,
    draftsFolder: "Drafts",
    credential: "",
    credentialDirty: false,
    hasExistingCred: false,
    existingCredLen: 0,
    dailyLimit: 5,
    enabled: true,
    note: "",
  };
}

/**
 * 系统设置子面板 2：多发件邮箱配置、DNS MX 自动嗅探与 SMTP/IMAP 双向连通验证。
 */
export function MailboxSettingsPanel({ bootstrap }: MailboxSettingsPanelProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState<MailboxFormState>(emptyMailboxForm);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoverMailAccountResult | null>(null);
  const [lastLiveTest, setLastLiveTest] = useState<MailAccountTestResult | null>(null);

  function loadAccountForEdit(acc: MailAccountPublic) {
    setForm({
      id: acc.id,
      label: acc.label,
      email: acc.email,
      displayName: acc.displayName,
      providerType: acc.providerType,
      smtpHost: acc.smtpHost,
      smtpPort: acc.smtpPort,
      smtpSecurity: acc.smtpSecurity,
      imapHost: acc.imapHost,
      imapPort: acc.imapPort,
      draftsFolder: acc.draftsFolder || "Drafts",
      credential: "",
      credentialDirty: false,
      hasExistingCred: acc.hasCredential,
      existingCredLen: acc.credentialLen,
      dailyLimit: acc.dailyLimit,
      enabled: acc.enabled,
      note: acc.note || "",
    });
    setLastLiveTest(acc.lastTest);
    setDiscovery(null);
  }

  const discoverMutation = useMutation({
    mutationFn: () => workerApi.discoverMailAccount(form.email.trim()),
    onSuccess: (res) => {
      const d = res.discovery;
      setDiscovery(d);
      setForm((prev) => ({
        ...prev,
        label: prev.label || d.providerLabel,
        smtpHost: d.smtpHost || prev.smtpHost,
        smtpPort: d.smtpPort || prev.smtpPort,
        smtpSecurity: d.smtpSecurity || prev.smtpSecurity,
        imapHost: d.imapHost || prev.imapHost,
        imapPort: d.imapPort || prev.imapPort,
        draftsFolder: d.draftsFolder || prev.draftsFolder,
        note: prev.note || d.note,
      }));
      toast.success(`已自动识别服务商：${d.providerLabel}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function buildPayload() {
    return {
      ...(form.id ? { id: form.id } : {}),
      label: form.label.trim() || form.email.trim(),
      email: form.email.trim(),
      displayName: form.displayName.trim(),
      providerType: form.providerType,
      smtpHost: form.smtpHost.trim(),
      smtpPort: Number(form.smtpPort) || 465,
      smtpSecurity: form.smtpSecurity,
      imapHost: form.imapHost.trim(),
      imapPort: Number(form.imapPort) || 993,
      draftsFolder: form.draftsFolder.trim() || "Drafts",
      credential: form.credential,
      credentialDirty: form.credentialDirty,
      dailyLimit: Number(form.dailyLimit) || 5,
      enabled: form.enabled,
      note: form.note.trim(),
    };
  }

  const testMutation = useMutation({
    mutationFn: () =>
      workerApi.testMailAccount({
        ...buildPayload(),
        autoSaveOnSuccess: true,
      }),
    onSuccess: async (res) => {
      setLastLiveTest(res.result);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      if (res.account) {
        loadAccountForEdit(res.account);
      }
      if (res.result.smtpOk && res.result.imapOk) {
        toast.success("SMTP 发件与 IMAP 收信/草稿同步均已畅通，并自动保存配置");
      } else if (res.result.smtpOk) {
        toast.warning(`SMTP 连通成功，IMAP 存在异常：${res.result.imapMsg}`);
      } else {
        toast.error(`发件连通失败：${res.result.smtpMsg}`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload();
      return form.id
        ? workerApi.updateMailAccount(form.id, payload)
        : workerApi.createMailAccount(payload);
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      loadAccountForEdit(res.account);
      toast.success("发件箱参数已保存到 PostgreSQL 密钥库");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workerApi.deleteMailAccount(id),
    onSuccess: async (_res, id) => {
      if (form.id === id) {
        setForm(emptyMailboxForm());
        setLastLiveTest(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已删除该发件邮箱配置");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      {/* 已配置邮箱清单 */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
              <Mail className="w-4 h-4 theme-text" />
              已配置的多发件箱信道（{bootstrap.mailAccounts.length}）
            </h2>
            <p className="text-[12px] text-[#64748B] mt-1">
              建议配置 1 个校园 .edu.cn 主账号与 1 个高频个人邮箱交替轮换发信，严守每日安全配额
            </p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => {
              setForm(emptyMailboxForm());
              setLastLiveTest(null);
              setDiscovery(null);
            }}
          >
            新增发件邮箱
          </Button>
        </div>

        {bootstrap.mailAccounts.length === 0 ? (
          <div className="py-7 text-center text-[12.5px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
            暂未添加发件邮箱，请在下方输入邮箱地址并自动探测参数
          </div>
        ) : (
          <div className="space-y-2.5">
            {bootstrap.mailAccounts.map((acc) => {
              const quotaUsed = bootstrap.quotaToday[acc.id] || 0;
              const editing = form.id === acc.id;
              return (
                <div
                  key={acc.id}
                  className={cn(
                    "p-3.5 rounded-[16px] border flex flex-wrap items-center justify-between gap-3 transition-all",
                    editing
                      ? "bg-[#FAFAFB] border-[var(--accent-border)]"
                      : "bg-[#FAFAFB] border-slate-200/80"
                  )}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-bold text-[#0F172A]">
                        {acc.label}
                      </span>
                      <span className="text-[12px] cue-mono text-[#475569]">
                        {acc.email}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10.5px] font-medium border",
                          acc.enabled
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-slate-100 text-slate-500 border-slate-200"
                        )}
                      >
                        {acc.enabled ? "参与发信" : "已停用"}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#64748B] flex flex-wrap items-center gap-3">
                      <span>
                        今日配额：{quotaUsed} / {acc.dailyLimit} 封
                      </span>
                      <span>
                        SMTP：{acc.smtpHost || "未填"}:{acc.smtpPort}
                      </span>
                      {acc.lastTest && (
                        <span
                          className={
                            acc.lastTest.smtpOk && acc.lastTest.imapOk
                              ? "text-emerald-700"
                              : "text-amber-700"
                          }
                        >
                          SMTP {acc.lastTest.smtpOk ? "正常" : "异常"} · IMAP{" "}
                          {acc.lastTest.imapOk ? "正常" : "异常"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={<Pencil className="w-3 h-3" />}
                      onClick={() => loadAccountForEdit(acc)}
                    >
                      编辑
                    </Button>
                    <button
                      type="button"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(acc.id)}
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer"
                      title="删除邮箱"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 新增 / 编辑发件箱向导 */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
            <Server className="w-4 h-4 theme-text" />
            {form.id ? `编辑发件箱：${form.label || form.email}` : "配置新发件箱（支持 MX 智能识别）"}
          </h3>

          {/* 预设服务商快捷填充 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {MAILBOX_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    label: prev.label || preset.label,
                    smtpHost: preset.smtpHost,
                    smtpPort: preset.smtpPort,
                    smtpSecurity: preset.smtpSecurity,
                    imapHost: preset.imapHost,
                    imapPort: preset.imapPort,
                    draftsFolder: preset.draftsFolder,
                    note: preset.note,
                  }));
                  setDiscovery({
                    presetKey: preset.key,
                    providerLabel: preset.label,
                    mxHosts: [],
                    smtpHost: preset.smtpHost,
                    smtpPort: preset.smtpPort,
                    smtpSecurity: preset.smtpSecurity,
                    imapHost: preset.imapHost,
                    imapPort: preset.imapPort,
                    draftsFolder: preset.draftsFolder,
                    authGuideUrl: preset.authGuideUrl,
                    guideSteps: preset.guideSteps,
                    note: preset.note,
                    detectedVia: "domain",
                  });
                }}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#FAFAFB] hairline text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              邮箱地址 *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="例如：name@stu.univ.edu.cn"
                className="min-w-0 flex-1 h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] cue-mono text-[#0F172A] outline-none"
              />
              <Button
                variant="secondary"
                size="sm"
                loading={discoverMutation.isPending}
                disabled={!form.email.includes("@")}
                className="shrink-0 whitespace-nowrap"
                icon={<Search className="w-3.5 h-3.5" />}
                onClick={() => discoverMutation.mutate()}
              >
                MX 自动识别
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              账号备注名称 *
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="如：校内主邮箱 / QQ 备用"
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11.5px] font-semibold text-[#475569]">
              授权码 / 客户端密码（后端 AES-256 加密存储）
            </label>
            <input
              type="password"
              value={form.credential}
              onChange={(e) =>
                setForm({
                  ...form,
                  credential: e.target.value,
                  credentialDirty: true,
                })
              }
              placeholder={
                form.hasExistingCred && !form.credentialDirty
                  ? `已加密保存 (${form.existingCredLen} 位)，如需更换请直接输入新授权码`
                  : "粘贴 16 位 SMTP/IMAP 授权码（自动去除空格）"
              }
              className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                发件人署名（Display Name）
              </label>
              <input
                type="text"
                value={form.displayName}
                onChange={(e) =>
                  setForm({ ...form, displayName: e.target.value })
                }
                placeholder="默认联动个人履历姓名"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                每日安全上限（封/天）
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={form.dailyLimit}
                onChange={(e) =>
                  setForm({ ...form, dailyLimit: Number(e.target.value) || 5 })
                }
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>
          </div>
        </div>

        {/* 授权码操作引导卡片 */}
        {discovery && discovery.guideSteps.length > 0 && (
          <div className="card-well p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-[#0F172A]">
                {discovery.providerLabel} · 客户端授权指南
              </span>
              {discovery.authGuideUrl && (
                <a
                  href={discovery.authGuideUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium theme-text hover:underline"
                >
                  前往官方获取授权码
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[12px] text-[#475569]">
              {discovery.guideSteps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {/* 折叠式高级网络参数 */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer bg-transparent border-0 p-0"
          >
            {showAdvanced ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
            <span>展开高级网络参数（SMTP / IMAP 主机与草稿箱路径）</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-[16px] bg-[#FAFAFB] hairline grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#475569]">
                  SMTP 发信服务器
                </label>
                <input
                  type="text"
                  value={form.smtpHost}
                  onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                  placeholder="smtp.univ.edu.cn"
                  className="w-full h-8 px-2.5 rounded-[12px] bg-white hairline text-[12px] cue-mono outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#475569]">
                  SMTP 端口与加密
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    value={form.smtpPort}
                    onChange={(e) =>
                      setForm({ ...form, smtpPort: Number(e.target.value) || 465 })
                    }
                    className="h-8 px-2.5 rounded-[12px] bg-white hairline text-[12px] outline-none"
                  />
                  <select
                    value={form.smtpSecurity}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        smtpSecurity: e.target.value as "SSL" | "STARTTLS" | "NONE",
                      })
                    }
                    className="h-8 px-2 rounded-[12px] bg-white hairline text-[12px] outline-none"
                  >
                    <option value="SSL">SSL</option>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="NONE">NONE</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#475569]">
                  IMAP 收信服务器与端口
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_70px] gap-1.5">
                  <input
                    type="text"
                    value={form.imapHost}
                    onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                    placeholder="imap.univ.edu.cn"
                    className="h-8 px-2.5 rounded-[12px] bg-white hairline text-[12px] cue-mono outline-none"
                  />
                  <input
                    type="number"
                    value={form.imapPort}
                    onChange={(e) =>
                      setForm({ ...form, imapPort: Number(e.target.value) || 993 })
                    }
                    className="h-8 px-2 rounded-[12px] bg-white hairline text-[12px] outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[#475569]">
                  IMAP 草稿文件夹名
                </label>
                <input
                  type="text"
                  value={form.draftsFolder}
                  onChange={(e) =>
                    setForm({ ...form, draftsFolder: e.target.value })
                  }
                  placeholder="Drafts"
                  className="w-full h-8 px-2.5 rounded-[12px] bg-white hairline text-[12px] outline-none"
                />
              </div>
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-semibold text-[#475569]">
                  账号使用备注
                </label>
                <input
                  type="text"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="例如：专门负责华东高校投递"
                  className="w-full h-8 px-2.5 rounded-[12px] bg-white hairline text-[12px] outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* 最近连通诊断反馈 */}
        {lastLiveTest && (
          <div className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div className="flex items-start gap-2">
              {lastLiveTest.smtpOk ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold text-[#0F172A]">
                  SMTP 发信检测：{lastLiveTest.smtpOk ? "通过" : "失败"}
                </div>
                <div className="text-[#64748B] text-[11.5px]">
                  {lastLiveTest.smtpMsg}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              {lastLiveTest.imapOk ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold text-[#0F172A]">
                  IMAP 回信同步检测：{lastLiveTest.imapOk ? "通过" : "警告/失败"}
                </div>
                <div className="text-[#64748B] text-[11.5px]">
                  {lastLiveTest.imapMsg}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <BaseSwitch
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm({ ...form, enabled })}
            label="启用该发件箱参与错峰轮换"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              loading={testMutation.isPending}
              disabled={!form.email.trim()}
              icon={<Wifi className="w-3.5 h-3.5" />}
              onClick={() => testMutation.mutate()}
            >
              测试连通并自动保存
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saveMutation.isPending}
              disabled={!form.email.trim()}
              onClick={() => saveMutation.mutate()}
            >
              {form.id ? "保存更新配置" : "仅保存发件箱"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
