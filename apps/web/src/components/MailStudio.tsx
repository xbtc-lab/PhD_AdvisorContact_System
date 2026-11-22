import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  Check,
  ExternalLink,
  Eye,
  FileText,
  FlaskConical,
  History,
  Paperclip,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  ADVISOR_STAGE_OPTIONS,
  MATCH_TIER_OPTIONS,
  type Advisor,
  type AdvisorStage,
  type BootstrapData,
  type MatchTier,
} from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import { cn, fileToBase64, formatShortTime } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "./ui/AdvisorAvatar.js";
import { ConfirmDialog } from "./ui/BaseDialog.js";
import { BasePopover } from "./ui/BasePopover.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { BaseTooltip } from "./ui/BaseTooltip.js";
import { EmptyDeskIllustration } from "./ui/BrandMascot.js";
import { Button } from "./ui/Button.js";
import { SlidingNumber } from "./ui/SlidingNumber.js";

export interface MailStudioProps {
  bootstrap: BootstrapData;
  advisor: Advisor | null;
}

/**
 * 中央套磁撰写与单发工坊：
 * 支持自动防抖保存、历史版本快照回滚、模板生成、快捷 AI 调度、PDF 附件直连预览与单封实发。
 */
export function MailStudio({ bootstrap, advisor }: MailStudioProps) {
  const queryClient = useQueryClient();
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const replyQuote = useAppStore((s) => s.replyQuote);
  const setReplyQuote = useAppStore((s) => s.setReplyQuote);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const setSelfTestOpen = useAppStore((s) => s.setSelfTestOpen);
  const openSettings = useAppStore((s) => s.openSettings);
  const triggerCelebration = useAppStore((s) => s.triggerCelebration);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hookDraft, setHookDraft] = useState("");
  const [resumeChoice, setResumeChoice] = useState<string>("default");
  const [accountChoice, setAccountChoice] = useState<string>("auto");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  // 记录前端已知的服务端 Draft 更新时间戳，避免防抖自动保存覆写当前光标状态
  const knownUpdatedAtRef = useRef<string>("");
  const currentAdvisorIdRef = useRef<string>("");
  const debounceTimerRef = useRef<number | null>(null);

  const draftQuery = useQuery({
    queryKey: ["draft", advisor?.id],
    queryFn: () => workerApi.getDraft(advisor!.id),
    enabled: Boolean(advisor?.id),
  });

  // 拉取最新回信用于配合快捷 AI（例如回复跟进）
  const threadQuery = useQuery({
    queryKey: ["thread", advisor?.id],
    queryFn: () => workerApi.getMailThread(advisor!.id, false),
    enabled: Boolean(advisor?.id),
  });

  useEffect(() => {
    if (!advisor) return;
    if (currentAdvisorIdRef.current !== advisor.id) {
      currentAdvisorIdRef.current = advisor.id;
      knownUpdatedAtRef.current = "";
      setHookDraft(advisor.hookNote || "");
      setSaveState("idle");
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    } else {
      setHookDraft(advisor.hookNote || "");
    }
  }, [advisor]);

  useEffect(() => {
    const data = draftQuery.data;
    if (!data || !advisor || data.draft.advisorId !== advisor.id) return;
    if (knownUpdatedAtRef.current !== data.draft.updatedAt) {
      knownUpdatedAtRef.current = data.draft.updatedAt;
      setSubject(data.draft.subject);
      setBody(data.draft.body);
      setAccountChoice(
        data.draft.preferredAccountId || advisor.assignedAccountId || "auto"
      );
      if (data.draft.resumeId === "__none__") {
        setResumeChoice("none");
      } else if (data.draft.resumeId) {
        setResumeChoice(data.draft.resumeId);
      } else {
        setResumeChoice("default");
      }
    }
  }, [draftQuery.data, advisor]);

  const saveDraftMutation = useMutation({
    mutationFn: (vars: {
      advisorId: string;
      subject: string;
      body: string;
      resumeId?: string | null;
      preferredAccountId?: string;
      createRevision?: boolean;
      revisionSource?: "manual" | "template" | "ai" | "restore";
      revisionNote?: string;
    }) =>
      workerApi.saveDraft(vars.advisorId, {
        subject: vars.subject,
        body: vars.body,
        resumeId: vars.resumeId,
        preferredAccountId: vars.preferredAccountId,
        createRevision: Boolean(vars.createRevision),
        revisionSource: vars.revisionSource || "manual",
        revisionNote: vars.revisionNote || "",
      }),
    onMutate: () => setSaveState("saving"),
    onSuccess: (res, vars) => {
      knownUpdatedAtRef.current = res.draft.updatedAt;
      queryClient.setQueryData(["draft", vars.advisorId], res);
      setSaveState("saved");
      if (vars.createRevision) {
        toast.success("已创建草稿版本快照");
      }
    },
    onError: (err: Error) => {
      setSaveState("idle");
      toast.error(err.message);
    },
  });

  function resolveResumeParam(choice: string): string | null {
    if (choice === "none") return "__none__";
    if (choice === "default") return null;
    return choice;
  }

  function scheduleAutoSave(
    nextSubject: string,
    nextBody: string,
    nextResume = resumeChoice,
    nextAcc = accountChoice
  ) {
    if (!advisor) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    setSaveState("saving");
    const targetId = advisor.id;
    debounceTimerRef.current = window.setTimeout(() => {
      saveDraftMutation.mutate({
        advisorId: targetId,
        subject: nextSubject,
        body: nextBody,
        resumeId: resolveResumeParam(nextResume),
        preferredAccountId: nextAcc,
        createRevision: false,
      });
    }, 1050);
  }

  async function flushDraftBeforeAction() {
    if (!advisor) return;
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const res = await saveDraftMutation.mutateAsync({
      advisorId: advisor.id,
      subject,
      body,
      resumeId: resolveResumeParam(resumeChoice),
      preferredAccountId: accountChoice,
      createRevision: false,
    });
    return res;
  }

  // Ctrl/Cmd + S 快速创建版本快照
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (!advisor) return;
        e.preventDefault();
        if (debounceTimerRef.current) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        saveDraftMutation.mutate({
          advisorId: advisor.id,
          subject,
          body,
          resumeId: resolveResumeParam(resumeChoice),
          preferredAccountId: accountChoice,
          createRevision: true,
          revisionSource: "manual",
          revisionNote: "快捷键手动快照",
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [advisor, subject, body, resumeChoice, accountChoice, saveDraftMutation]);

  const patchAdvisorMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      workerApi.updateAdvisor(advisor!.id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const generateTemplateMutation = useMutation({
    mutationFn: () => workerApi.generateTemplateDraft(advisor!.id, hookDraft),
    onSuccess: async (res) => {
      setSubject(res.subject);
      setBody(res.body);
      await saveDraftMutation.mutateAsync({
        advisorId: advisor!.id,
        subject: res.subject,
        body: res.body,
        resumeId: resolveResumeParam(resumeChoice),
        preferredAccountId: accountChoice,
        createRevision: true,
        revisionSource: "template",
        revisionNote: "学术模板生成前备份",
      });
      toast.success("已套用本地结构化模板生成初稿");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const restoreRevisionMutation = useMutation({
    mutationFn: (revId: string) =>
      workerApi.restoreDraftRevision(advisor!.id, revId),
    onSuccess: (res) => {
      knownUpdatedAtRef.current = "";
      queryClient.setQueryData(["draft", advisor!.id], res);
      toast.success("已恢复所选历史版本");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const quickAiMutation = useMutation({
    mutationFn: (mode: "polish" | "shorten" | "translate_en") => {
      const latestInbound = [...(threadQuery.data?.messages || [])]
        .reverse()
        .find((m) => m.direction === "inbound");
      return cloudApi.chat({
        advisorId: advisor!.id,
        actionMode: mode,
        userMessage: "",
        currentSubject: subject,
        currentBody: body,
        currentHook: hookDraft,
        latestReply: latestInbound?.body || "",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["conversations", advisor!.id],
      });
      setRightTab("copilot");
      toast.success("AI 建议已生成在右侧「AI 副驾驶」，可预览并一键填入");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveImapDraftMutation = useMutation({
    mutationFn: async () => {
      if (!advisor) throw new Error("请先选择导师");
      if (!advisor.email.trim()) throw new Error("请先填写该导师的邮箱地址");
      if (!subject.trim()) throw new Error("请填写邮件主题");
      await flushDraftBeforeAction();
      return workerApi.saveMailDraftBox({
        toEmail: advisor.email.trim(),
        subject: subject.trim(),
        body,
        accountId: accountChoice,
        resumeId: resolveResumeParam(resumeChoice),
      });
    },
    onSuccess: (res) => {
      toast.success(
        `已写入 ${res.accountLabel || "发件箱"} 的 IMAP 草稿箱，可在邮箱客户端直接复核`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendSingleMutation = useMutation({
    mutationFn: async () => {
      if (!advisor) throw new Error("请先选择导师");
      if (!advisor.email.trim()) throw new Error("请先填写该导师的邮箱地址");
      if (!subject.trim() || !body.trim()) {
        throw new Error("邮件主题和正文均不能为空");
      }
      await flushDraftBeforeAction();
      return workerApi.sendSingleMail({
        advisorId: advisor.id,
        toEmail: advisor.email.trim(),
        subject: subject.trim(),
        body,
        accountId: accountChoice,
        inReplyTo: replyQuote?.inReplyTo || "",
        references: replyQuote?.references || "",
        includeAttachment: resumeChoice !== "none",
        resumeId:
          resumeChoice === "none" || resumeChoice === "default"
            ? undefined
            : resumeChoice,
        autoAddContact: false,
      });
    },
    onSuccess: async () => {
      setConfirmSendOpen(false);
      setReplyQuote(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["thread", advisor!.id] }),
      ]);
      triggerCelebration(`已成功发出致 ${advisor!.name} 导师的邮件`);
    },
    onError: (err: Error) => {
      setConfirmSendOpen(false);
      toast.error(err.message);
    },
  });

  const uploadPdfMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await fileToBase64(file);
      return workerApi.uploadResume({
        filename: file.name,
        contentBase64,
        setAsDefault: bootstrap.resumes.length === 0,
        advisorId: advisor?.id,
      });
    },
    onSuccess: async (res) => {
      setResumeChoice(res.resume.id);
      knownUpdatedAtRef.current = "";
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["draft", advisor?.id] }),
      ]);
      toast.success(`已上传并绑定附件：${res.resume.filename}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activeResume = useMemo(() => {
    if (resumeChoice === "none") return null;
    if (resumeChoice === "default") {
      return (
        bootstrap.resumes.find(
          (r) => r.id === bootstrap.preferences.defaultResumeId
        ) ||
        bootstrap.resumes.find((r) => r.isDefault) ||
        bootstrap.resumes[0] ||
        null
      );
    }
    return bootstrap.resumes.find((r) => r.id === resumeChoice) || null;
  }, [
    resumeChoice,
    bootstrap.resumes,
    bootstrap.preferences.defaultResumeId,
  ]);

  const resumeOptions = useMemo(() => {
    const def =
      bootstrap.resumes.find(
        (r) => r.id === bootstrap.preferences.defaultResumeId
      ) ||
      bootstrap.resumes.find((r) => r.isDefault) ||
      bootstrap.resumes[0];
    return [
      {
        value: "default",
        label: def
          ? `随全局默认 (${def.filename} · ${def.sizeMb}MB)`
          : "随全局默认 (未上传 PDF)",
      },
      ...bootstrap.resumes.map((r) => ({
        value: r.id,
        label: `${r.filename} (${r.sizeMb} MB)`,
      })),
      { value: "none", label: "本次不携带 PDF 附件" },
    ];
  }, [bootstrap.resumes, bootstrap.preferences.defaultResumeId]);

  const accountOptions = useMemo(() => {
    return [
      { value: "auto", label: "自动分配最优余量发件箱" },
      ...bootstrap.mailAccounts.map((acc) => {
        const used = bootstrap.quotaToday[acc.id] || 0;
        return {
          value: acc.id,
          label: `${acc.label} (${used}/${acc.dailyLimit})`,
        };
      }),
    ];
  }, [bootstrap.mailAccounts, bootstrap.quotaToday]);

  if (!advisor) {
    return (
      <main className="flex-1 min-w-0 h-full flex items-center justify-center p-6">
        <EmptyDeskIllustration
          title="从左侧选择一位导师开始撰写"
          subtitle="系统已为你预置结构化套磁模板、防篡改本地发送策略以及一对一 AI 科研顾问。"
        />
      </main>
    );
  }

  const charCount = body.replace(/\s+/g, "").length;
  const revisions = draftQuery.data?.revisions || [];

  return (
    <main className="flex-1 min-w-0 h-full flex flex-col p-3.5 gap-3 overflow-hidden">
      {/* 顶部导师头卡 */}
      <div className="tactile-card rounded-2xl p-3.5 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <AdvisorAvatar
              name={advisor.name}
              seed={advisor.avatarSeed}
              styleMode={bootstrap.preferences.avatarStyle}
              size={44}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-bold text-[#111827] truncate">
                  {advisor.name}
                </h2>
                {advisor.homepageUrl && (
                  <a
                    href={advisor.homepageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-blue-50 text-[11px] text-slate-600 hover:text-[#2563EB] transition-colors"
                  >
                    <span>主页</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {!advisor.email && (
                  <button
                    type="button"
                    onClick={() => setRightTab("profile")}
                    className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium cursor-pointer"
                  >
                    缺少邮箱 · 点击补充
                  </button>
                )}
              </div>
              <p className="text-[12px] text-slate-500 truncate mt-0.5">
                {advisor.institutionName}
                {advisor.dept ? ` · ${advisor.dept}` : ""}
                {advisor.title ? ` · ${advisor.title}` : ""}
                {advisor.email ? ` · ${advisor.email}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <BaseSelect<MatchTier>
              size="xs"
              value={advisor.matchTier}
              options={MATCH_TIER_OPTIONS.map((m) => ({
                value: m.value,
                label: m.short,
              }))}
              onValueChange={(matchTier) =>
                patchAdvisorMutation.mutate({ matchTier })
              }
            />
            <BaseSelect<AdvisorStage>
              size="xs"
              value={advisor.stage}
              options={ADVISOR_STAGE_OPTIONS}
              onValueChange={(stage) => patchAdvisorMutation.mutate({ stage })}
            />
            <BaseSwitch
              checked={advisor.inBatch}
              label="加入群发"
              onCheckedChange={(inBatch) =>
                patchAdvisorMutation.mutate({ inBatch })
              }
            />
          </div>
        </div>

        {/* 契合切入点速记 */}
        <div className="flex items-center gap-2 bg-slate-50/90 border border-slate-200/75 rounded-xl px-3 py-1.5">
          <span className="text-[11px] font-semibold text-[#2563EB] shrink-0">
            契合切入点 Hook
          </span>
          <input
            type="text"
            value={hookDraft}
            onChange={(e) => setHookDraft(e.target.value)}
            onBlur={() => {
              if (hookDraft !== advisor.hookNote) {
                patchAdvisorMutation.mutate({ hookNote: hookDraft });
              }
            }}
            placeholder="记录导师哪篇代表作/项目方向与你的研究方法最契合，生成套磁信时会自动融入..."
            className="flex-1 bg-transparent text-[12px] text-[#111827] placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </div>

      {/* 中部邮件编辑区 */}
      <div className="flex-1 min-h-0 tactile-card rounded-2xl flex flex-col overflow-hidden">
        {/* 工具栏与 AI 快捷栏 */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/55 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="glass"
              size="xs"
              loading={generateTemplateMutation.isPending}
              icon={<Wand2 className="w-3.5 h-3.5 text-[#2563EB]" />}
              onClick={() => generateTemplateMutation.mutate()}
            >
              套磁模板生成
            </Button>

            <Button
              variant="secondary"
              size="xs"
              loading={quickAiMutation.isPending}
              icon={<Sparkles className="w-3 h-3 text-[#2563EB]" />}
              onClick={() => quickAiMutation.mutate("polish")}
            >
              AI 润色
            </Button>
            <Button
              variant="ghost"
              size="xs"
              loading={quickAiMutation.isPending}
              onClick={() => quickAiMutation.mutate("shorten")}
            >
              精简400字
            </Button>
            <Button
              variant="ghost"
              size="xs"
              loading={quickAiMutation.isPending}
              onClick={() => quickAiMutation.mutate("translate_en")}
            >
              转英文
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              {saveState === "saving" && "保存中..."}
              {saveState === "saved" && (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600">已自动保存</span>
                </>
              )}
            </span>

            <span className="text-[11px] text-slate-500 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200/75">
              正文 <SlidingNumber value={charCount} className="text-[#111827] font-semibold" /> 字
            </span>

            <BaseTooltip content="手动保存一份历史快照（快捷键 ⌘S / Ctrl+S）">
              <Button
                variant="ghost"
                size="xs"
                icon={<BookmarkPlus className="w-3.5 h-3.5" />}
                onClick={() =>
                  saveDraftMutation.mutate({
                    advisorId: advisor.id,
                    subject,
                    body,
                    resumeId: resolveResumeParam(resumeChoice),
                    preferredAccountId: accountChoice,
                    createRevision: true,
                    revisionSource: "manual",
                    revisionNote: "手动创建草稿快照",
                  })
                }
              >
                快照
              </Button>
            </BaseTooltip>

            <BasePopover
              align="end"
              className="w-80"
              trigger={
                <Button
                  variant="ghost"
                  size="xs"
                  icon={<History className="w-3.5 h-3.5" />}
                >
                  历史 ({revisions.length})
                </Button>
              }
            >
              <div className="space-y-2">
                <div className="text-[12px] font-semibold text-[#111827]">
                  最近草稿修订快照
                </div>
                {revisions.length === 0 ? (
                  <p className="text-[11px] text-slate-400 py-3 text-center">
                    暂无历史快照，点击「快照」或应用 AI 版本后将自动归档。
                  </p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-1.5">
                    {revisions.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-2 rounded-xl border border-slate-200/80 bg-slate-50/70 space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-medium text-slate-700">
                            {rev.note || rev.source}
                          </span>
                          <span className="text-slate-400 font-mono">
                            {formatShortTime(rev.createdAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">
                          {rev.subject || rev.body || "（空白草稿）"}
                        </p>
                        <div className="flex justify-end">
                          <Button
                            variant="glass"
                            size="xs"
                            icon={<RotateCcw className="w-3 h-3" />}
                            onClick={() => restoreRevisionMutation.mutate(rev.id)}
                          >
                            恢复此版本
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </BasePopover>
          </div>
        </div>

        {/* 回复线索引用提示条 */}
        {replyQuote && (
          <div className="px-4 py-2 bg-blue-50/85 border-b border-blue-200/70 flex items-center justify-between gap-2 text-[12px] text-[#1D4ED8] shrink-0">
            <span className="truncate">
              正在回复往来线程：<strong>{replyQuote.subjectHint}</strong>
              （将自动附带邮件 In-Reply-To 引用头）
            </span>
            <button
              type="button"
              onClick={() => setReplyQuote(null)}
              className="p-1 rounded-lg hover:bg-blue-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 邮件主题输入框 */}
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <span className="text-[12px] font-medium text-slate-400 shrink-0">
            邮件主题
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => {
              const v = e.target.value;
              setSubject(v);
              scheduleAutoSave(v, body);
            }}
            placeholder="例如：博士研究生申请自荐 — 申请人姓名（来自毕业院校）"
            className="flex-1 text-[14px] font-semibold text-[#111827] placeholder:text-slate-300 focus:outline-none bg-transparent"
          />
        </div>

        {/* 邮件正文区 */}
        <textarea
          value={body}
          onChange={(e) => {
            const v = e.target.value;
            setBody(v);
            scheduleAutoSave(subject, v);
          }}
          placeholder="点击上方「套磁模板生成」快速生成结构化初稿，或唤起右侧「AI 副驾驶」联合打磨内容..."
          className="flex-1 w-full p-4 text-[13.5px] leading-[1.78] text-[#111827] placeholder:text-slate-300 resize-none focus:outline-none bg-transparent"
        />

        {/* 简历 PDF 附件条 */}
        <div className="px-4 py-2 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
              <Paperclip className="w-3.5 h-3.5" />
              随信附件
            </span>
            <BaseSelect
              size="xs"
              value={resumeChoice}
              options={resumeOptions}
              onValueChange={(next) => {
                setResumeChoice(next);
                scheduleAutoSave(subject, body, next, accountChoice);
              }}
            />
            {activeResume && (
              <Button
                variant="ghost"
                size="xs"
                icon={<Eye className="w-3.5 h-3.5" />}
                onClick={() =>
                  window.open(`/api/resumes/${activeResume.id}/view`, "_blank")
                }
              >
                预览 PDF
              </Button>
            )}
          </div>

          <div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) uploadPdfMutation.mutate(file);
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              loading={uploadPdfMutation.isPending}
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => pdfInputRef.current?.click()}
            >
              上传专用 PDF
            </Button>
          </div>
        </div>

        {/* 底部发件操控 Dock */}
        <div className="px-4 py-3 bg-white/95 border-t border-slate-200/75 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">发件箱</span>
            <BaseSelect
              size="sm"
              value={accountChoice}
              options={accountOptions}
              onValueChange={(next) => {
                setAccountChoice(next);
                scheduleAutoSave(subject, body, resumeChoice, next);
              }}
            />
            {bootstrap.mailAccounts.length === 0 && (
              <button
                type="button"
                onClick={() => openSettings("mailbox")}
                className="text-[11px] text-[#2563EB] hover:underline cursor-pointer"
              >
                去添加发件箱
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<FlaskConical className="w-3.5 h-3.5" />}
              onClick={async () => {
                await flushDraftBeforeAction();
                setSelfTestOpen(true);
              }}
            >
              测发给自己
            </Button>

            <Button
              variant="secondary"
              size="sm"
              loading={saveImapDraftMutation.isPending}
              icon={<Save className="w-3.5 h-3.5" />}
              onClick={() => saveImapDraftMutation.mutate()}
            >
              存邮箱草稿箱
            </Button>

            <Button
              variant="primary"
              size="sm"
              loading={sendSingleMutation.isPending}
              icon={<Send className="w-3.5 h-3.5" />}
              onClick={() => {
                if (!advisor.email.trim()) {
                  toast.error("请先在右侧档案中补充导师联系邮箱");
                  setRightTab("profile");
                  return;
                }
                if (!subject.trim() || !body.trim()) {
                  toast.error("邮件主题和正文均不能为空");
                  return;
                }
                setConfirmSendOpen(true);
              }}
            >
              立即发送
            </Button>
          </div>
        </div>
      </div>

      {/* 发送前二次确认弹窗 */}
      <ConfirmDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title={`确认向 ${advisor.name} 导师发出邮件？`}
        description={`收件人：${advisor.email || "未填写"}。附件：${
          activeResume ? `${activeResume.filename} (${activeResume.sizeMb} MB)` : "无附件"
        }。发送成功后将自动推进导师状态为「已发送」并记入往来记录。`}
        confirmLabel="确认立即发出"
        loading={sendSingleMutation.isPending}
        onConfirm={() => sendSingleMutation.mutate()}
      />
    </main>
  );
}
