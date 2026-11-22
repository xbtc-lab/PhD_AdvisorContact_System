import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Check, ChevronDown, MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Advisor, AiActionMode, AiChatMessageRecord, BootstrapData } from "@app/shared";
import { cloudApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { PigeonThinking } from "@/components/ui/BrandMascot.js";

export interface AgentChatPaneProps {
  bootstrap: BootstrapData;
  advisor: Advisor;
  subject: string;
  body: string;
  hookNote: string;
  latestReplyText: string;
  embedContactCard: boolean;
  modeSwitcher: ReactNode;
  paneToggleButton?: ReactNode;
  onToggleEmbedCard: () => void;
  onApplySuggestion: (patch: {
    subject?: string;
    body?: string;
    hook?: string;
  }) => void;
}

/**
 * 写信工坊左栏 — 模式 A：Cue Agent 统一顶栏 + 多会话聊天区 + 紧凑停靠输入盒。
 */
export function AgentChatPane({
  bootstrap,
  advisor,
  subject,
  body,
  hookNote,
  latestReplyText,
  embedContactCard,
  modeSwitcher,
  paneToggleButton,
  onToggleEmbedCard,
  onApplySuggestion,
}: AgentChatPaneProps) {
  const queryClient = useQueryClient();
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [promptInput, setPromptInput] = useState("");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);

  const sessionsQuery = useQuery({
    queryKey: ["ai-sessions", advisor.id],
    queryFn: () => cloudApi.listSessions(advisor.id),
  });

  const sessions = sessionsQuery.data?.sessions || [];
  const effectiveSessionId =
    activeSessionId && sessions.some((s) => s.id === activeSessionId)
      ? activeSessionId
      : sessions[0]?.id;

  useEffect(() => {
    if (!activeSessionId && sessions[0]?.id) {
      setActiveSessionId(sessions[0].id);
    }
  }, [activeSessionId, sessions, setActiveSessionId]);

  const convQuery = useQuery({
    queryKey: ["conversations", advisor.id, effectiveSessionId || "default"],
    queryFn: () => cloudApi.getConversations(advisor.id, effectiveSessionId),
  });

  const createSessionMutation = useMutation({
    mutationFn: () =>
      cloudApi.createSession(advisor.id, `写作会话 #${sessions.length + 1}`),
    onSuccess: async (res) => {
      setActiveSessionId(res.session.id);
      setSessionMenuOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["ai-sessions", advisor.id] });
      toast.success(`已新建独立对话分支：${res.session.title}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) => cloudApi.deleteSession(sessionId),
    onSuccess: async () => {
      setActiveSessionId(null);
      setSessionMenuOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-sessions", advisor.id] }),
        queryClient.invalidateQueries({ queryKey: ["conversations", advisor.id] }),
      ]);
      toast.success("已删除写作会话");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const chatMutation = useMutation({
    mutationFn: (params: { mode: AiActionMode; text: string }) =>
      cloudApi.chat({
        advisorId: advisor.id,
        sessionId: effectiveSessionId,
        actionMode: params.mode,
        userMessage: params.text,
        currentSubject: subject,
        currentBody: body,
        currentHook: hookNote,
        latestReply: latestReplyText,
      }),
    onSuccess: async (res) => {
      if (res.sessionId && res.sessionId !== activeSessionId) {
        setActiveSessionId(res.sessionId);
      }
      setPromptInput("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-sessions", advisor.id] }),
        queryClient.invalidateQueries({ queryKey: ["conversations", advisor.id] }),
      ]);
      if (res.assistantMessage.suggestedBody || res.assistantMessage.suggestedSubject) {
        onApplySuggestion({
          subject: res.assistantMessage.suggestedSubject || undefined,
          body: res.assistantMessage.suggestedBody || undefined,
          hook: res.assistantMessage.suggestedHook || undefined,
        });
        toast.success("Cue 已生成建议稿件并同步到右侧预览");
      }
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const activeSessionTitle =
    sessions.find((s) => s.id === effectiveSessionId)?.title || "默认会话";
  const messages: AiChatMessageRecord[] = convQuery.data?.messages || [];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 统一左栏顶栏：h-14 与右栏完全等高平齐 */}
      <div className="px-5 h-14 shrink-0 hairline-b bg-white flex items-center justify-between gap-2 relative">
        {modeSwitcher}

        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => setSessionMenuOpen((v) => !v)}
            className="h-8 px-3 rounded-full bg-[#FAFAFB] hairline text-[12px] font-medium text-[#0F172A] theme-hover-border cursor-pointer inline-flex items-center gap-1.5 transition-all min-w-0"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
            <span className="max-w-[110px] truncate">{activeSessionTitle}</span>
            <ChevronDown className="w-3 h-3 text-[#94A3B8] shrink-0" />
          </button>

          <button
            type="button"
            disabled={createSessionMutation.isPending}
            onClick={() => createSessionMutation.mutate()}
            title="新建写作会话分支"
            aria-label="新建写作会话分支"
            className="w-8 h-8 rounded-full bg-white hairline text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer inline-flex items-center justify-center transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {paneToggleButton}

          {sessionMenuOpen && (
            <div className="absolute right-5 top-12 w-64 glass-popover rounded-[16px] p-1.5 z-40 space-y-0.5 text-[12px]">
              {sessions.length === 0 ? (
                <div className="px-3 py-2 text-[#64748B]">将自动创建默认写作会话</div>
              ) : (
                sessions.map((s) => {
                  const isCurr = s.id === effectiveSessionId;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-[10px] hover:bg-[#FAFAFB]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSessionId(s.id);
                          setSessionMenuOpen(false);
                        }}
                        className="flex-1 text-left bg-transparent border-0 cursor-pointer flex items-center justify-between gap-2 min-w-0"
                      >
                        <span
                          className={cn(
                            "truncate",
                            isCurr ? "font-semibold text-[#0F172A]" : "text-[#475569]"
                          )}
                        >
                          {s.title}
                        </span>
                        <span className="text-[11px] cue-mono text-[#94A3B8] shrink-0">
                          {isCurr ? "当前" : `${s.messageCount} 条`}
                        </span>
                      </button>
                      {sessions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => deleteSessionMutation.mutate(s.id)}
                          className="w-6 h-6 rounded-full hover:bg-rose-50 text-[#94A3B8] hover:text-rose-600 inline-flex items-center justify-center bg-transparent border-0 cursor-pointer shrink-0"
                          title="删除此会话"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 中部对话消息流 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5 min-h-[220px] bg-white">
        {!bootstrap.aiConfig.hasApiKey && (
          <div className="px-3.5 py-2.5 rounded-[14px] bg-amber-50/80 border border-amber-200/80 flex items-center justify-between gap-2 text-[12px] text-amber-800">
            <span>尚未配置大模型 API Key，暂不可调用在线润色</span>
            <button
              type="button"
              onClick={() => {
                useAppStore.getState().openSettings("ai");
                setActiveTab("settings");
              }}
              className="font-semibold theme-text bg-transparent border-0 cursor-pointer hover:underline shrink-0 whitespace-nowrap"
            >
              去配置 →
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="card-well p-4 space-y-2">
            <div className="text-[12px] font-semibold theme-text">Cue Agent 学术协作已就绪</div>
            <p className="text-[12.5px] leading-[1.7] text-[#475569] m-0">
              已同步读取「我的履历」中已勾选重点成果与{" "}
              <strong className="text-[#0F172A]">{advisor.name}</strong> 老师研究画像。
              点下方快捷动作一键生成初稿，或直接输入自然语言指示。
            </p>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-[16px] theme-bubble-user px-4 py-3 text-[13px] leading-[1.7] whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                className="card-well p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold theme-text">
                    Cue Agent 协作者
                  </span>
                  {(m.suggestedBody || m.suggestedSubject || m.suggestedHook) && (
                    <button
                      type="button"
                      onClick={() => {
                        onApplySuggestion({
                          subject: m.suggestedSubject || undefined,
                          body: m.suggestedBody || undefined,
                          hook: m.suggestedHook || undefined,
                        });
                        toast.success("已采纳此条建议到右侧预览");
                      }}
                      className="px-2.5 py-1 rounded-full theme-soft-pill text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 shrink-0"
                    >
                      <Check className="w-3 h-3" />
                      <span>采纳到邮件</span>
                    </button>
                  )}
                </div>
                <div className="text-[13px] leading-[1.7] text-[#334155] whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            )
          )
        )}

        {chatMutation.isPending && (
          <div className="pt-1">
            <PigeonThinking />
          </div>
        )}
      </div>

      {/* 底部停靠输入区 */}
      <div className="p-4 shrink-0 hairline-t bg-[#FAFAFB]/75 space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={chatMutation.isPending}
            onClick={() => chatMutation.mutate({ mode: "generate", text: "" })}
            className="h-7 px-3 rounded-full theme-soft-pill text-[11.5px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            起草首信
          </button>
          <button
            type="button"
            disabled={chatMutation.isPending}
            onClick={() => chatMutation.mutate({ mode: "polish", text: "" })}
            className="h-7 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#475569] cursor-pointer theme-hover-border transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            深度润色
          </button>
          <button
            type="button"
            disabled={chatMutation.isPending}
            onClick={() => chatMutation.mutate({ mode: "shorten", text: "" })}
            className="h-7 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#475569] cursor-pointer theme-hover-border transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            精简一屏
          </button>
          <button
            type="button"
            disabled={chatMutation.isPending}
            onClick={() => chatMutation.mutate({ mode: "translate_en", text: "" })}
            className="h-7 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#475569] theme-hover-border cursor-pointer transition-all disabled:opacity-50 whitespace-nowrap"
          >
            英文改写
          </button>
          <button
            type="button"
            disabled={chatMutation.isPending}
            onClick={() => chatMutation.mutate({ mode: "hooks", text: "" })}
            className="h-7 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#475569] theme-hover-border cursor-pointer transition-all disabled:opacity-50 whitespace-nowrap"
          >
            切入点对齐
          </button>
        </div>

        <div className="rounded-[16px] bg-white hairline p-3 space-y-2">
          <textarea
            rows={2}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (promptInput.trim() && !chatMutation.isPending) {
                  chatMutation.mutate({ mode: "chat", text: promptInput.trim() });
                }
              }
            }}
            placeholder={`告诉 Cue 怎么调整给 ${advisor.name} 老师的邮件...`}
            className="w-full text-[13px] leading-[1.65] text-[#0F172A] placeholder:text-[#94A3B8] border-0 resize-none focus:outline-none bg-transparent"
          />

          <div className="flex items-center justify-between gap-2 pt-2 hairline-t">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="h-7 px-2.5 rounded-full bg-[#FAFAFB] hairline text-[11.5px] cue-mono text-[#475569] inline-flex items-center truncate max-w-[140px]">
                {bootstrap.aiConfig.model || "deepseek-chat"}
              </span>
              <button
                type="button"
                onClick={onToggleEmbedCard}
                className={cn(
                  "h-7 px-2.5 rounded-full text-[11.5px] font-medium cursor-pointer transition-all whitespace-nowrap shrink-0",
                  embedContactCard
                    ? "theme-soft-pill"
                    : "bg-[#FAFAFB] hairline text-[#64748B] theme-hover-border"
                )}
              >
                {embedContactCard ? "含 HTML 联系卡" : "不附联系卡"}
              </button>
            </div>

            <button
              type="button"
              disabled={!promptInput.trim() || chatMutation.isPending}
              onClick={() =>
                chatMutation.mutate({ mode: "chat", text: promptInput.trim() })
              }
              title="发送指令给 Cue"
              aria-label="发送指令"
              className="theme-cta w-8 h-8 rounded-full inline-flex items-center justify-center border-0 cursor-pointer disabled:opacity-45 shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
