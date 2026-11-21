import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpLeft,
  Copy,
  Globe,
  KeyRound,
  Lightbulb,
  Reply,
  Scissors,
  Send,
  Sparkles,
  Trash2,
  UserCircle2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, SegmentedControl } from "./ui";
import { PigeonThinking } from "./Mascot";
import { apiFetch, cn } from "../lib/api";
import type { AiChatMessage, AiConfig, MailThreadMessage, Professor } from "../types";
import type { DraftFields } from "./MailStudio";

export function RightSidePanel({
  activeTab,
  onChangeTab,
  professor,
  fields,
  aiConfig,
  latestReply,
  onChangeField,
  onApplyDraft,
  onApplyHook,
  onDeleteProfessor,
  onOpenAiSettings,
  onClose,
}: {
  activeTab: "ai" | "profile";
  onChangeTab: (t: "ai" | "profile") => void;
  professor: Professor;
  fields: DraftFields;
  aiConfig?: AiConfig;
  latestReply: MailThreadMessage | null;
  onChangeField: <K extends keyof DraftFields>(key: K, val: DraftFields[K]) => void;
  onApplyDraft: (subject: string, body: string, hook?: string) => void;
  onApplyHook: (hook: string) => void;
  onDeleteProfessor: () => void;
  onOpenAiSettings: () => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const hasKey = Boolean(aiConfig?.has_api_key || aiConfig?.api_key);

  useEffect(() => {
    setMessages([]);
  }, [professor.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function runAiAction(actionMode: string, customPrompt?: string) {
    if (!hasKey) {
      toast.warning("请先填写您的 DeepSeek API Key");
      onOpenAiSettings();
      return;
    }
    const displayUserText =
      customPrompt ||
      {
        generate: "结合我的名片与导师研究方向，帮我起草一封真诚克制的套磁首信",
        reply_followup: "根据导师刚刚发来的回信，帮我拟一封礼貌得体的回复",
        shorten: "把当前正文精简到 400 字以内，更适合老师在手机上快速看完",
        polish: "帮我润色文字，去掉生硬套话，让学术表达更自然真诚",
        translate_en: "改写为地道得体的学术英文版本",
        hooks: "提炼 3 条我和导师研究方向的具体契合点",
      }[actionMode] ||
      "请帮我优化这封邮件";

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: displayUserText,
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);

    try {
      const res = await apiFetch<{
        ok: boolean;
        reply: string;
        suggested_subject: string;
        suggested_body: string;
        suggested_hook: string;
        model?: string;
      }>("/api/ai/chat", "POST", {
        professor_id: professor.id,
        action_mode: actionMode,
        user_message: customPrompt || "",
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        current_subject: fields.subject,
        current_body: fields.body,
        current_hook: fields.hook,
        latest_reply: latestReply ? `主题：${latestReply.subject}\n正文：${latestReply.body}` : "",
      });

      const assistantMsg: AiChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        suggested_subject: res.suggested_subject,
        suggested_body: res.suggested_body,
        suggested_hook: res.suggested_hook,
        model: res.model,
      };
      setMessages([...nextHistory, assistantMsg]);
    } catch (e: any) {
      toast.error(e.message || "DeepSeek 调用失败");
      setMessages([
        ...nextHistory,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: `调用出错：${e.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const quickChips = [
    ...(latestReply ? [{ key: "reply_followup", label: "拟定礼貌回信", icon: Reply }] : []),
    { key: "generate", label: "起草套磁首信", icon: Sparkles },
    { key: "polish", label: "润色更自然", icon: Wand2 },
    { key: "shorten", label: "精简到 400 字", icon: Scissors },
    { key: "translate_en", label: "英文学术版", icon: Globe },
    { key: "hooks", label: "找研究契合点", icon: Lightbulb },
  ];

  const tags = (professor.tags || "")
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 372, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
      className="shrink-0 bg-[#F8F9FB] border-l border-slate-900/[0.07] flex flex-col min-h-0 overflow-hidden"
    >
      <div className="w-[372px] h-full flex flex-col min-h-0">
        {/* Header Tabs + Close */}
        <div className="px-3.5 py-2.5 bg-white border-b border-slate-900/[0.06] flex items-center justify-between gap-2 shrink-0">
          <SegmentedControl
            size="sm"
            layoutId="right-panel-tab"
            value={activeTab}
            onValueChange={(v) => onChangeTab(v as "ai" | "profile")}
            options={[
              { value: "ai", label: "AI 写信助手", icon: Sparkles },
              { value: "profile", label: "导师档案与备忘", icon: UserCircle2 },
            ]}
          />
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center text-[#71717A] hover:bg-slate-900/[0.05] hover:text-[#18181B] cursor-pointer transition-colors"
            aria-label="收起侧栏"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TAB 1: AI Writing Copilot */}
        {activeTab === "ai" && (
          <>
            <div className="px-4 py-2 bg-white/80 border-b border-slate-900/[0.05] flex items-center justify-between gap-2 text-[11.5px] text-[#6B7280] shrink-0">
              <span className="truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB] shrink-0" />
                <span className="truncate">
                  已读入 <strong className="text-[#18181B] font-medium">{professor.name}</strong> 档案与你的名片
                </span>
              </span>
              <button
                type="button"
                onClick={onOpenAiSettings}
                className="inline-flex items-center gap-1 text-[#2563EB] font-medium hover:underline shrink-0 cursor-pointer"
              >
                <KeyRound className="w-3 h-3" />
                <span>{hasKey ? "配置" : "填 Key"}</span>
              </button>
            </div>

            <div className="px-3.5 py-2.5 border-b border-slate-900/[0.05] flex flex-wrap gap-1.5 bg-white shrink-0">
              {quickChips.map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    disabled={loading}
                    onClick={() => runAiAction(chip.key)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] text-[11.5px] font-medium text-[#3F3F46] hover:ring-[#2563EB]/35 hover:text-[#1D4ED8] hover:bg-[#EFF6FF] active:scale-[0.97] disabled:opacity-50 cursor-pointer transition-all"
                  >
                    <Icon className="w-3 h-3" />
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {!hasKey ? (
                <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] shadow-card p-4 space-y-3 text-[12.5px]">
                  <div className="flex items-center gap-3">
                    <PigeonThinking />
                    <div>
                      <div className="font-bold text-[#18181B]">开启 DeepSeek 写作小助手</div>
                      <div className="text-[11.5px] text-[#71717A]">自备密钥 · 按字计费无需包月</div>
                    </div>
                  </div>
                  <p className="text-[#52525B] leading-relaxed m-0 text-[12px]">
                    填上你自己的 DeepSeek API Key（官方充 5～10 元即可用完整个申请季），密钥只存在你电脑本地。
                  </p>
                  <Button variant="primary" size="sm" onClick={onOpenAiSettings} className="w-full">
                    1 分钟填入 DeepSeek API Key
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="py-10 px-4 text-center space-y-2.5">
                  <PigeonThinking active={false} />
                  <div className="text-[13px] font-semibold text-[#18181B]">
                    小信鸽已准备好为你打磨信件
                  </div>
                  <p className="text-[12px] text-[#71717A] leading-relaxed m-0">
                    点上方快捷胶囊一键成稿，或在下方直接说你的想法（例如：“语气更真诚柔和一些，加上我对老师专著的阅读体会”）。
                  </p>
                </div>
              ) : null}

              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                  className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}
                >
                  <div
                    className={cn(
                      "max-w-[92%] rounded-[13px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[#18181B] text-white"
                        : "bg-white ring-1 ring-slate-900/[0.07] text-[#18181B] shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
                    )}
                  >
                    {m.content}
                  </div>

                  {m.role === "assistant" && (m.suggested_body || m.suggested_subject || m.suggested_hook) && (
                    <div className="w-full bg-white ring-1 ring-[#3B82F6]/25 rounded-[14px] overflow-hidden shadow-card">
                      <div className="px-3.5 py-2 bg-[#EFF6FF]/75 border-b border-[#3B82F6]/12 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-semibold text-[#1D4ED8]">
                          AI 建议稿件
                        </span>
                        <div className="flex items-center gap-1">
                          {m.suggested_body && (
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(m.suggested_body || "");
                                toast.success("已复制建议正文");
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] text-[#52525B] hover:bg-white cursor-pointer transition-colors"
                            >
                              <Copy className="w-3 h-3" />
                              <span>复制</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onApplyDraft(
                                m.suggested_subject || "",
                                m.suggested_body || "",
                                m.suggested_hook || ""
                              );
                              toast.success("已一键填入左侧写信区");
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] bg-[#18181B] text-white text-[11px] font-medium hover:bg-[#27272A] active:scale-[0.97] cursor-pointer transition-all"
                          >
                            <ArrowUpLeft className="w-3 h-3" />
                            <span>一键填入</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-3.5 space-y-2.5 text-[12px]">
                        {m.suggested_hook && (
                          <div className="bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] rounded-[8px] p-2.5 flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10.5px] font-medium text-[#71717A] block mb-0.5">
                                建议研究契合点
                              </span>
                              <span className="text-[#18181B]">{m.suggested_hook}</span>
                            </div>
                            {!m.suggested_body && (
                              <button
                                type="button"
                                onClick={() => {
                                  onApplyHook(m.suggested_hook || "");
                                  toast.success("已保存到导师档案契合笔记");
                                }}
                                className="text-[11px] text-[#2563EB] font-semibold shrink-0 hover:underline cursor-pointer"
                              >
                                采纳
                              </button>
                            )}
                          </div>
                        )}
                        {m.suggested_subject && (
                          <div>
                            <span className="text-[10.5px] font-medium text-[#71717A] block mb-0.5">
                              推荐标题
                            </span>
                            <div className="font-semibold text-[#18181B]">{m.suggested_subject}</div>
                          </div>
                        )}
                        {m.suggested_body && (
                          <div>
                            <span className="text-[10.5px] font-medium text-[#71717A] block mb-1">
                              推荐正文
                            </span>
                            <div className="max-h-[210px] overflow-y-auto text-[#3F3F46] leading-relaxed whitespace-pre-wrap pr-1 border-t border-slate-900/[0.06] pt-2">
                              {m.suggested_body}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {loading && (
                <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[13px] px-3.5 py-2.5 text-[12px] text-[#52525B] flex items-center gap-2.5 shadow-xs">
                  <PigeonThinking active />
                  <span>小信鸽正在结合导师背景帮你推敲词句...</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-white border-t border-slate-900/[0.06] shrink-0">
              <div className="relative ring-1 ring-slate-900/[0.11] rounded-[12px] bg-[#F8F9FB] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition-all">
                <textarea
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() && !loading) runAiAction("chat", input.trim());
                    }
                  }}
                  placeholder="告诉我你想怎么改，按 Enter 发送..."
                  className="w-full bg-transparent border-none outline-none resize-none px-3.5 pt-2.5 pb-9 text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF]"
                />
                <div className="absolute bottom-2 right-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!input.trim() || loading}
                    onClick={() => runAiAction("chat", input.trim())}
                    className="h-7 px-2.5"
                  >
                    <Send className="w-3 h-3" />
                    <span>发送</span>
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 2: Mentor Dossier, Matching Notes & Delete */}
        {activeTab === "profile" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4 space-y-2.5">
              <div className="text-[12px] font-semibold text-[#18181B]">研究方向与标签</div>
              <p className="text-[12.5px] text-[#52525B] leading-relaxed m-0">
                {professor.research || "暂未填写详细研究方向"}
              </p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="text-[11px] font-medium text-[#52525B] bg-[#F4F5F7] px-2 py-0.5 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4 space-y-2">
              <label className="block text-[12px] font-semibold text-[#18181B]">
                研究契合笔记（AI 写信时会自动参考）
              </label>
              <textarea
                rows={3}
                value={fields.hook}
                onChange={(e) => onChangeField("hook", e.target.value)}
                placeholder="例如：老师去年关于媒介记忆的专著与我硕士论文第三章高度契合..."
                className="w-full p-2.5 bg-[#F8F9FB] focus:bg-white ring-1 ring-slate-900/[0.08] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[10px] text-[12.5px] leading-relaxed outline-none resize-y transition-all"
              />
            </div>

            <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4 space-y-2">
              <label className="block text-[12px] font-semibold text-[#18181B]">个人备忘 / 来源</label>
              <textarea
                rows={2}
                value={fields.note}
                onChange={(e) => onChangeField("note", e.target.value)}
                placeholder="例如：同门师姐推荐、今年有统招名额..."
                className="w-full p-2.5 bg-[#F8F9FB] focus:bg-white ring-1 ring-slate-900/[0.08] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[10px] text-[12.5px] leading-relaxed outline-none resize-y transition-all"
              />
            </div>

            <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[14px] p-4 space-y-2">
              <label className="block text-[12px] font-semibold text-[#18181B]">回信与面试跟进记录</label>
              <textarea
                rows={3}
                value={fields.reply_note}
                onChange={(e) => onChangeField("reply_note", e.target.value)}
                placeholder="自动记录导师回信摘要，也可手动补充约面时间、需补交材料..."
                className="w-full p-2.5 bg-[#F8F9FB] focus:bg-white ring-1 ring-slate-900/[0.08] focus:ring-2 focus:ring-[#2563EB]/20 rounded-[10px] text-[12.5px] leading-relaxed outline-none resize-y transition-all"
              />
              {professor.sent_time && (
                <div className="text-[11.5px] text-[#71717A] pt-1 font-mono">
                  最近联系：{professor.sent_time}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="danger" size="sm" onClick={onDeleteProfessor}>
                <Trash2 className="w-3.5 h-3.5" />
                <span>从名录中移除这位导师</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
