import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button, DrawerSheet, SegmentedControl, SelectBox, SwitchControl } from "./ui";
import { apiFetch, cn } from "../lib/api";
import type { AccountConfig, AiConfig, PolicyConfig, SenderProfile, WorkbenchConfig } from "../types";

const ACCOUNT_PRESETS: Record<
  string,
  {
    prefix: string;
    label: string;
    smtp_host: string;
    smtp_port: number;
    smtp_security: "SSL" | "STARTTLS" | "NONE";
    imap_host: string;
    imap_port: number;
    drafts_folder: string;
    note: string;
  }
> = {
  qq: {
    prefix: "QQ邮箱",
    label: "QQ 邮箱",
    smtp_host: "smtp.qq.com",
    smtp_port: 465,
    smtp_security: "SSL",
    imap_host: "imap.qq.com",
    imap_port: 993,
    drafts_folder: "Drafts",
    note: "在 QQ 邮箱网页端【设置 → 账户】开启 IMAP/SMTP 服务，把生成的 16 位授权码填到下方即可。",
  },
  "163": {
    prefix: "163邮箱",
    label: "163 网易邮箱",
    smtp_host: "smtp.163.com",
    smtp_port: 465,
    smtp_security: "SSL",
    imap_host: "imap.163.com",
    imap_port: 993,
    drafts_folder: "Drafts",
    note: "在 163 网页端【设置 → POP3/SMTP/IMAP】开启服务，填入客户端授权密码（不是网页登录密码）。",
  },
  edu: {
    prefix: "高校邮箱",
    label: "高校 .edu 邮箱",
    smtp_host: "",
    smtp_port: 465,
    smtp_security: "SSL",
    imap_host: "",
    imap_port: 993,
    drafts_folder: "Drafts",
    note: "校园邮箱请展开下方「高级网络参数」，按学校信息中心说明填写 SMTP 和 IMAP 服务器地址。",
  },
  "126": {
    prefix: "126邮箱",
    label: "126 邮箱",
    smtp_host: "smtp.126.com",
    smtp_port: 465,
    smtp_security: "SSL",
    imap_host: "imap.126.com",
    imap_port: 993,
    drafts_folder: "Drafts",
    note: "在 126 网页端开启 IMAP/SMTP 服务并填写客户端授权码。",
  },
  gmail: {
    prefix: "Gmail",
    label: "Gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    smtp_security: "SSL",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    drafts_folder: "[Gmail]/Drafts",
    note: "需开启两步验证并生成 16 位应用专用密码。",
  },
};

const FIELD_CLS =
  "w-full h-8.5 px-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[9px] text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all";
const SMALL_FIELD_CLS =
  "w-full h-7 px-2 bg-white ring-1 ring-slate-900/[0.08] rounded-[7px] text-[11.5px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all";

export function SettingsDrawer({
  open,
  initialTab = "profile",
  onOpenChange,
  config,
  quotaToday,
  onSaved,
  askConfirm,
}: {
  open: boolean;
  initialTab?: "profile" | "ai" | "accounts";
  onOpenChange: (v: boolean) => void;
  config: WorkbenchConfig | null;
  quotaToday: Record<string, number>;
  onSaved: () => Promise<void>;
  askConfirm: (opts: { title: string; message: string; confirmText?: string; danger?: boolean }) => Promise<boolean>;
}) {
  const [tab, setTab] = useState<"profile" | "ai" | "accounts">(initialTab);
  const [profile, setProfile] = useState<SenderProfile>({
    name: "",
    affiliation: "",
    degree_info: "",
    research_summary: "",
    phone: "",
    wechat: "",
    github: "",
  });
  const [aiCfg, setAiCfg] = useState<AiConfig>({
    provider: "deepseek",
    base_url: "https://api.deepseek.com",
    model: "deepseek-chat",
    api_key: "",
    has_api_key: false,
    api_key_dirty: false,
  });
  const [policy, setPolicy] = useState<PolicyConfig>({
    min_delay_sec: 180,
    max_delay_sec: 420,
    avoid_consecutive_same_domain: true,
    max_attachment_mb: 3.0,
  });
  const [defaultResume, setDefaultResume] = useState("");
  const [accounts, setAccounts] = useState<AccountConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestMsg, setAiTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testingAccIdx, setTestingAccIdx] = useState<number | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !config) return;
    setProfile({
      name: config.sender_profile?.name || "",
      affiliation: config.sender_profile?.affiliation || "",
      degree_info: config.sender_profile?.degree_info || "",
      research_summary: config.sender_profile?.research_summary || "",
      phone: config.sender_profile?.phone || "",
      wechat: config.sender_profile?.wechat || "",
      github: config.sender_profile?.github || "",
    });
    const hasKey = Boolean(config.ai_config?.has_api_key);
    setAiCfg({
      provider: config.ai_config?.provider || "deepseek",
      base_url: config.ai_config?.base_url || "https://api.deepseek.com",
      model: config.ai_config?.model || "deepseek-chat",
      api_key: hasKey ? "•".repeat(Math.min(16, Math.max(10, config.ai_config?.api_key_len || 12))) : "",
      has_api_key: hasKey,
      api_key_len: config.ai_config?.api_key_len || 0,
      api_key_dirty: false,
    });
    setAiTestMsg(null);
    setPolicy({
      min_delay_sec: config.policy?.min_delay_sec ?? 180,
      max_delay_sec: config.policy?.max_delay_sec ?? 420,
      avoid_consecutive_same_domain: config.policy?.avoid_consecutive_same_domain !== false,
      max_attachment_mb: config.policy?.max_attachment_mb ?? 3.0,
    });
    setDefaultResume(config.default_resume_path || "");
    setAccounts(
      (config.accounts || []).map((a) => ({
        ...a,
        orig_id: a.id,
        password_dirty: false,
        password: a.has_password ? "•".repeat(Math.min(12, Math.max(8, a.password_len || 10))) : "",
      }))
    );
  }, [open, config]);

  async function handleUploadDefaultResume(file: File) {
    setUploadingResume(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = String(reader.result).split(",")[1] || "";
        const res = await apiFetch<{ default_resume_path: string; resume_size_mb: number }>(
          "/api/config/upload_default_resume",
          "POST",
          { filename: file.name, content_base64: b64 }
        );
        setDefaultResume(res.default_resume_path);
        toast.success(`默认简历已保存（${res.resume_size_mb} MB）`);
        await onSaved();
      } catch (e: any) {
        toast.error(`上传失败：${e.message}`);
      } finally {
        setUploadingResume(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleTestAi() {
    setTestingAi(true);
    setAiTestMsg(null);
    try {
      const res = await apiFetch<{ message: string }>("/api/ai/test", "POST", {
        base_url: aiCfg.base_url,
        model: aiCfg.model,
        api_key_dirty: aiCfg.api_key_dirty,
        api_key: aiCfg.api_key_dirty ? aiCfg.api_key : "",
      });
      setAiTestMsg({ ok: true, text: res.message });
      setAiCfg((prev) => ({ ...prev, has_api_key: true, api_key_dirty: false }));
      toast.success("DeepSeek API 连接成功并已保存");
      await onSaved();
    } catch (e: any) {
      setAiTestMsg({ ok: false, text: e.message });
    } finally {
      setTestingAi(false);
    }
  }

  function handleAddAccountPreset(presetKey: string) {
    const preset = ACCOUNT_PRESETS[presetKey] || ACCOUNT_PRESETS.edu;
    const existing = new Set(accounts.map((a) => a.id));
    let idx = 1;
    let newId = `${preset.prefix}-${idx}`;
    while (existing.has(newId)) {
      idx += 1;
      newId = `${preset.prefix}-${idx}`;
    }
    const dname = profile.name
      ? profile.affiliation
        ? `${profile.name}（${profile.affiliation}）`
        : profile.name
      : "";
    setAccounts([
      ...accounts,
      {
        id: newId,
        orig_id: "",
        label: newId,
        email: "",
        display_name: dname,
        smtp_host: preset.smtp_host,
        smtp_port: preset.smtp_port,
        smtp_security: preset.smtp_security,
        imap_host: preset.imap_host,
        imap_port: preset.imap_port,
        drafts_folder: preset.drafts_folder,
        password: "",
        has_password: false,
        password_dirty: false,
        daily_limit: 5,
        enabled: true,
        note: preset.note,
      },
    ]);
    toast.info(`已添加「${newId}」，填入邮箱与授权码后点测试即可`);
  }

  async function handleTestAccount(idx: number) {
    const acc = accounts[idx];
    setTestingAccIdx(idx);
    try {
      const res = await apiFetch<{ result: any; auto_saved: boolean }>("/api/accounts/test", "POST", {
        account_id: acc.orig_id || acc.id,
        new_id: acc.id,
        enabled: acc.enabled,
        daily_limit: acc.daily_limit,
        email: acc.email,
        password_dirty: Boolean(acc.password_dirty),
        password: acc.password_dirty ? acc.password : "",
        smtp_host: acc.smtp_host,
        smtp_port: acc.smtp_port,
        smtp_security: acc.smtp_security,
        imap_host: acc.imap_host,
        imap_port: acc.imap_port,
        drafts_folder: acc.drafts_folder,
        note: acc.note,
      });
      setAccounts((prev) =>
        prev.map((item, i) =>
          i === idx
            ? {
                ...item,
                orig_id: res.auto_saved ? item.id : item.orig_id,
                password_dirty: res.auto_saved ? false : item.password_dirty,
                has_password: res.auto_saved ? true : item.has_password,
                last_test: res.result,
              }
            : item
        )
      );
      if (res.auto_saved) {
        toast.success(`「${acc.id}」收发信验证通过并已自动保存`);
        await onSaved();
      } else {
        toast.warning("连接未通过，请核对邮箱地址与授权码");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTestingAccIdx(null);
    }
  }

  async function handleSaveAll() {
    setSaving(true);
    const dname = profile.name
      ? profile.affiliation
        ? `${profile.name}（${profile.affiliation}）`
        : profile.name
      : "";
    try {
      await apiFetch("/api/config/save", "POST", {
        sender_profile: profile,
        default_resume_path: defaultResume,
        policy,
        ai_config: {
          provider: aiCfg.provider,
          base_url: aiCfg.base_url,
          model: aiCfg.model,
          api_key_dirty: Boolean(aiCfg.api_key_dirty),
          api_key: aiCfg.api_key_dirty ? aiCfg.api_key : "",
        },
        accounts: accounts.map((a, i) => ({
          ...a,
          orig_id: a.orig_id || "",
          id: a.id.trim() || `发件箱-${i + 1}`,
          label: a.id.trim() || `发件箱-${i + 1}`,
          display_name: dname || a.display_name || "",
          password: a.password_dirty ? a.password : "",
        })),
      });
      toast.success("全部设置已保存在本地");
      await onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`保存失败：${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DrawerSheet
      open={open}
      onOpenChange={onOpenChange}
      title="工作台设置"
      subtitle="所有个人资料、邮箱授权码与 API Key 只存在你自己的电脑硬盘上，绝不上传云端"
      footer={
        <>
          <span className="text-[11.5px] text-[#71717A]">纯本地安全保存</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSaveAll}>
              保存全部设置
            </Button>
          </div>
        </>
      }
    >
      <input
        ref={resumeInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadDefaultResume(f);
          e.target.value = "";
        }}
      />

      <SegmentedControl
        layoutId="settings-tab-pill"
        value={tab}
        onValueChange={(v) => setTab(v as "profile" | "ai" | "accounts")}
        options={[
          { value: "profile", label: "我的名片与简历", icon: User },
          { value: "accounts", label: "收发邮箱", icon: Mail },
          { value: "ai", label: "DeepSeek AI", icon: Sparkles },
        ]}
      />

      {/* Tab 1: Profile & Default Resume */}
      {tab === "profile" && (
        <div className="space-y-4">
          <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-card p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[14px] font-bold text-[#18181B]">申请人名片</h3>
              <span className="text-[11.5px] text-[#71717A]">用于邮件署名与 AI 写信背景</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">姓名</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  placeholder="例如：林清韵"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">所在院校</label>
                <input
                  type="text"
                  value={profile.affiliation}
                  onChange={(e) => setProfile({ ...profile, affiliation: e.target.value })}
                  placeholder="例如：XX大学"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">年级与专业</label>
                <input
                  type="text"
                  value={profile.degree_info}
                  onChange={(e) => setProfile({ ...profile, degree_info: e.target.value })}
                  placeholder="例如：2024级中国现当代文学硕士"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">联系电话</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="138-0000-0000"
                  className={cn(FIELD_CLS, "font-mono")}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">微信号（可选）</label>
                <input
                  type="text"
                  value={profile.wechat}
                  onChange={(e) => setProfile({ ...profile, wechat: e.target.value })}
                  className={cn(FIELD_CLS, "font-mono")}
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">个人学术主页（可选）</label>
                <input
                  type="text"
                  value={profile.github}
                  onChange={(e) => setProfile({ ...profile, github: e.target.value })}
                  placeholder="https://..."
                  className={cn(FIELD_CLS, "font-mono")}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">
                学术背景与代表成果（写得越真实具体，AI 帮你润色和评估导师匹配度越准）
              </label>
              <textarea
                rows={4}
                value={profile.research_summary}
                onChange={(e) => setProfile({ ...profile, research_summary: e.target.value })}
                placeholder="例如：硕士论文聚焦数字媒介与城市记忆，已在《XXX》发表论文 1 篇，参与国家社科基金子课题 1 项，掌握田野调查与质性分析方法..."
                className="w-full p-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[11px] text-[12.5px] leading-relaxed text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y transition-all"
              />
            </div>
          </div>

          <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-[14px] font-bold text-[#18181B]">默认简历 PDF</h3>
                <p className="text-[12px] text-[#71717A] m-0 mt-0.5">
                  直接上传你用 Word 或 WPS 导出的 PDF 简历，发信时会自动挂上
                </p>
              </div>
              <Button variant="primary" loading={uploadingResume} onClick={() => resumeInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" />
                <span>上传本地 PDF</span>
              </Button>
            </div>
            <div className="px-3 py-2 rounded-[9px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] font-mono text-[12px] text-[#52525B] truncate">
              {defaultResume || "尚未上传默认简历 PDF"}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Simplified Mailbox Config (Technical SMTP/IMAP folded!) */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-card p-5 space-y-4">
            <div>
              <h3 className="m-0 text-[14px] font-bold text-[#18181B]">添加我的收发邮箱</h3>
              <p className="text-[12px] text-[#71717A] m-0 mt-0.5">
                点选你的邮箱类型，填入邮箱号与授权码即可同时支持发信和自动接收导师回信
              </p>
            </div>

            {/* Clean Brand Quick-Add Pills */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACCOUNT_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleAddAccountPreset(key)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] text-[12px] font-medium text-[#18181B] hover:bg-[#EFF6FF] hover:ring-[#2563EB]/30 hover:text-[#1D4ED8] cursor-pointer transition-all active:scale-[0.97]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {accounts.map((acc, idx) => {
                const used = quotaToday[acc.id] || 0;
                const lt = acc.last_test;
                const needsManualHost = !acc.smtp_host || !acc.imap_host;
                return (
                  <div
                    key={`${acc.orig_id || "new"}-${idx}`}
                    className={cn(
                      "rounded-[14px] p-4 space-y-3 ring-1 transition-colors",
                      acc.enabled
                        ? "bg-white ring-slate-900/[0.09]"
                        : "bg-[#F8F9FB] ring-slate-900/[0.05] opacity-75"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <SwitchControl
                          checked={acc.enabled}
                          onCheckedChange={(v) =>
                            setAccounts((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x)))
                          }
                        />
                        <input
                          type="text"
                          value={acc.id}
                          onChange={(e) =>
                            setAccounts((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, id: e.target.value } : x))
                            )
                          }
                          className="w-[140px] bg-transparent border-b border-transparent hover:border-slate-900/[0.15] focus:border-[#2563EB] outline-none font-bold text-[13px] text-[#18181B]"
                        />
                        <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-[#F3F4F6] text-[#52525B] tabular-nums">
                          今日已发 {used}/{acc.daily_limit || 5}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="blue"
                          loading={testingAccIdx === idx}
                          onClick={() => handleTestAccount(idx)}
                        >
                          测试连接并保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            const ok = await askConfirm({
                              title: "移除这个邮箱？",
                              message: `确定移除「${acc.id}」吗？点底部「保存全部设置」后生效。`,
                              confirmText: "移除",
                              danger: true,
                            });
                            if (ok) setAccounts((prev) => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#E11D48]" />
                        </Button>
                      </div>
                    </div>

                    {/* Primary 3 Human-Friendly Fields */}
                    <div className="grid grid-cols-[1.5fr_1.3fr_0.55fr] gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#52525B] mb-1">我的邮箱地址</label>
                        <input
                          type="text"
                          value={acc.email}
                          onChange={(e) =>
                            setAccounts((prev) => prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))
                          }
                          placeholder="name@qq.com 或校园邮箱"
                          className={cn(FIELD_CLS, "font-mono text-[12px]")}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#52525B] mb-1">
                          客户端授权码{" "}
                          {acc.has_password ? <span className="text-[#047857] font-semibold">(已保存)</span> : ""}
                        </label>
                        <input
                          type="password"
                          value={acc.password}
                          onFocus={(e) => {
                            if (!acc.password_dirty && acc.has_password) e.currentTarget.select();
                          }}
                          onChange={(e) =>
                            setAccounts((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, password: e.target.value, password_dirty: true } : x
                              )
                            )
                          }
                          placeholder="粘贴邮箱授权码"
                          className={cn(FIELD_CLS, "font-mono text-[12px]")}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#52525B] mb-1">每日限发</label>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={acc.daily_limit}
                          onChange={(e) =>
                            setAccounts((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, daily_limit: Number(e.target.value) || 5 } : x
                              )
                            )
                          }
                          className={cn(FIELD_CLS, "font-mono text-[12px]")}
                        />
                      </div>
                    </div>

                    {acc.note && <div className="text-[11.5px] text-[#71717A] leading-relaxed">{acc.note}</div>}

                    {/* Folded Technical SMTP/IMAP Parameters (Auto-open only for custom/edu without host) */}
                    <details open={needsManualHost} className="group rounded-[10px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.05] px-3 py-2">
                      <summary className="cursor-pointer text-[11.5px] font-medium text-[#71717A] select-none flex items-center gap-1 list-none">
                        <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                        <span>高级网络参数（SMTP / IMAP 服务器地址，QQ 与 163 邮箱一般无需修改）</span>
                      </summary>
                      <div className="mt-2.5 space-y-2">
                        <div className="grid grid-cols-[1.4fr_0.55fr_0.75fr] gap-2">
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">SMTP 发件服务器</label>
                            <input
                              type="text"
                              value={acc.smtp_host}
                              onChange={(e) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, smtp_host: e.target.value } : x))
                                )
                              }
                              className={cn(SMALL_FIELD_CLS, "font-mono")}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">端口</label>
                            <input
                              type="number"
                              value={acc.smtp_port}
                              onChange={(e) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, smtp_port: Number(e.target.value) || 465 } : x))
                                )
                              }
                              className={cn(SMALL_FIELD_CLS, "font-mono")}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">加密</label>
                            <SelectBox
                              variant="mini"
                              value={acc.smtp_security}
                              onValueChange={(v) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, smtp_security: v as any } : x))
                                )
                              }
                              options={[
                                { value: "SSL", label: "SSL" },
                                { value: "STARTTLS", label: "STARTTLS" },
                                { value: "NONE", label: "无加密" },
                              ]}
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[1.4fr_0.55fr_0.75fr] gap-2">
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">IMAP 收信与草稿服务器</label>
                            <input
                              type="text"
                              value={acc.imap_host}
                              onChange={(e) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, imap_host: e.target.value } : x))
                                )
                              }
                              className={cn(SMALL_FIELD_CLS, "font-mono")}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">端口</label>
                            <input
                              type="number"
                              value={acc.imap_port}
                              onChange={(e) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, imap_port: Number(e.target.value) || 993 } : x))
                                )
                              }
                              className={cn(SMALL_FIELD_CLS, "font-mono")}
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] text-[#71717A] mb-0.5">草稿箱名</label>
                            <input
                              type="text"
                              value={acc.drafts_folder}
                              onChange={(e) =>
                                setAccounts((prev) =>
                                  prev.map((x, i) => (i === idx ? { ...x, drafts_folder: e.target.value } : x))
                                )
                              }
                              className={cn(SMALL_FIELD_CLS, "font-mono")}
                            />
                          </div>
                        </div>
                      </div>
                    </details>

                    {lt && (
                      <div
                        className={cn(
                          "px-3 py-2 rounded-[9px] text-[12px] ring-1",
                          lt.smtp_ok
                            ? "bg-[#ECFDF5] text-[#047857] ring-[#10B981]/20"
                            : "bg-[#FFF1F2] text-[#BE123C] ring-[#F43F5E]/20"
                        )}
                      >
                        {lt.smtp_ok ? "✓ " : "✕ "}
                        {lt.smtp_msg} ｜ {lt.imap_msg}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <details className="group bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-[#52525B] select-none flex items-center gap-1 list-none">
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
              <span>批量发送防拦截节奏参数（默认已调优，一般无需修改）</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-[11.5px] text-[#71717A] mb-1">最小间隔（秒）</label>
                <input
                  type="number"
                  min={10}
                  max={1800}
                  value={policy.min_delay_sec}
                  onChange={(e) => setPolicy({ ...policy, min_delay_sec: Number(e.target.value) || 180 })}
                  className={cn(FIELD_CLS, "font-mono")}
                />
              </div>
              <div>
                <label className="block text-[11.5px] text-[#71717A] mb-1">最大间隔（秒）</label>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={policy.max_delay_sec}
                  onChange={(e) => setPolicy({ ...policy, max_delay_sec: Number(e.target.value) || 420 })}
                  className={cn(FIELD_CLS, "font-mono")}
                />
              </div>
              <div className="col-span-2 pt-1">
                <SwitchControl
                  checked={policy.avoid_consecutive_same_domain}
                  onCheckedChange={(v) => setPolicy({ ...policy, avoid_consecutive_same_domain: v })}
                  label="自动错开同一所高校的收件邮箱，降低被学校网关拦截的概率"
                />
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Tab 3: DeepSeek BYOK */}
      {tab === "ai" && (
        <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-[14px] font-bold text-[#18181B]">DeepSeek AI 写作助手</h3>
              <p className="text-[12px] text-[#71717A] m-0 mt-0.5">
                填入自己的 API Key，就能帮写套磁信、拟礼貌回信，以及自动提取官网导师并评匹配度
              </p>
            </div>
            <Button variant="blue" loading={testingAi} onClick={handleTestAi}>
              <KeyRound className="w-3.5 h-3.5" />
              <span>测试连接并保存</span>
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">
                DeepSeek API Key{" "}
                {aiCfg.has_api_key ? (
                  <span className="text-[#047857] font-semibold">(已安全保存)</span>
                ) : (
                  <span className="text-[#9CA3AF]">(待填写)</span>
                )}
              </label>
              <input
                type="password"
                value={aiCfg.api_key}
                onFocus={(e) => {
                  if (!aiCfg.api_key_dirty && aiCfg.has_api_key) e.currentTarget.select();
                }}
                onChange={(e) =>
                  setAiCfg({ ...aiCfg, api_key: e.target.value, api_key_dirty: true })
                }
                placeholder="粘贴以 sk- 开头的密钥"
                className={cn(FIELD_CLS, "font-mono")}
              />
            </div>

            {aiTestMsg && (
              <div
                className={cn(
                  "px-3.5 py-2.5 rounded-[10px] text-[12px] flex items-center gap-2 ring-1",
                  aiTestMsg.ok
                    ? "bg-[#ECFDF5] text-[#047857] ring-[#10B981]/20"
                    : "bg-[#FFF1F2] text-[#BE123C] ring-[#F43F5E]/20"
                )}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{aiTestMsg.text}</span>
              </div>
            )}

            <div className="rounded-[12px] bg-[#EFF6FF]/65 ring-1 ring-[#3B82F6]/15 p-3.5 text-[12px] text-[#3F3F46] space-y-1.5">
              <div className="font-semibold text-[#1D4ED8]">3 步获取 DeepSeek 密钥（约 1 分钟）</div>
              <ol className="m-0 pl-4 space-y-1 leading-relaxed">
                <li>打开 DeepSeek 开放平台（<code className="font-mono">platform.deepseek.com</code>）手机号登录；</li>
                <li>点左侧「充值」，充 <strong>5～10 元</strong>（按字数扣费，写一封信不到 1 分钱，不需要包月）；</li>
                <li>点左侧「API Keys」→「创建 API Key」，复制粘贴到上面输入框点“测试连接并保存”即可。</li>
              </ol>
            </div>

            <details className="group rounded-[10px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.05] px-3 py-2">
              <summary className="cursor-pointer text-[11.5px] font-medium text-[#71717A] select-none flex items-center gap-1 list-none">
                <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                <span>高级模型参数（一般无需修改）</span>
              </summary>
              <div className="grid grid-cols-2 gap-3 mt-2.5">
                <div>
                  <label className="block text-[11px] text-[#71717A] mb-1">模型版本</label>
                  <SelectBox
                    variant="form"
                    value={aiCfg.model}
                    onValueChange={(v) => setAiCfg({ ...aiCfg, model: v })}
                    options={[
                      { value: "deepseek-chat", label: "deepseek-chat（推荐，快且稳）" },
                      { value: "deepseek-reasoner", label: "deepseek-reasoner（深度思考）" },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#71717A] mb-1">接口地址 Base URL</label>
                  <input
                    type="text"
                    value={aiCfg.base_url}
                    onChange={(e) => setAiCfg({ ...aiCfg, base_url: e.target.value })}
                    className={cn(FIELD_CLS, "font-mono text-[12px]")}
                  />
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </DrawerSheet>
  );
}
