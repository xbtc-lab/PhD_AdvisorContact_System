import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ApplicantProfile,
  BootstrapData,
  DiscoverMailAccountResult,
  MailAccountPublic,
  ProjectItem,
  PublicationItem,
} from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import { cn, fileToBase64 } from "@/lib/cn.js";
import { useAppStore, type SettingsTabKey } from "@/store/useAppStore.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { Button } from "./ui/Button.js";
import { FamilyDrawer } from "./ui/FamilyDrawer.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";

export interface SettingsDrawerProps {
  bootstrap: BootstrapData;
}

interface MailFormState {
  id?: string;
  label: string;
  email: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "SSL" | "STARTTLS" | "NONE";
  imapHost: string;
  imapPort: number;
  draftsFolder: string;
  credential: string;
  credentialDirty: boolean;
  dailyLimit: number;
  enabled: boolean;
  note: string;
}

function emptyMailForm(): MailFormState {
  return {
    label: "",
    email: "",
    displayName: "",
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "",
    imapPort: 993,
    draftsFolder: "Drafts",
    credential: "",
    credentialDirty: false,
    dailyLimit: 5,
    enabled: true,
    note: "",
  };
}

/**
 * 全局设置与个人工作台配置抽屉：
 * 1) 科研名片与 PDF 简历库；2) MX 自动探测发件箱向导；3) AI 网关与发送策略；4) 数据备份与管理员入口。
 */
export function SettingsDrawer({ bootstrap }: SettingsDrawerProps) {
  const queryClient = useQueryClient();
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const settingsTab = useAppStore((s) => s.settingsTab);
  const openSettings = useAppStore((s) => s.openSettings);
  const setCsvImportOpen = useAppStore((s) => s.setCsvImportOpen);
  const setAdminPromptOpen = useAppStore((s) => s.setAdminPromptOpen);

  // --- Tab 1: 科研名片状态 ---
  const [profile, setProfile] = useState<ApplicantProfile>(bootstrap.profile);
  const [directionsInput, setDirectionsInput] = useState("");
  const [skillsInput, setSkillsInput] = useState("");

  useEffect(() => {
    setProfile(bootstrap.profile);
    setDirectionsInput((bootstrap.profile.targetDirections || []).join("、"));
    setSkillsInput((bootstrap.profile.methodsSkills || []).join("、"));
  }, [bootstrap.profile, open]);

  // --- Tab 2: 发件箱表单状态 ---
  const [mailForm, setMailForm] = useState<MailFormState>(emptyMailForm);
  const [editingAccMeta, setEditingAccMeta] =
    useState<MailAccountPublic | null>(null);
  const [discovery, setDiscovery] =
    useState<DiscoverMailAccountResult | null>(null);

  // --- Tab 3: AI 与发送策略状态 ---
  const [aiBaseUrl, setAiBaseUrl] = useState(bootstrap.aiConfig.baseUrl);
  const [aiModel, setAiModel] = useState(bootstrap.aiConfig.model);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiKeyDirty, setAiKeyDirty] = useState(false);

  const [minDelaySec, setMinDelaySec] = useState(bootstrap.policy.minDelaySec);
  const [maxDelaySec, setMaxDelaySec] = useState(bootstrap.policy.maxDelaySec);
  const [avoidSameDomain, setAvoidSameDomain] = useState(
    bootstrap.policy.avoidConsecutiveSameDomain
  );
  const [maxAttachmentMb, setMaxAttachmentMb] = useState(
    bootstrap.policy.maxAttachmentMb
  );
  const [avatarStyle, setAvatarStyle] = useState<"facehash" | "initials">(
    bootstrap.preferences.avatarStyle
  );

  useEffect(() => {
    setAiBaseUrl(bootstrap.aiConfig.baseUrl);
    setAiModel(bootstrap.aiConfig.model);
    setAiApiKey("");
    setAiKeyDirty(false);
    setMinDelaySec(bootstrap.policy.minDelaySec);
    setMaxDelaySec(bootstrap.policy.maxDelaySec);
    setAvoidSameDomain(bootstrap.policy.avoidConsecutiveSameDomain);
    setMaxAttachmentMb(bootstrap.policy.maxAttachmentMb);
    setAvatarStyle(bootstrap.preferences.avatarStyle);
  }, [bootstrap.aiConfig, bootstrap.policy, bootstrap.preferences, open]);

  // --- Mutations ---
  const saveProfileMutation = useMutation({
    mutationFn: () =>
      workerApi.updateProfile({
        ...profile,
        targetDirections: directionsInput
          .split(/[,，、|]/)
          .map((s) => s.trim())
          .filter(Boolean),
        methodsSkills: skillsInput
          .split(/[,，、|]/)
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已保存个人结构化科研名片");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const uploadResumeMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return workerApi.uploadResume({
        filename: file.name,
        contentBase64,
        setAsDefault: true,
      });
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(`已上传默认简历：${res.resume.filename}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDefaultResumeMutation = useMutation({
    mutationFn: workerApi.setDefaultResume,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已更新全局默认简历");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteResumeMutation = useMutation({
    mutationFn: workerApi.deleteResume,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已删除简历文件");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const discoverMutation = useMutation({
    mutationFn: () => workerApi.discoverMailAccount(mailForm.email.trim()),
    onSuccess: (res) => {
      const d = res.discovery;
      setDiscovery(d);
      setMailForm((prev) => ({
        ...prev,
        label: prev.label || d.providerLabel,
        smtpHost: d.smtpHost || prev.smtpHost,
        smtpPort: d.smtpPort || prev.smtpPort,
        smtpSecurity: d.smtpSecurity || prev.smtpSecurity,
        imapHost: d.imapHost || prev.imapHost,
        imapPort: d.imapPort || prev.imapPort,
        draftsFolder: d.draftsFolder || prev.draftsFolder,
        note: d.note || prev.note,
      }));
      toast.success(`已探测邮箱托管商：${d.providerLabel}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMailMutation = useMutation({
    mutationFn: () =>
      workerApi.testMailAccount({
        ...mailForm,
        credential: mailForm.credential.replace(/\s+/g, ""),
        autoSaveOnSuccess: true,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      if (res.result.smtpOk && res.result.imapOk) {
        toast.success("SMTP 与 IMAP 双向连通测试通过，已自动加密保存！");
        if (res.account) {
          setEditingAccMeta(res.account);
          setMailForm((p) => ({
            ...p,
            id: res.account!.id,
            credential: "",
            credentialDirty: false,
          }));
        }
      } else {
        toast.warning(
          `SMTP: ${res.result.smtpMsg} | IMAP: ${res.result.imapMsg}`
        );
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMailMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...mailForm,
        credential: mailForm.credential.replace(/\s+/g, ""),
      };
      return mailForm.id
        ? workerApi.updateMailAccount(mailForm.id, payload)
        : workerApi.createMailAccount(payload);
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setEditingAccMeta(res.account);
      setMailForm((p) => ({
        ...p,
        id: res.account.id,
        credential: "",
        credentialDirty: false,
      }));
      toast.success("发件箱配置已保存");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMailMutation = useMutation({
    mutationFn: workerApi.deleteMailAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setEditingAccMeta(null);
      setMailForm(emptyMailForm());
      toast.success("已删除发件箱");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testAiMutation = useMutation({
    mutationFn: () =>
      cloudApi.testAi({
        baseUrl: aiBaseUrl.trim(),
        model: aiModel.trim(),
        apiKey: aiKeyDirty ? aiApiKey.trim() : undefined,
        apiKeyDirty: aiKeyDirty,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setAiApiKey("");
      setAiKeyDirty(false);
      toast.success(res.message);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (clearKey: boolean = false) =>
      workerApi.updateSettings({
        policy: {
          minDelaySec: Number(minDelaySec) || 180,
          maxDelaySec: Number(maxDelaySec) || 420,
          avoidConsecutiveSameDomain: avoidSameDomain,
          maxAttachmentMb: Number(maxAttachmentMb) || 2.5,
        },
        aiConfig: {
          provider: "deepseek",
          baseUrl: aiBaseUrl.trim(),
          model: aiModel.trim(),
          apiKey: aiKeyDirty ? aiApiKey.trim() : undefined,
          apiKeyDirty: aiKeyDirty,
          clearApiKey: clearKey,
        },
        preferences: {
          avatarStyle,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setAiApiKey("");
      setAiKeyDirty(false);
      toast.success("已保存 AI 与防风控发送策略");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function loadAccountIntoForm(acc: MailAccountPublic) {
    setEditingAccMeta(acc);
    setDiscovery(null);
    setMailForm({
      id: acc.id,
      label: acc.label,
      email: acc.email,
      displayName: acc.displayName,
      smtpHost: acc.smtpHost,
      smtpPort: acc.smtpPort,
      smtpSecurity: acc.smtpSecurity,
      imapHost: acc.imapHost,
      imapPort: acc.imapPort,
      draftsFolder: acc.draftsFolder,
      credential: "",
      credentialDirty: false,
      dailyLimit: acc.dailyLimit,
      enabled: acc.enabled,
      note: acc.note,
    });
  }

  function addPublication() {
    const item: PublicationItem = {
      id: crypto.randomUUID(),
      title: "",
      venue: "",
      year: String(new Date().getFullYear()),
      authorOrder: "一作",
      status: "已发表",
    };
    setProfile((p) => ({ ...p, publications: [...p.publications, item] }));
  }

  function addProject() {
    const item: ProjectItem = {
      id: crypto.randomUUID(),
      name: "",
      role: "核心成员",
      period: "",
      summary: "",
    };
    setProfile((p) => ({ ...p, projects: [...p.projects, item] }));
  }

  return (
    <FamilyDrawer
      open={open}
      onOpenChange={setOpen}
      title="工作台设置与个人科研档案"
      description="集中配置申请人结构化科研名片、多邮箱发件通道、DeepSeek AI 网关与后台管理"
      widthClass="w-full max-w-[840px]"
      headerExtra={
        <SegmentedControl<SettingsTabKey>
          size="sm"
          value={settingsTab}
          onChange={(t) => openSettings(t)}
          options={[
            {
              value: "profile",
              label: "名片与简历",
              icon: <User className="w-3.5 h-3.5" />,
            },
            {
              value: "mailbox",
              label: "发件箱",
              icon: <Mail className="w-3.5 h-3.5" />,
              badge: bootstrap.mailAccounts.length,
            },
            {
              value: "ai",
              label: "AI 与策略",
              icon: <Sparkles className="w-3.5 h-3.5" />,
            },
            {
              value: "data",
              label: "数据与后台",
              icon: <Server className="w-3.5 h-3.5" />,
            },
          ]}
        />
      }
    >
      {/* Tab 1: 个人结构化名片 + PDF 简历库 */}
      {settingsTab === "profile" && (
        <div className="space-y-6">
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[#111827]">
                个人科研名片（AI 写信与匹配评估的唯一事实来源）
              </h3>
              <Button
                variant="primary"
                size="sm"
                loading={saveProfileMutation.isPending}
                onClick={() => saveProfileMutation.mutate()}
              >
                保存科研名片
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
              <div>
                <label className="text-slate-500">姓名</label>
                <input
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="例如：张明"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div>
                <label className="text-slate-500">现就读/工作单位</label>
                <input
                  value={profile.affiliation}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, affiliation: e.target.value }))
                  }
                  placeholder="例如：XX 大学计算机学院"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div>
                <label className="text-slate-500">学历与年级专业</label>
                <input
                  value={profile.degreeInfo}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, degreeInfo: e.target.value }))
                  }
                  placeholder="例如：研二在读 · 人工智能"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
              <div>
                <label className="text-slate-500">
                  意向攻读博士方向（顿号或逗号分隔）
                </label>
                <input
                  value={directionsInput}
                  onChange={(e) => setDirectionsInput(e.target.value)}
                  placeholder="大语言模型推理、多模态具身智能"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div>
                <label className="text-slate-500">
                  核心技术栈与研究方法（顿号或逗号分隔）
                </label>
                <input
                  value={skillsInput}
                  onChange={(e) => setSkillsInput(e.target.value)}
                  placeholder="PyTorch、强化学习微调、分布式训练"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
            </div>

            <div className="text-[12px]">
              <label className="text-slate-500">科研概述与自荐重点</label>
              <textarea
                rows={3}
                value={profile.researchSummary}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, researchSummary: e.target.value }))
                }
                placeholder="简述你最自豪的研究工作、核心方法论及希望在博士阶段探索的问题..."
                className="mt-1 w-full p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
              <div>
                <label className="text-slate-500">联系电话</label>
                <input
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, phone: e.target.value }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div>
                <label className="text-slate-500">微信号</label>
                <input
                  value={profile.wechat}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, wechat: e.target.value }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <div>
                <label className="text-slate-500">GitHub / 个人主页</label>
                <input
                  value={profile.homepageUrl}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, homepageUrl: e.target.value }))
                  }
                  placeholder="https://..."
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
            </div>

            {/* 结构化论文条目 */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700">
                  代表性论文 ({profile.publications.length})
                </span>
                <Button
                  variant="glass"
                  size="xs"
                  icon={<Plus className="w-3 h-3" />}
                  onClick={addPublication}
                >
                  添加论文
                </Button>
              </div>
              {profile.publications.map((pub, idx) => (
                <div
                  key={pub.id}
                  className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/75 grid grid-cols-1 md:grid-cols-[1fr_140px_70px_90px_auto] gap-2 items-center text-[12px]"
                >
                  <input
                    value={pub.title}
                    onChange={(e) => {
                      const next = [...profile.publications];
                      next[idx] = { ...pub, title: e.target.value };
                      setProfile((p) => ({ ...p, publications: next }));
                    }}
                    placeholder="论文标题"
                    className="h-7 px-2.5 rounded-lg bg-white border border-slate-200"
                  />
                  <input
                    value={pub.venue}
                    onChange={(e) => {
                      const next = [...profile.publications];
                      next[idx] = { ...pub, venue: e.target.value };
                      setProfile((p) => ({ ...p, publications: next }));
                    }}
                    placeholder="会议/期刊 (如 NeurIPS)"
                    className="h-7 px-2.5 rounded-lg bg-white border border-slate-200"
                  />
                  <input
                    value={pub.year}
                    onChange={(e) => {
                      const next = [...profile.publications];
                      next[idx] = { ...pub, year: e.target.value };
                      setProfile((p) => ({ ...p, publications: next }));
                    }}
                    placeholder="年份"
                    className="h-7 px-2 rounded-lg bg-white border border-slate-200 font-mono"
                  />
                  <input
                    value={pub.authorOrder}
                    onChange={(e) => {
                      const next = [...profile.publications];
                      next[idx] = { ...pub, authorOrder: e.target.value };
                      setProfile((p) => ({ ...p, publications: next }));
                    }}
                    placeholder="作者位次"
                    className="h-7 px-2 rounded-lg bg-white border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setProfile((p) => ({
                        ...p,
                        publications: p.publications.filter(
                          (item) => item.id !== pub.id
                        ),
                      }))
                    }
                    className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* 结构化科研项目 */}
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-slate-700">
                  代表科研项目 ({profile.projects.length})
                </span>
                <Button
                  variant="glass"
                  size="xs"
                  icon={<Plus className="w-3 h-3" />}
                  onClick={addProject}
                >
                  添加项目
                </Button>
              </div>
              {profile.projects.map((proj, idx) => (
                <div
                  key={proj.id}
                  className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200/75 space-y-1.5 text-[12px]"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={proj.name}
                      onChange={(e) => {
                        const next = [...profile.projects];
                        next[idx] = { ...proj, name: e.target.value };
                        setProfile((p) => ({ ...p, projects: next }));
                      }}
                      placeholder="项目名称"
                      className="flex-1 h-7 px-2.5 rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      value={proj.role}
                      onChange={(e) => {
                        const next = [...profile.projects];
                        next[idx] = { ...proj, role: e.target.value };
                        setProfile((p) => ({ ...p, projects: next }));
                      }}
                      placeholder="承担角色"
                      className="w-28 h-7 px-2.5 rounded-lg bg-white border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setProfile((p) => ({
                          ...p,
                          projects: p.projects.filter((i) => i.id !== proj.id),
                        }))
                      }
                      className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={proj.summary}
                    onChange={(e) => {
                      const next = [...profile.projects];
                      next[idx] = { ...proj, summary: e.target.value };
                      setProfile((p) => ({ ...p, projects: next }));
                    }}
                    placeholder="核心研究内容与个人贡献简述"
                    className="w-full h-7 px-2.5 rounded-lg bg-white border border-slate-200"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* PDF 简历库管理 */}
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[#111827]">
                  PDF 个人简历附件库
                </h3>
                <p className="text-[11px] text-slate-500">
                  上传后自动提取文本摘要供 AI 写信参考（建议单份不超过{" "}
                  {bootstrap.policy.maxAttachmentMb} MB）。
                </p>
              </div>
              <div>
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) uploadResumeMutation.mutate(file);
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={uploadResumeMutation.isPending}
                  icon={<Upload className="w-3.5 h-3.5" />}
                  onClick={() => resumeInputRef.current?.click()}
                >
                  上传 PDF 简历
                </Button>
              </div>
            </div>

            {bootstrap.resumes.length === 0 ? (
              <p className="text-[12px] text-slate-400 text-center py-6 border border-dashed border-slate-200 rounded-xl">
                暂未上传 PDF 简历
              </p>
            ) : (
              <div className="space-y-2">
                {bootstrap.resumes.map((r) => (
                  <div
                    key={r.id}
                    className="px-3 py-2.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between gap-3 text-[12px]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#2563EB] shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-[#111827] truncate flex items-center gap-2">
                          <span>{r.filename}</span>
                          {r.isDefault && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-[#2563EB] border border-blue-200">
                              默认附件
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.sizeMb} MB · 提取文本 {r.parsedText.length} 字符
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Eye className="w-3.5 h-3.5" />}
                        onClick={() =>
                          window.open(`/api/resumes/${r.id}/view`, "_blank")
                        }
                      >
                        预览
                      </Button>
                      {!r.isDefault && (
                        <Button
                          variant="glass"
                          size="xs"
                          onClick={() => setDefaultResumeMutation.mutate(r.id)}
                        >
                          设为默认
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="xs"
                        icon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
                        onClick={() => deleteResumeMutation.mutate(r.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Tab 2: 多邮箱发件向导 + MX 自动探测 */}
      {settingsTab === "mailbox" && (
        <div className="space-y-5">
          {/* 已配置发件箱列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-[#111827]">
                已配置的发件箱 ({bootstrap.mailAccounts.length})
              </h3>
              <Button
                variant="glass"
                size="xs"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => {
                  setEditingAccMeta(null);
                  setDiscovery(null);
                  setMailForm(emptyMailForm());
                }}
              >
                新增发件箱
              </Button>
            </div>

            {bootstrap.mailAccounts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {bootstrap.mailAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => loadAccountIntoForm(acc)}
                    className={cn(
                      "p-3 rounded-2xl border cursor-pointer transition-all text-[12px] space-y-1.5",
                      mailForm.id === acc.id
                        ? "bg-white border-[#2563EB]/50 glow-electric-soft"
                        : "bg-white/80 border-slate-200/80 hover:border-slate-300"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#111827] truncate">
                        {acc.label}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        今日 {bootstrap.quotaToday[acc.id] || 0}/{acc.dailyLimit}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-600 truncate">
                      {acc.email}
                    </div>
                    <div className="flex items-center gap-2 text-[10px]">
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-full border",
                          acc.hasCredential
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        )}
                      >
                        {acc.hasCredential ? "授权码已加密存储" : "待填授权码"}
                      </span>
                      {acc.lastTest && (
                        <span className="text-slate-400">
                          SMTP {acc.lastTest.smtpOk ? "✓" : "✕"} · IMAP{" "}
                          {acc.lastTest.imapOk ? "✓" : "✕"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 邮箱编辑 / 自动探测向导 */}
          <div className="tactile-card rounded-2xl p-4 space-y-3.5 text-[12px]">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold text-[#111827]">
                {editingAccMeta
                  ? `编辑发件箱：${editingAccMeta.label}`
                  : "配置新发件箱（支持 DNS MX 智能识别）"}
              </h4>
              {editingAccMeta && (
                <Button
                  variant="danger"
                  size="xs"
                  icon={<Trash2 className="w-3 h-3" />}
                  onClick={() => deleteMailMutation.mutate(editingAccMeta.id)}
                >
                  删除此箱
                </Button>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-slate-500">邮箱地址</label>
                <input
                  type="email"
                  value={mailForm.email}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="yourname@university.edu.cn / @qq.com / @163.com"
                  className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono focus:outline-none focus:border-[#2563EB]/50"
                />
              </div>
              <Button
                variant="glass"
                size="md"
                loading={discoverMutation.isPending}
                icon={<Search className="w-3.5 h-3.5 text-[#2563EB]" />}
                onClick={() => {
                  if (!mailForm.email.trim()) {
                    toast.error("请先输入邮箱地址");
                    return;
                  }
                  discoverMutation.mutate();
                }}
              >
                自动探测服务器
              </Button>
            </div>

            {discovery && (
              <div className="p-3 rounded-xl bg-blue-50/75 border border-blue-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-[#1D4ED8]">
                    已识别托管商：{discovery.providerLabel}
                  </span>
                  {discovery.authGuideUrl && (
                    <Button
                      variant="primary"
                      size="xs"
                      icon={<ExternalLink className="w-3 h-3" />}
                      onClick={() =>
                        window.open(discovery.authGuideUrl, "_blank")
                      }
                    >
                      去网页生成授权码
                    </Button>
                  )}
                </div>
                {discovery.guideSteps.length > 0 && (
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-slate-700">
                    {discovery.guideSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-500">别名标签</label>
                <input
                  value={mailForm.label}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, label: e.target.value }))
                  }
                  placeholder="例如：校内主力邮箱"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="text-slate-500">发件人署名</label>
                <input
                  value={mailForm.displayName}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, displayName: e.target.value }))
                  }
                  placeholder="例如：张明"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="text-slate-500">每日发信安全上限</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={mailForm.dailyLimit}
                  onChange={(e) =>
                    setMailForm((p) => ({
                      ...p,
                      dailyLimit: Number(e.target.value) || 5,
                    }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_90px_110px] gap-3">
              <div>
                <label className="text-slate-500">SMTP 主机</label>
                <input
                  value={mailForm.smtpHost}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, smtpHost: e.target.value }))
                  }
                  placeholder="smtp.qq.com"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">端口</label>
                <input
                  type="number"
                  value={mailForm.smtpPort}
                  onChange={(e) =>
                    setMailForm((p) => ({
                      ...p,
                      smtpPort: Number(e.target.value) || 465,
                    }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">加密方式</label>
                <div className="mt-1">
                  <BaseSelect<"SSL" | "STARTTLS" | "NONE">
                    size="sm"
                    value={mailForm.smtpSecurity}
                    onValueChange={(smtpSecurity) =>
                      setMailForm((p) => ({ ...p, smtpSecurity }))
                    }
                    options={[
                      { value: "SSL", label: "SSL" },
                      { value: "STARTTLS", label: "STARTTLS" },
                      { value: "NONE", label: "无加密" },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_90px_130px] gap-3">
              <div>
                <label className="text-slate-500">IMAP 主机（回信追踪）</label>
                <input
                  value={mailForm.imapHost}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, imapHost: e.target.value }))
                  }
                  placeholder="imap.qq.com"
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">端口</label>
                <input
                  type="number"
                  value={mailForm.imapPort}
                  onChange={(e) =>
                    setMailForm((p) => ({
                      ...p,
                      imapPort: Number(e.target.value) || 993,
                    }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">草稿箱路径</label>
                <input
                  value={mailForm.draftsFolder}
                  onChange={(e) =>
                    setMailForm((p) => ({ ...p, draftsFolder: e.target.value }))
                  }
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-500">
                客户端授权码 / 应用专用密码（加密落盘，留空保留已存密码）
              </label>
              <input
                type="password"
                value={mailForm.credential}
                onChange={(e) =>
                  setMailForm((p) => ({
                    ...p,
                    credential: e.target.value,
                    credentialDirty: true,
                  }))
                }
                placeholder={
                  editingAccMeta?.hasCredential
                    ? "••••••••••••（已加密保存，仅更换时重新输入）"
                    : "粘贴 16 位授权码（自动去除空格）"
                }
                className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono"
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
              <BaseSwitch
                checked={mailForm.enabled}
                label="启用该发件箱参与自动分配"
                onCheckedChange={(enabled) =>
                  setMailForm((p) => ({ ...p, enabled }))
                }
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={saveMailMutation.isPending}
                  onClick={() => saveMailMutation.mutate()}
                >
                  仅保存配置
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={testMailMutation.isPending}
                  icon={<CheckCircle2 className="w-3.5 h-3.5" />}
                  onClick={() => testMailMutation.mutate()}
                >
                  双向连通测试并保存
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: AI 网关、防风控策略与头像外观 */}
      {settingsTab === "ai" && (
        <div className="space-y-5 text-[12px]">
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[#111827]">
                  AI 模型网关（默认 DeepSeek）
                </h3>
                <p className="text-[11px] text-slate-500">
                  所有提示词优化与 AI 调用统一收敛在 cloud-core 服务端，API Key 使用 AES-GCM 本地加密保存。
                </p>
              </div>
              {bootstrap.aiConfig.hasApiKey && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium">
                  已保存 Key ({bootstrap.aiConfig.apiKeyLen} 字符)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-slate-500">API Base URL</label>
                <input
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">模型 ID</label>
                <input
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-500">API Key</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => {
                  setAiApiKey(e.target.value);
                  setAiKeyDirty(true);
                }}
                placeholder={
                  bootstrap.aiConfig.hasApiKey
                    ? "••••••••••••（留空继续使用已加密保存的密钥）"
                    : "sk-..."
                }
                className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {bootstrap.aiConfig.hasApiKey ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => saveSettingsMutation.mutate(true)}
                >
                  清除已存 API Key
                </Button>
              ) : (
                <span />
              )}
              <Button
                variant="glass"
                size="sm"
                loading={testAiMutation.isPending}
                icon={<RefreshCw className="w-3.5 h-3.5 text-[#2563EB]" />}
                onClick={() => testAiMutation.mutate()}
              >
                测试 AI 连通并保存 Key
              </Button>
            </div>
          </section>

          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <h3 className="text-[14px] font-semibold text-[#111827]">
              批量发件防风控与界面外观
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-slate-500">最小发送间隔（秒）</label>
                <input
                  type="number"
                  min={5}
                  value={minDelaySec}
                  onChange={(e) => setMinDelaySec(Number(e.target.value))}
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">最大发送间隔（秒）</label>
                <input
                  type="number"
                  min={5}
                  value={maxDelaySec}
                  onChange={(e) => setMaxDelaySec(Number(e.target.value))}
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
              <div>
                <label className="text-slate-500">简历附件上限（MB）</label>
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={maxAttachmentMb}
                  onChange={(e) => setMaxAttachmentMb(Number(e.target.value))}
                  className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <BaseSwitch
                checked={avoidSameDomain}
                label="同高校域名错峰交错排期（避免连续投递同一高校网关）"
                onCheckedChange={setAvoidSameDomain}
              />

              <div className="flex items-center gap-2">
                <span className="text-slate-500">导师头像风格</span>
                <BaseSelect<"facehash" | "initials">
                  size="xs"
                  value={avatarStyle}
                  onValueChange={setAvatarStyle}
                  options={[
                    { value: "facehash", label: "拟态几何小伙伴" },
                    { value: "initials", label: "极简首字母徽章" },
                  ]}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="sm"
                loading={saveSettingsMutation.isPending}
                onClick={() => saveSettingsMutation.mutate(false)}
              >
                保存策略与偏好
              </Button>
            </div>
          </section>
        </div>
      )}

      {/* Tab 4: 数据迁移与管理员后台入口 */}
      {settingsTab === "data" && (
        <div className="space-y-4 text-[12px]">
          <section className="tactile-card rounded-2xl p-4 space-y-3">
            <h3 className="text-[14px] font-semibold text-[#111827]">
              轻量 CSV / JSON 数据备份与迁移
            </h3>
            <p className="text-slate-500 leading-relaxed">
              V2 已放弃易冲突的实时 Excel 绑定，所有导师数据与通信状态均可靠落库。随时可导出标准 CSV 表格或全量 JSON 快照。
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Button
                variant="secondary"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5" />}
                onClick={() => {
                  setOpen(false);
                  setCsvImportOpen(true);
                }}
              >
                从 CSV 批量导入导师
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" />}
                onClick={() => window.open("/api/data/export/csv", "_blank")}
              >
                导出 Excel 兼容 CSV
              </Button>
              <Button
                variant="glass"
                size="sm"
                icon={<FileJson className="w-3.5 h-3.5" />}
                onClick={() => window.open("/api/data/export/json", "_blank")}
              >
                下载全量 JSON 备份
              </Button>
            </div>
          </section>

          {/* 管理员专属 Prompt 控制台低调入口 */}
          <section className="rounded-2xl p-4 bg-slate-100/75 border border-slate-200/90 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-[#111827]">
                <ShieldCheck className="w-4 h-4 text-slate-600" />
                <span>管理员 Prompt 调优控制台</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-200/80 text-[10px] font-medium text-slate-600">
                  <Lock className="w-2.5 h-2.5" />
                  仅管理员令牌访问
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                集中调优 AI Copilot、网页提取与匹配评估的系统提示词、温度及版本回滚（普通客户端不可见底层 Prompt）。
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              icon={<KeyRound className="w-3.5 h-3.5" />}
              onClick={() => {
                setOpen(false);
                setAdminPromptOpen(true);
              }}
            >
              进入管理台
            </Button>
          </section>
        </div>
      )}
    </FamilyDrawer>
  );
}
