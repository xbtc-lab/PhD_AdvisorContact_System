import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  CornerDownRight,
  Eye,
  Mail,
  MousePointerClick,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type { Advisor, BootstrapData, MailMessage, TrackingSummary } from "@app/shared";
import { cloudApi, workerApi } from "@/lib/api.js";
import {
  cn,
  formatShortTime,
  REPLY_INTENT_BADGES,
  STAGE_STYLES,
} from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorPhotoAvatar } from "@/components/ui/AdvisorPhotoAvatar.js";
import { BaseSwitch } from "@/components/ui/BaseSwitch.js";
import { EmptyDeskIllustration } from "@/components/ui/BrandMascot.js";
import { Button } from "@/components/ui/Button.js";

export interface InboxViewProps {
  bootstrap: BootstrapData;
}

type InboxFilter = "all" | "replied" | "viewed";

/**
 * 视图 4：往来动态（真实邮件线程 + IMAP 回信同步 + 双轨行为追踪汇总 + 快速拟回复）。
 */
export function InboxView({ bootstrap }: InboxViewProps) {
  const queryClient = useQueryClient();
  const selectedAdvisorId = useAppStore((s) => s.selectedAdvisorId);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const openWriterFor = useAppStore((s) => s.openWriterFor);
  const setPhotoModalData = useAppStore((s) => s.setPhotoModalData);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const triggerCelebration = useAppStore((s) => s.triggerCelebration);

  const [filterMode, setFilterMode] = useState<InboxFilter>("all");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobilePane, setMobilePane] = useState<"list" | "detail">("list");
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyAccountId, setReplyAccountId] = useState("");
  const [includeAttachment, setIncludeAttachment] = useState(false);
  const [quotedMsgId, setQuotedMsgId] = useState<string>("");

  const markedReadRef = useRef<Set<string>>(new Set());

  const instMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const inst of bootstrap.institutions) {
      m.set(inst.id, inst.name);
    }
    return m;
  }, [bootstrap.institutions]);

  const unreadAdvisorIds = useMemo(() => {
    return new Set(bootstrap.unreadReplies.map((r) => r.advisorId));
  }, [bootstrap.unreadReplies]);

  const summaries = bootstrap.trackingSummaries || {};
  const avatarStyle = bootstrap.preferences.avatarStyle;

  /**
   * 计算导师往来动态的排序权重与状态标签。
   */
  const sortedAdvisors = useMemo(() => {
    const active = bootstrap.advisors.filter((adv) => {
      const tr = summaries[adv.id];
      const replies = bootstrap.replyCounts[adv.id] || 0;
      const hasClicks = (tr?.resumeClicks || 0) + (tr?.cardClicks || 0) > 0;
      const hasOpens = (tr?.pixelOpens || 0) > 0;

      if (filterMode === "replied") {
        return (
          adv.stage === "replied" ||
          adv.stage === "interviewing" ||
          replies > 0
        );
      }
      if (filterMode === "viewed") {
        return hasClicks || hasOpens;
      }
      return (
        (adv.stage !== "drafting" && adv.stage !== "ready") ||
        replies > 0 ||
        Boolean(adv.lastSentAt) ||
        hasClicks ||
        hasOpens
      );
    });

    const sourceList =
      filterMode === "all" && active.length === 0 ? bootstrap.advisors : active;

    return [...sourceList].sort((a, b) => {
      const aUnread = unreadAdvisorIds.has(a.id) ? 1 : 0;
      const bUnread = unreadAdvisorIds.has(b.id) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;

      const aTime =
        summaries[a.id]?.lastActivityAt ||
        a.lastSentAt ||
        a.updatedAt;
      const bTime =
        summaries[b.id]?.lastActivityAt ||
        b.lastSentAt ||
        b.updatedAt;
      return bTime.localeCompare(aTime);
    });
  }, [
    bootstrap.advisors,
    bootstrap.replyCounts,
    filterMode,
    summaries,
    unreadAdvisorIds,
  ]);

  const activeAdvisor = useMemo<Advisor | null>(() => {
    if (selectedAdvisorId) {
      const exact = bootstrap.advisors.find((a) => a.id === selectedAdvisorId);
      if (exact) return exact;
    }
    return sortedAdvisors[0] || bootstrap.advisors[0] || null;
  }, [bootstrap.advisors, selectedAdvisorId, sortedAdvisors]);

  // 选中含未读回信的导师时自动消红点一次
  useEffect(() => {
    if (!activeAdvisor) return;
    if (!unreadAdvisorIds.has(activeAdvisor.id)) {
      markedReadRef.current.delete(activeAdvisor.id);
      return;
    }
    if (markedReadRef.current.has(activeAdvisor.id)) return;
    markedReadRef.current.add(activeAdvisor.id);

    workerApi
      .markRepliesRead({ advisorId: activeAdvisor.id })
      .then(() => queryClient.invalidateQueries({ queryKey: ["bootstrap"] }))
      .catch(() => {
        markedReadRef.current.delete(activeAdvisor.id);
      });
  }, [activeAdvisor, queryClient, unreadAdvisorIds]);

  const threadQuery = useQuery({
    queryKey: ["mail-thread", activeAdvisor?.id || "none"],
    enabled: Boolean(activeAdvisor?.id),
    queryFn: () => workerApi.getMailThread(activeAdvisor!.id, false),
  });

  const messages: MailMessage[] = threadQuery.data?.messages || [];
  const latestInbound = useMemo(() => {
    return [...messages].reverse().find((m) => m.direction === "inbound") || null;
  }, [messages]);

  // 切换导师时初始化默认回复主题与账号
  useEffect(() => {
    if (!activeAdvisor) return;
    const baseSubj =
      latestInbound?.subject ||
      messages[messages.length - 1]?.subject ||
      `请教${activeAdvisor.name}老师博士招生事宜`;
    setReplySubject(baseSubj.startsWith("Re:") ? baseSubj : `Re: ${baseSubj}`);
    setReplyBody("");
    setQuotedMsgId(latestInbound?.messageId || "");
    const defaultAcc =
      bootstrap.mailAccounts.find((a) => a.id === activeAdvisor.assignedAccountId) ||
      bootstrap.mailAccounts.find((a) => a.enabled) ||
      bootstrap.mailAccounts[0];
    setReplyAccountId(defaultAcc?.id || "");
  }, [activeAdvisor?.id]);

  // 当同一导师的线程加载完成后，补全默认引用首封未读回信的 subject / messageId
  useEffect(() => {
    if (!latestInbound) return;
    if (!quotedMsgId) {
      setQuotedMsgId(latestInbound.messageId || "");
    }
    if (!replySubject || replySubject.startsWith("请教")) {
      const subj = latestInbound.subject || "";
      if (subj) {
        setReplySubject(subj.startsWith("Re:") ? subj : `Re: ${subj}`);
      }
    }
  }, [latestInbound?.id]);

  const syncMutation = useMutation({
    mutationFn: () => workerApi.syncReplies(),
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        activeAdvisor
          ? queryClient.invalidateQueries({
              queryKey: ["mail-thread", activeAdvisor.id],
            })
          : Promise.resolve(),
      ]);
      if (res.skipped || res.busy) {
        toast.info(res.reason || "暂无可用的 IMAP 邮箱账号或正在同步中");
        return;
      }
      if (res.newReplies.length > 0) {
        toast.success(`IMAP 同步完成，发现 ${res.newReplies.length} 封新回信`);
      } else if (res.errors.length > 0) {
        toast.warning(`部分账号同步异常：${res.errors[0]}`);
      } else {
        toast.success("IMAP 同步完成，当前暂无新增回信");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const aiReplyMutation = useMutation({
    mutationFn: () => {
      if (!activeAdvisor) throw new Error("请先选择导师");
      const latestText = latestInbound
        ? `发件人：${latestInbound.fromName || latestInbound.fromEmail}\n主题：${latestInbound.subject}\n正文：\n${latestInbound.body}`
        : "老师尚未回复或暂无引用来信，请写一封礼貌跟进确认信。";
      return cloudApi.chat({
        advisorId: activeAdvisor.id,
        actionMode: "reply_followup",
        userMessage:
          "请基于我和导师的历史往来与我的个人科研背景，帮我撰写一封得体、精准回应老师关切并推进下一步交流的回复草稿。",
        currentSubject: replySubject,
        currentBody: replyBody,
        currentHook: activeAdvisor.hookNote,
        latestReply: latestText,
      });
    },
    onSuccess: (res) => {
      if (res.assistantMessage.suggestedSubject) {
        setReplySubject(res.assistantMessage.suggestedSubject);
      }
      if (res.assistantMessage.suggestedBody) {
        setReplyBody(res.assistantMessage.suggestedBody);
      } else if (res.assistantMessage.content) {
        setReplyBody(res.assistantMessage.content);
      }
      toast.success("Cue 已为你起草跟进回复，请审阅后发送");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeAdvisor) throw new Error("请先选择导师");
      if (!activeAdvisor.email.trim()) {
        throw new Error("该导师暂无邮箱地址，请先补充邮箱");
      }
      if (!replyAccountId) {
        throw new Error("请先选择发件邮箱账号");
      }
      if (!replySubject.trim() || !replyBody.trim()) {
        throw new Error("请填写回复主题与正文");
      }
      const defaultResume =
        bootstrap.resumes.find((r) => r.isDefault) || bootstrap.resumes[0];
      return workerApi.sendSingleMail({
        advisorId: activeAdvisor.id,
        toEmail: activeAdvisor.email.trim(),
        subject: replySubject.trim(),
        body: replyBody.trim(),
        accountId: replyAccountId,
        inReplyTo: quotedMsgId || undefined,
        references: quotedMsgId || undefined,
        includeAttachment,
        resumeId: includeAttachment ? defaultResume?.id || null : null,
      });
    },
    onSuccess: async () => {
      setReplyBody("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        activeAdvisor
          ? queryClient.invalidateQueries({
              queryKey: ["mail-thread", activeAdvisor.id],
            })
          : Promise.resolve(),
      ]);
      triggerCelebration(`已成功回复 ${activeAdvisor?.name || "导师"}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function renderFeedSummary(adv: Advisor) {
    const tr: TrackingSummary | undefined = summaries[adv.id];
    const replies = bootstrap.replyCounts[adv.id] || 0;
    const isUnread = unreadAdvisorIds.has(adv.id);

    if (isUnread) {
      return {
        tone: "text-[#FF5C35] font-medium",
        text: "收到新回信 · 点击查看全文并拟回复",
      };
    }
    if (replies > 0) {
      return {
        tone: "text-emerald-700 font-medium",
        text: `往来 ${replies} 轮回信 · ${STAGE_STYLES[adv.stage].label}`,
      };
    }
    if (tr && (tr.resumeClicks > 0 || tr.cardClicks > 0)) {
      const readHint = tr.resumeReadSec > 0 ? ` · 阅读 ${tr.resumeReadSec}s` : "";
      return {
        tone: "text-emerald-700",
        text: `点击在线简历 ${tr.resumeClicks} 次 / 联系卡 ${tr.cardClicks} 次${readHint}`,
      };
    }
    if (tr && tr.pixelOpens > 0) {
      return {
        tone: "text-[#334155]",
        text: `检测到真实开信 ${tr.pixelOpens} 次`,
      };
    }
    if (adv.lastSentAt) {
      return {
        tone: "text-[#64748B]",
        text: `已于 ${formatShortTime(adv.lastSentAt)} 发出，等待查收`,
      };
    }
    return {
      tone: "text-[#94A3B8]",
      text: "暂未建立真实邮件往来",
    };
  }

  const activeSummary = activeAdvisor ? summaries[activeAdvisor.id] : undefined;
  const activeInst = activeAdvisor
    ? instMap.get(activeAdvisor.institutionId) || "目标院校"
    : "";

  return (
    <div className="max-w-[1240px] w-full mx-auto px-4 md:px-6 py-3.5 md:py-4 md:h-[calc(100vh-76px)] md:min-h-[620px] flex flex-col gap-3.5">
      {/* 顶部栏：简洁标题 + 筛选胶囊 + IMAP 同步按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight text-[#0F172A]">
            往来动态
          </h1>
          <p className="text-[12px] text-[#64748B] mt-0.5">
            双轨追踪点击停留与 IMAP 真实回信，随时接续深度沟通
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center p-1 rounded-full bg-white hairline">
            {(
              [
                { key: "all", label: "全部" },
                { key: "replied", label: "已回信" },
                { key: "viewed", label: "被查看" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilterMode(opt.key)}
                className={cn(
                  "px-3 py-1 rounded-full text-[12px] font-medium cursor-pointer transition-all whitespace-nowrap",
                  filterMode === opt.key
                    ? "bg-[#141417] text-white"
                    : "text-[#475569] hover:text-[#0F172A]"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <Button
            variant="primary"
            size="sm"
            loading={syncMutation.isPending}
            className="whitespace-nowrap shrink-0"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => syncMutation.mutate()}
          >
            同步 IMAP 回信
          </Button>
        </div>
      </div>

      {/* 主体统一左右分栏单卡容器 */}
      {bootstrap.advisors.length === 0 ? (
        <div className="card-surface rounded-[24px] p-10 flex flex-col items-center justify-center text-center flex-1">
          <EmptyDeskIllustration
            title="尚未收录任何联系中的导师"
            subtitle="请先前往「发现导师」挑选心仪教授并加入「我的导师」，发出第一封信后即可在此实时追踪阅读与回信。"
          />
          <Button
            variant="primary"
            size="md"
            onClick={() => setActiveTab("discover")}
          >
            前往发现导师
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "card-surface rounded-[24px] overflow-hidden flex-1 min-h-0 grid",
            sidebarCollapsed
              ? "grid-cols-1 md:grid-rows-[minmax(0,1fr)]"
              : "grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[330px_minmax(0,1fr)]"
          )}
        >
          {/* 左侧：动态导师线索列表（桌面端可收起，移动端切列表/详情） */}
          <aside
            className={cn(
              "flex-col min-h-0 md:border-r border-slate-100 bg-[#FAFAFB]/55",
              sidebarCollapsed
                ? mobilePane === "detail"
                  ? "hidden"
                  : "flex md:hidden"
                : mobilePane === "detail"
                  ? "hidden md:flex"
                  : "flex"
            )}
          >
            <div className="px-4 h-14 shrink-0 hairline-b bg-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-bold text-[#0F172A] truncate">
                  联系线索 ({sortedAdvisors.length})
                </span>
                {bootstrap.unreadReplies.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-[#FF5C35] text-white shrink-0">
                    {bootstrap.unreadReplies.length} 未读
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="收起联系线索"
                aria-label="收起联系线索"
                className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-[260px]">
              {sortedAdvisors.length === 0 ? (
                <div className="py-10 px-4 text-center text-[12.5px] text-[#64748B]">
                  当前筛选下暂无导师记录，试试切回「全部」。
                </div>
              ) : (
                sortedAdvisors.map((adv) => {
                  const selected = activeAdvisor?.id === adv.id;
                  const isUnread = unreadAdvisorIds.has(adv.id);
                  const inst = instMap.get(adv.institutionId) || "目标院校";
                  const info = renderFeedSummary(adv);
                  const latestTs =
                    summaries[adv.id]?.lastActivityAt || adv.lastSentAt;

                  return (
                    <div
                      key={adv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedAdvisorId(adv.id);
                        setMobilePane("detail");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedAdvisorId(adv.id);
                          setMobilePane("detail");
                        }
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-[16px] transition-all cursor-pointer border flex items-start gap-3 outline-none",
                        selected
                          ? "bg-white border-[var(--accent-border)] shadow-[0_6px_18px_-10px_var(--accent-shadow)]"
                          : "bg-transparent border-transparent hover:bg-white/80 hover:border-slate-200/70"
                      )}
                    >
                      <AdvisorPhotoAvatar
                        compact
                        name={adv.name}
                        school={inst}
                        dept={adv.dept}
                        title={adv.title}
                        seed={adv.id}
                        styleMode={avatarStyle}
                        photoUrl={adv.photoUrl}
                        photoSource={adv.photoSource}
                        homepageUrl={adv.homepageUrl}
                        unread={isUnread}
                        onOpenPhoto={() =>
                          setPhotoModalData({
                            name: adv.name,
                            school: inst,
                            dept: adv.dept,
                            title: adv.title,
                            homepageUrl: adv.homepageUrl,
                            photoUrl: adv.photoUrl || "",
                            photoSource: adv.photoSource || "",
                            advisorId: adv.id,
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13.5px] font-bold text-[#0F172A] truncate">
                              {adv.name}
                            </span>
                            {isUnread && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#FF5C35] text-white shrink-0">
                                新
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#94A3B8] shrink-0 whitespace-nowrap cue-mono">
                            {latestTs ? formatShortTime(latestTs) : "—"}
                          </span>
                        </div>
                        <div className="text-[11.5px] text-[#64748B] truncate mt-0.5">
                          {inst}
                          {adv.dept ? ` · ${adv.dept}` : ""}
                        </div>
                        <div className={cn("text-[11.5px] truncate mt-1", info.tone)}>
                          {info.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* 右侧：等高详情抬头 + 双轨细条 + 邮件往来流 + 底部停靠快捷回复 */}
          {activeAdvisor && (
            <section
              className={cn(
                "flex flex-col min-h-0 bg-white",
                mobilePane === "list" && "hidden md:flex"
              )}
            >
              {/* 导师往来抬头：h-14 与左栏完全齐平 */}
              <div className="px-4 md:px-5 h-14 shrink-0 hairline-b bg-white flex items-center justify-between gap-2 md:gap-3">
                <div className="flex items-center gap-2 md:gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobilePane("list")}
                    className="md:hidden inline-flex items-center gap-0.5 h-8 px-2.5 rounded-full bg-[#FAFAFB] hairline text-[12px] font-medium text-[#0F172A] cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>线索</span>
                  </button>

                  {sidebarCollapsed && (
                    <button
                      type="button"
                      onClick={() => setSidebarCollapsed(false)}
                      title="展开联系线索"
                      aria-label="展开联系线索"
                      className="hidden md:inline-flex relative w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
                    >
                      <PanelLeftOpen className="w-4 h-4" />
                      {bootstrap.unreadReplies.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#FF5C35]" />
                      )}
                    </button>
                  )}

                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15.5px] font-bold text-[#0F172A] shrink-0">
                      {activeAdvisor.name}
                    </h2>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10.5px] font-medium border shrink-0 whitespace-nowrap",
                        STAGE_STYLES[activeAdvisor.stage].badgeClass
                      )}
                    >
                      {STAGE_STYLES[activeAdvisor.stage].label}
                    </span>
                    <span className="hidden sm:inline text-[12px] text-[#64748B] truncate min-w-0">
                      {activeInst}
                      {activeAdvisor.email ? ` · ${activeAdvisor.email}` : ""}
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="xs"
                  className="shrink-0 whitespace-nowrap"
                  icon={<Mail className="w-3.5 h-3.5" />}
                  onClick={() => openWriterFor(activeAdvisor.id)}
                >
                  去写信工坊
                </Button>
              </div>

              {/* 紧凑单行双轨追踪指标条 */}
              <div className="px-5 py-2.5 shrink-0 hairline-b bg-[#FAFAFB]/60 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-[#334155]">
                  <MousePointerClick className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  简历点击
                  <strong className="text-[#0F172A] cue-mono">
                    {activeSummary?.resumeClicks ?? 0}
                  </strong>
                  次
                </span>

                <span className="inline-flex items-center gap-1.5 text-[#334155]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  阅读停留
                  <strong className="text-[#0F172A] cue-mono">
                    {activeSummary?.resumeReadSec ?? 0}s
                  </strong>
                  · 联系卡
                  <strong className="text-[#0F172A] cue-mono">
                    {activeSummary?.cardClicks ?? 0}
                  </strong>
                  次
                </span>

                <span className="inline-flex items-center gap-1.5 text-[#334155]">
                  <Eye className="w-3.5 h-3.5 theme-text shrink-0" />
                  真实开信
                  <strong className="text-[#0F172A] cue-mono">
                    {activeSummary?.pixelOpens ?? 0}
                  </strong>
                  次
                </span>

                <span className="inline-flex items-center gap-1.5 text-[#64748B]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
                  已过滤代理预取
                  <strong className="cue-mono">
                    {activeSummary?.suspectedBotOpens ?? 0}
                  </strong>
                  次
                </span>

                {threadQuery.isFetching && (
                  <span className="ml-auto text-[11.5px] text-[#94A3B8]">
                    刷新记录中...
                  </span>
                )}
              </div>

              {/* 可滚动邮件往来历史 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[180px]">
                {messages.length === 0 ? (
                  <div className="card-well p-6 text-center text-[12.5px] text-[#64748B]">
                    尚未查询到与 {activeAdvisor.name} 老师的邮件收发记录。
                    可先在「写信工坊」发送首封信件，或点击右上角同步 IMAP 回信。
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isInbound = msg.direction === "inbound";
                    const intentMeta = msg.replyIntent
                      ? REPLY_INTENT_BADGES[msg.replyIntent]
                      : null;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "rounded-[16px] p-4 border transition-colors",
                          isInbound
                            ? "bg-emerald-50/45 border-emerald-200/80"
                            : "bg-[#FAFAFB] border-slate-200/80"
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0",
                                isInbound
                                  ? "bg-emerald-600 text-white"
                                  : "bg-[#141417] text-white"
                              )}
                            >
                              {isInbound ? "导师来信" : "我方发出"}
                            </span>
                            <span className="text-[12px] font-medium text-[#0F172A] truncate">
                              {isInbound
                                ? `${msg.fromName || activeAdvisor.name} <${msg.fromEmail}>`
                                : `发往 ${msg.toEmail}`}
                            </span>
                            {isInbound && intentMeta && (
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10.5px] font-medium border shrink-0",
                                  intentMeta.className
                                )}
                              >
                                {intentMeta.label}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#64748B] shrink-0 whitespace-nowrap cue-mono">
                            {formatShortTime(msg.sentOrReceivedAt)}
                          </span>
                        </div>

                        <div className="text-[13.5px] font-semibold text-[#0F172A] mb-1">
                          {msg.subject || "（无主题）"}
                        </div>

                        <div className="text-[13px] leading-[1.7] text-[#334155] whitespace-pre-wrap break-words">
                          {msg.body || "（空正文）"}
                        </div>

                        {msg.extractedTodos && msg.extractedTodos.length > 0 && (
                          <div className="mt-2.5 pt-2.5 border-t border-emerald-200/60 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold text-emerald-800">
                              识别待办：
                            </span>
                            {msg.extractedTodos.map((todo, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[11px] bg-white border border-emerald-200 text-emerald-700"
                              >
                                {todo}
                              </span>
                            ))}
                          </div>
                        )}

                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#64748B]">
                            <Paperclip className="w-3 h-3" />
                            {msg.attachments.map((att, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-full bg-white hairline"
                              >
                                {att}
                              </span>
                            ))}
                          </div>
                        )}

                        {isInbound && msg.messageId && (
                          <div className="mt-2.5 flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setQuotedMsgId(msg.messageId);
                                setReplySubject(
                                  msg.subject.startsWith("Re:")
                                    ? msg.subject
                                    : `Re: ${msg.subject}`
                                );
                                toast.info("已设为当前回复引用信件（In-Reply-To）");
                              }}
                              className="inline-flex items-center gap-1 text-[11.5px] font-medium theme-text hover:underline cursor-pointer"
                            >
                              <CornerDownRight className="w-3 h-3" />
                              引用此封回信作为线程上下文
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* 底部停靠快捷回复输入盒 */}
              <div className="px-5 py-3.5 shrink-0 hairline-t bg-[#FAFAFB]/75 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-[#0F172A]">
                    快速跟进回复
                    {quotedMsgId && (
                      <span className="ml-2 text-[11px] font-normal text-[#64748B]">
                        （携带 In-Reply-To 保持同一线索）
                      </span>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    loading={aiReplyMutation.isPending}
                    icon={<Sparkles className="w-3.5 h-3.5 theme-text" />}
                    onClick={() => aiReplyMutation.mutate()}
                  >
                    Cue 智能拟回复
                  </Button>
                </div>

                {!activeAdvisor.email.trim() && (
                  <div className="flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded-[12px] px-3 py-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    该导师尚未填写邮箱地址，无法直接发出回复。
                  </div>
                )}

                <div className="rounded-[16px] bg-white hairline p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[185px_minmax(0,1fr)] gap-2">
                    <select
                      value={replyAccountId}
                      onChange={(e) => setReplyAccountId(e.target.value)}
                      className="min-w-0 h-8 px-2.5 rounded-[12px] bg-[#FAFAFB] hairline text-[12px] text-[#0F172A] outline-none"
                    >
                      {bootstrap.mailAccounts.length === 0 ? (
                        <option value="">请先配置发件箱</option>
                      ) : (
                        bootstrap.mailAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.label || acc.email}
                          </option>
                        ))
                      )}
                    </select>

                    <input
                      type="text"
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      placeholder="回复邮件主题..."
                      className="min-w-0 h-8 px-2.5 rounded-[12px] bg-[#FAFAFB] hairline text-[12px] text-[#0F172A] outline-none"
                    />
                  </div>

                  <textarea
                    rows={3}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`撰写给 ${activeAdvisor.name} 老师的跟进回复内容，或点击右上角「Cue 智能拟回复」...`}
                    className="w-full text-[13px] leading-[1.6] text-[#0F172A] placeholder:text-[#94A3B8] border-0 bg-transparent outline-none resize-none"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 hairline-t">
                    <BaseSwitch
                      checked={includeAttachment}
                      onCheckedChange={setIncludeAttachment}
                      label="附带默认个人简历 PDF"
                    />

                    <Button
                      variant="primary"
                      size="xs"
                      loading={sendMutation.isPending}
                      disabled={!activeAdvisor.email.trim() || !replyAccountId}
                      className="shrink-0 whitespace-nowrap"
                      icon={<Send className="w-3.5 h-3.5" />}
                      onClick={() => sendMutation.mutate()}
                    >
                      发送回复
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
