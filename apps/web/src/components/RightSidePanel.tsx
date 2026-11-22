import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Eraser,
  Mail,
  MessageSquareText,
  Reply,
  Send,
  Sparkles,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type {
  Advisor,
  AiActionMode,
  AiChatMessageRecord,
  BootstrapData,
  MailMessage,
} from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import {
  MATCH_TIER_STYLES,
  REPLY_INTENT_BADGES,
  cn,
  formatShortTime,
} from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ConfirmDialog } from "./ui/BaseDialog.js";
import { PigeonThinking } from "./ui/BrandMascot.js";
import { Button } from "./ui/Button.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { SpotlightCard } from "./ui/SpotlightCard.js";

export interface RightSidePanelProps {
  bootstrap: BootstrapData;
  advisor: Advisor | null;
}

const COPILOT_SHORTCUTS: ReadonlyArray<{ mode: AiActionMode; label: string }> = [
  { mode: "generate", label: "起草套磁首信" },
  { mode: "polish", label: "学术润色" },
  { mode: "shorten", label: "精简400字" },
  { mode: "translate_en", label: "英文改写" },
  { mode: "hooks", label: "提炼3条契合点" },
  { mode: "reply_followup", label: "拟回复跟进" },
];

/**
 * 右侧三维协同面板：AI 一对一副驾驶 + 导师档案/深度匹配分析 + 邮件往来线索时间轴。
 */
export function RightSidePanel({ bootstrap, advisor }: RightSidePanelProps) {
  const queryClient = useQueryClient();

  const rightTab = useAppStore((s) => s.rightTab);
  const setRightTab = useAppStore((s) => s.setRightTab);
  const openSettings = useAppStore((s) => s.openSettings);
  const setReplyQuote = useAppStore((s) => s.setReplyQuote);

  const [chatInput, setChatInput] = useState("");
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [confirmDeleteAdv, setConfirmDeleteAdv] = useState(false);

  // 导师档案表单状态
  const [emailInput, setEmailInput] = useState("");
  const [homepageInput, setHomepageInput] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [researchInput, setResearchInput] = useState("");
  const [userNotesInput, setUserNotesInput] = useState("");
  const [replyNoteInput, setReplyNoteInput] = useState("");

  useEffect(() => {
    if (!advisor) return;
    setEmailInput(advisor.email || "");
    setHomepageInput(advisor.homepageUrl || "");
    setTagsInput((advisor.researchTags || []).join(", "));
    setResearchInput(advisor.researchSummary || "");
    setUserNotesInput(advisor.userNotes || "");
    setReplyNoteInput(advisor.replyNote || "");
  }, [advisor]);

  const draftQuery = useQuery({
    queryKey: ["draft", advisor?.id],
    queryFn: () => workerApi.getDraft(advisor!.id),
    enabled: Boolean(advisor?.id),
  });

  const convQuery = useQuery({
    queryKey: ["conversations", advisor?.id],
    queryFn: () => cloudApi.getConversations(advisor!.id),
    enabled: Boolean(advisor?.id),
  });

  const threadQuery = useQuery({
    queryKey: ["thread", advisor?.id],
    queryFn: () =>
      workerApi.getMailThread(advisor!.id, rightTab === "thread"),
    enabled: Boolean(advisor?.id),
  });

  // 打开「往来回信」标签页时刷新并自动消未读
  useEffect(() => {
    if (advisor && rightTab === "thread") {
      workerApi
        .getMailThread(advisor.id, true)
        .then((res) => {
          queryClient.setQueryData(["thread", advisor.id], res);
          queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
        })
        .catch(() => {});
    }
  }, [advisor?.id, rightTab, queryClient]);

  const unreadForAdvisor = advisor
    ? bootstrap.unreadReplies.filter((u) => u.advisorId === advisor.id).length
    : 0;

  const chatMutation = useMutation({
    mutationFn: ({
      actionMode,
      userMessage,
    }: {
      actionMode: AiActionMode;
      userMessage: string;
    }) => {
      const latestInbound = [...(threadQuery.data?.messages || [])]
        .reverse()
        .find((m) => m.direction === "inbound");
      return cloudApi.chat({
        advisorId: advisor!.id,
        actionMode,
        userMessage,
        currentSubject: draftQuery.data?.draft.subject || "",
        currentBody: draftQuery.data?.draft.body || "",
        currentHook: advisor!.hookNote || "",
        latestReply: latestInbound?.body || "",
      });
    },
    onSuccess: async () => {
      setChatInput("");
      await queryClient.invalidateQueries({
        queryKey: ["conversations", advisor!.id],
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async (msg: AiChatMessageRecord) => {
      const curr = draftQuery.data?.draft;
      const nextSubject = msg.suggestedSubject.trim() || curr?.subject || "";
      const nextBody = msg.suggestedBody.trim() || curr?.body || "";
      const saved = await workerApi.saveDraft(advisor!.id, {
        subject: nextSubject,
        body: nextBody,
        selectedHook: msg.suggestedHook.trim() || curr?.selectedHook || "",
        createRevision: true,
        revisionSource: "ai",
        revisionNote: "一键应用 AI 副驾驶建议",
      });
      if (msg.suggestedHook.trim()) {
        await workerApi.updateAdvisor(advisor!.id, {
          hookNote: msg.suggestedHook.trim(),
        });
      }
      return saved;
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(["draft", advisor!.id], saved);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已将 AI 建议填入左侧邮件编辑器并保留旧版快照");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const clearChatMutation = useMutation({
    mutationFn: () => cloudApi.clearConversations(advisor!.id),
    onSuccess: async () => {
      setConfirmClearChat(false);
      await queryClient.invalidateQueries({
        queryKey: ["conversations", advisor!.id],
      });
      toast.success("已清空本导师对话记录");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const analyzeMutation = useMutation({
    mutationFn: () => cloudApi.analyzeAdvisor(advisor!.id),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(`匹配度评估完成：${res.matchScore} 分`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveProfileMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      workerApi.updateAdvisor(advisor!.id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已保存导师档案更新");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAdvisorMutation = useMutation({
    mutationFn: () => workerApi.deleteAdvisor(advisor!.id),
    onSuccess: async () => {
      setConfirmDeleteAdv(false);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已移除该导师记录");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleQuoteReply(msg: MailMessage) {
    if (!advisor) return;
    const rawSubj = msg.subject || draftQuery.data?.draft.subject || "";
    const nextSubject = /^re\s*:/i.test(rawSubj)
      ? rawSubj
      : `Re: ${rawSubj || "博士研究生申请咨询"}`;
    setReplyQuote({
      inReplyTo: msg.messageId || "",
      references: msg.messageId || "",
      subjectHint: msg.subject || nextSubject,
    });
    const currBody = draftQuery.data?.draft.body || "";
    workerApi
      .saveDraft(advisor.id, {
        subject: nextSubject,
        body: currBody,
        createRevision: false,
      })
      .then((res) => {
        queryClient.setQueryData(["draft", advisor.id], res);
        toast.info("已在左侧绑定回复引用主题，撰写回复后点「立即发送」即可");
      })
      .catch(() => {});
  }

  if (!advisor) {
    return (
      <aside className="w-[340px] xl:w-[375px] shrink-0 h-full border-l border-slate-200/75 bg-white/65 backdrop-blur-xl p-6 flex items-center justify-center text-center">
        <div className="space-y-2 max-w-[240px]">
          <Bot className="w-8 h-8 text-[#2563EB]/60 mx-auto" />
          <p className="text-[13px] font-medium text-slate-600">
            AI 副驾驶与导师洞察
          </p>
          <p className="text-[11px] text-slate-400">
            选中任意导师后，可在这里唤起一对一写作协作、匹配评估或查看往来邮件线索。
          </p>
        </div>
      </aside>
    );
  }

  const messages = convQuery.data?.messages || [];
  const mailThread = threadQuery.data?.messages || [];

  return (
    <aside className="w-[340px] xl:w-[375px] shrink-0 h-full border-l border-slate-200/75 bg-white/70 backdrop-blur-xl flex flex-col overflow-hidden">
      {/* 顶部三维 Tab 切换 */}
      <div className="p-3 border-b border-slate-200/70 flex justify-center shrink-0">
        <SegmentedControl
          size="sm"
          value={rightTab}
          onChange={setRightTab}
          className="w-full grid grid-cols-3"
          options={[
            {
              value: "copilot",
              label: "AI 副驾驶",
              icon: <Sparkles className="w-3 h-3" />,
            },
            {
              value: "profile",
              label: "导师档案",
              icon: <UserCheck className="w-3 h-3" />,
            },
            {
              value: "thread",
              label: "往来回信",
              icon: <Mail className="w-3 h-3" />,
              badge: unreadForAdvisor > 0 ? unreadForAdvisor : mailThread.length || undefined,
            },
          ]}
        />
      </div>

      {/* Tab 1: AI Copilot 对话区 */}
      {rightTab === "copilot" && (
        <div className="flex-1 min-h-0 flex flex-col">
          {!bootstrap.aiConfig.hasApiKey && (
            <div className="m-3 p-3 rounded-2xl bg-amber-50/90 border border-amber-200/80 text-[12px] text-amber-800 flex items-center justify-between gap-2 shrink-0">
              <span>尚未配置 DeepSeek / LLM API Key</span>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => openSettings("ai")}
              >
                去配置
              </Button>
            </div>
          )}

          {/* 快捷意图芯片 */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex flex-wrap gap-1.5 shrink-0">
            {COPILOT_SHORTCUTS.map((chip) => (
              <button
                key={chip.mode}
                type="button"
                disabled={chatMutation.isPending}
                onClick={() =>
                  chatMutation.mutate({
                    actionMode: chip.mode,
                    userMessage: "",
                  })
                }
                className="px-2.5 py-1 rounded-full bg-white hover:bg-blue-50 border border-slate-200/85 hover:border-[#2563EB]/40 text-[11px] font-medium text-slate-700 hover:text-[#1D4ED8] transition-colors cursor-pointer disabled:opacity-50"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* 消息流 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-2">
                <MessageSquareText className="w-7 h-7 text-[#2563EB]/50 mx-auto" />
                <p className="text-[12px] font-medium text-slate-600">
                  围绕 {advisor.name} 导师进行一对一精细打磨
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  系统严格注入你的真实论文与科研名片，禁止 AI 编造任何虚假成果。点击上方任意快捷芯片或直接提出修改意见。
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                const hasSuggestion = Boolean(
                  msg.suggestedBody || msg.suggestedSubject || msg.suggestedHook
                );
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col gap-1.5",
                      isUser ? "items-end" : "items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12px] leading-relaxed",
                        isUser
                          ? "bg-[#2563EB] text-white rounded-br-md"
                          : "bg-slate-100/90 text-[#111827] border border-slate-200/70 rounded-bl-md"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {!isUser && hasSuggestion && (
                      <div className="w-full rounded-2xl bg-white border border-blue-200/80 shadow-[0_6px_20px_-10px_rgba(37,99,235,0.2)] p-3 space-y-2">
                        {msg.suggestedHook && (
                          <div className="px-2.5 py-1.5 rounded-xl bg-blue-50/75 text-[11px] text-[#1D4ED8]">
                            <strong>推荐切入点：</strong>
                            {msg.suggestedHook}
                          </div>
                        )}
                        {msg.suggestedSubject && (
                          <div className="text-[11px] text-slate-700">
                            <span className="text-slate-400">建议主题：</span>
                            <strong>{msg.suggestedSubject}</strong>
                          </div>
                        )}
                        {msg.suggestedBody && (
                          <pre className="text-[11.5px] font-sans whitespace-pre-wrap text-slate-600 bg-slate-50/80 rounded-xl p-2.5 max-h-48 overflow-y-auto border border-slate-100">
                            {msg.suggestedBody}
                          </pre>
                        )}
                        <div className="flex justify-end">
                          <Button
                            variant="primary"
                            size="xs"
                            loading={applySuggestionMutation.isPending}
                            icon={<ClipboardCheck className="w-3 h-3" />}
                            onClick={() => applySuggestionMutation.mutate(msg)}
                          >
                            一键填入左侧编辑器
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {chatMutation.isPending && <PigeonThinking />}
          </div>

          {/* 底部输入栏 */}
          <div className="p-3 border-t border-slate-200/70 bg-white/85 space-y-2 shrink-0">
            <textarea
              rows={2}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim() && !chatMutation.isPending) {
                    chatMutation.mutate({
                      actionMode: "chat",
                      userMessage: chatInput.trim(),
                    });
                  }
                }
              }}
              placeholder="输入具体修改要求（Enter 发送，Shift+Enter 换行）..."
              className="w-full rounded-xl bg-slate-100/80 border border-slate-200/80 px-3 py-2 text-[12px] focus:outline-none focus:bg-white focus:border-[#2563EB]/45 resize-none"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setConfirmClearChat(true)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 cursor-pointer"
              >
                <Eraser className="w-3 h-3" />
                清空会话
              </button>
              <Button
                variant="primary"
                size="xs"
                disabled={!chatInput.trim()}
                loading={chatMutation.isPending}
                icon={<Send className="w-3 h-3" />}
                onClick={() =>
                  chatMutation.mutate({
                    actionMode: "chat",
                    userMessage: chatInput.trim(),
                  })
                }
              >
                发送指令
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: 导师结构化档案 & AI 匹配评估 */}
      {rightTab === "profile" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* AI 深度匹配分析卡片 */}
          <SpotlightCard className="p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#2563EB]" />
                <span className="text-[13px] font-semibold text-[#111827]">
                  AI 契合度评估
                </span>
              </div>
              <Button
                variant="glass"
                size="xs"
                loading={analyzeMutation.isPending}
                onClick={() => analyzeMutation.mutate()}
              >
                {advisor.aiInsights ? "重新评估" : "开始评估"}
              </Button>
            </div>

            {advisor.aiInsights ? (
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                      MATCH_TIER_STYLES[advisor.matchTier].badgeClass
                    )}
                  >
                    {MATCH_TIER_STYLES[advisor.matchTier].short}
                  </span>
                  {advisor.matchScore !== null && (
                    <span className="font-mono font-bold text-[#2563EB]">
                      {advisor.matchScore} / 100
                    </span>
                  )}
                </div>
                <p className="text-slate-700 leading-relaxed">
                  {advisor.aiInsights.summary}
                </p>
                {advisor.aiInsights.recommendedHooks.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-500">
                      推荐切入点（点击一键采纳）：
                    </div>
                    {advisor.aiInsights.recommendedHooks.map((h, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          saveProfileMutation.mutate({ hookNote: h })
                        }
                        className="w-full text-left px-2.5 py-1.5 rounded-xl bg-blue-50/75 hover:bg-blue-100/70 text-[11px] text-[#1D4ED8] transition-colors cursor-pointer"
                      >
                        • {h}
                      </button>
                    ))}
                  </div>
                )}
                {advisor.aiInsights.riskFlags.length > 0 && (
                  <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 space-y-1">
                    {advisor.aiInsights.riskFlags.map((flag, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-1.5 text-[11px] text-amber-800"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{flag}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11.5px] text-slate-500 leading-relaxed">
                结合你的结构化论文与项目背景，评估方向/方法契合度并生成可直接引用的切入建议。
              </p>
            )}
          </SpotlightCard>

          {/* 档案编辑字段 */}
          <div className="space-y-2.5 text-[12px]">
            <div>
              <label className="text-[11px] font-medium text-slate-500">
                联系邮箱
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="advisor@university.edu.cn"
                className="mt-1 w-full h-8 px-3 rounded-xl bg-white border border-slate-200/85 font-mono text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                个人/实验室主页链接
              </label>
              <input
                type="url"
                value={homepageInput}
                onChange={(e) => setHomepageInput(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full h-8 px-3 rounded-xl bg-white border border-slate-200/85 text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                研究标签（逗号分隔）
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="大模型推理, 医学影像, 多模态对齐"
                className="mt-1 w-full h-8 px-3 rounded-xl bg-white border border-slate-200/85 text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                研究方向与代表作摘要
              </label>
              <textarea
                rows={3}
                value={researchInput}
                onChange={(e) => setResearchInput(e.target.value)}
                className="mt-1 w-full p-2.5 rounded-xl bg-white border border-slate-200/85 text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                个人备忘录
              </label>
              <textarea
                rows={2}
                value={userNotesInput}
                onChange={(e) => setUserNotesInput(e.target.value)}
                className="mt-1 w-full p-2.5 rounded-xl bg-white border border-slate-200/85 text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                回信记录总结
              </label>
              <textarea
                rows={2}
                value={replyNoteInput}
                onChange={(e) => setReplyNoteInput(e.target.value)}
                className="mt-1 w-full p-2.5 rounded-xl bg-white border border-slate-200/85 text-[12px] focus:outline-none focus:border-[#2563EB]/45"
              />
            </div>

            <div className="pt-1 flex items-center justify-between gap-2">
              <Button
                variant="danger"
                size="xs"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={() => setConfirmDeleteAdv(true)}
              >
                移除导师
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={saveProfileMutation.isPending}
                onClick={() =>
                  saveProfileMutation.mutate({
                    email: emailInput.trim(),
                    homepageUrl: homepageInput.trim(),
                    researchTags: tagsInput
                      .split(/[,，|、]/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                    researchSummary: researchInput.trim(),
                    userNotes: userNotesInput.trim(),
                    replyNote: replyNoteInput.trim(),
                  })
                }
              >
                保存档案
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 往来邮件线索时间轴 */}
      {rightTab === "thread" && (
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
          {mailThread.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <Mail className="w-7 h-7 text-slate-300 mx-auto" />
              <p className="text-[12px] font-medium text-slate-500">
                尚无邮件往来记录
              </p>
              <p className="text-[11px] text-slate-400">
                发出套磁邮件或点击顶部「收取回信」后，这里会自动关联展示双方完整通信线程。
              </p>
            </div>
          ) : (
            mailThread.map((msg) => {
              const isInbound = msg.direction === "inbound";
              const intentBadge =
                msg.replyIntent && REPLY_INTENT_BADGES[msg.replyIntent];
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "rounded-2xl p-3 border space-y-2 text-[12px]",
                    isInbound
                      ? "bg-white border-emerald-200/90 shadow-[0_6px_18px_-10px_rgba(16,185,129,0.2)]"
                      : "bg-blue-50/55 border-blue-200/70"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 font-semibold text-[#111827]">
                      {isInbound ? (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#2563EB]" />
                      )}
                      {isInbound ? `${advisor.name} 来信` : "我方发出"}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {formatShortTime(msg.sentOrReceivedAt)}
                    </span>
                  </div>

                  {intentBadge && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                          intentBadge.className
                        )}
                      >
                        {intentBadge.label}
                      </span>
                      {msg.extractedTodos.map((todo, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-[10px] text-emerald-700"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {todo}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="font-medium text-slate-800">{msg.subject}</div>
                  <p className="text-slate-600 whitespace-pre-wrap leading-relaxed text-[11.5px] max-h-56 overflow-y-auto">
                    {msg.body}
                  </p>

                  {msg.attachments.length > 0 && (
                    <div className="text-[10px] text-slate-400">
                      附件：{msg.attachments.join("、")}
                    </div>
                  )}

                  {isInbound && (
                    <div className="pt-1 flex justify-end">
                      <Button
                        variant="glass"
                        size="xs"
                        icon={<Reply className="w-3 h-3" />}
                        onClick={() => handleQuoteReply(msg)}
                      >
                        引用回复此封
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmClearChat}
        onOpenChange={setConfirmClearChat}
        title="清空 AI 会话历史？"
        description={`将永久删除针对 ${advisor.name} 导师的所有 AI 副驾驶问答上下文（不影响已保存的邮件草稿）。`}
        confirmLabel="确认清空"
        danger
        loading={clearChatMutation.isPending}
        onConfirm={() => clearChatMutation.mutate()}
      />

      <ConfirmDialog
        open={confirmDeleteAdv}
        onOpenChange={setConfirmDeleteAdv}
        title={`移除 ${advisor.name} 导师档案？`}
        description="移除后该导师的草稿、历史版本与通信线程记录都会一并删除且不可撤销。"
        confirmLabel="确认删除"
        danger
        loading={deleteAdvisorMutation.isPending}
        onConfirm={() => deleteAdvisorMutation.mutate()}
      />
    </aside>
  );
}
