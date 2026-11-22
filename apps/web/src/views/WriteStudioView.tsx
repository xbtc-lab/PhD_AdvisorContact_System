import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import type { Advisor, BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ConfirmDialog } from "@/components/ui/BaseDialog.js";
import { EmptyDeskIllustration } from "@/components/ui/BrandMascot.js";
import { AgentChatPane } from "./write/AgentChatPane.js";
import { HtmlEmailPreview } from "./write/HtmlEmailPreview.js";
import { ManualEditorPane } from "./write/ManualEditorPane.js";

export interface WriteStudioViewProps {
  bootstrap: BootstrapData;
  advisor: Advisor | null;
}

/**
 * 视图 3：写信工坊总控（目标导师快切条 + 左栏 Agent⇄手动 + 右栏 HTML 邮件实景渲染与发信）。
 */
export function WriteStudioView({ bootstrap, advisor }: WriteStudioViewProps) {
  const queryClient = useQueryClient();
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const setSelfTestOpen = useAppStore((s) => s.setSelfTestOpen);
  const setContactCardOpen = useAppStore((s) => s.setContactCardOpen);
  const triggerCelebration = useAppStore((s) => s.triggerCelebration);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [writerMode, setWriterMode] = useState<"agent" | "manual">("agent");
  const [paneLayout, setPaneLayout] = useState<"split" | "preview-only" | "editor-only">("split");
  const [mobilePane, setMobilePane] = useState<"editor" | "preview">("editor");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [hookNote, setHookNote] = useState("");
  const [resumeChoice, setResumeChoice] = useState("default");
  const [accountChoice, setAccountChoice] = useState("auto");
  const [templateStyle, setTemplateStyle] = useState<"editorial" | "classic">("editorial");
  const [embedContactCard, setEmbedContactCard] = useState(true);
  const [saveLabel, setSaveLabel] = useState<"idle" | "saving" | "saved">("idle");
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  const knownUpdatedAtRef = useRef("");
  const currentAdvisorIdRef = useRef("");
  const debounceTimerRef = useRef<number | null>(null);

  const draftQuery = useQuery({
    queryKey: ["draft", advisor?.id],
    queryFn: () => workerApi.getDraft(advisor!.id),
    enabled: Boolean(advisor?.id),
  });

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
      setHookNote(advisor.hookNote || "");
      setSaveLabel("idle");
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    }
  }, [advisor]);

  useEffect(() => {
    const data = draftQuery.data;
    if (!data || !advisor || data.draft.advisorId !== advisor.id) return;
    if (knownUpdatedAtRef.current !== data.draft.updatedAt) {
      knownUpdatedAtRef.current = data.draft.updatedAt;
      setSubject(data.draft.subject);
      setBody(data.draft.body);
      setHookNote(data.draft.selectedHook || advisor.hookNote || "");
      setAccountChoice(data.draft.preferredAccountId || advisor.assignedAccountId || "auto");
      setTemplateStyle(data.draft.templateStyle || "editorial");
      setEmbedContactCard(data.draft.embedContactCard ?? true);
      if (data.draft.resumeId === "__none__") setResumeChoice("none");
      else if (data.draft.resumeId) setResumeChoice(data.draft.resumeId);
      else setResumeChoice("default");
    }
  }, [draftQuery.data, advisor]);

  const saveDraftMutation = useMutation({
    mutationFn: async (params: {
      advisorId: string;
      subj: string;
      bd: string;
      hk: string;
      resId: string | null;
      accId: string;
      tpl: "editorial" | "classic";
      embedCard: boolean;
      createRevision?: boolean;
      revisionSource?: "manual" | "template" | "ai" | "restore";
    }) => {
      const res = await workerApi.saveDraft(params.advisorId, {
        subject: params.subj,
        body: params.bd,
        selectedHook: params.hk,
        resumeId: params.resId,
        preferredAccountId: params.accId,
        templateStyle: params.tpl,
        embedContactCard: params.embedCard,
        createRevision: params.createRevision ?? false,
        revisionSource: params.revisionSource ?? "manual",
      });
      await workerApi.updateAdvisor(params.advisorId, {
        hookNote: params.hk,
        assignedAccountId: params.accId,
      });
      return res;
    },
    onSuccess: (res, vars) => {
      knownUpdatedAtRef.current = res.draft.updatedAt;
      queryClient.setQueryData(["draft", vars.advisorId], res);
      setSaveLabel("saved");
    },
    onError: (err: Error) => {
      setSaveLabel("idle");
      toast.error(err.message);
    },
  });

  function resolveResumeParam(choice: string): string | null {
    if (choice === "none") return "__none__";
    if (choice === "default") return null;
    return choice;
  }

  function scheduleAutosave(next: {
    subj: string;
    bd: string;
    hk: string;
    resChoice: string;
    accChoice: string;
    tpl: "editorial" | "classic";
    embedCard: boolean;
  }) {
    if (!advisor) return;
    setSaveLabel("saving");
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    const advId = advisor.id;
    debounceTimerRef.current = window.setTimeout(() => {
      saveDraftMutation.mutate({
        advisorId: advId,
        subj: next.subj,
        bd: next.bd,
        hk: next.hk,
        resId: resolveResumeParam(next.resChoice),
        accId: next.accChoice,
        tpl: next.tpl,
        embedCard: next.embedCard,
      });
    }, 650);
  }

  const generateMutation = useMutation({
    mutationFn: () => workerApi.generateTemplateDraft(advisor!.id, hookNote),
    onSuccess: (res) => {
      setSubject(res.subject);
      setBody(res.body);
      saveDraftMutation.mutate({
        advisorId: advisor!.id,
        subj: res.subject,
        bd: res.body,
        hk: hookNote,
        resId: resolveResumeParam(resumeChoice),
        accId: accountChoice,
        tpl: templateStyle,
        embedCard: embedContactCard,
        createRevision: true,
        revisionSource: "template",
      });
      toast.success("已按学术信纸模板生成草稿");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (revId: string) => workerApi.restoreDraftRevision(advisor!.id, revId),
    onSuccess: (res) => {
      knownUpdatedAtRef.current = res.draft.updatedAt;
      setSubject(res.draft.subject);
      setBody(res.draft.body);
      queryClient.setQueryData(["draft", advisor!.id], res);
      toast.success("已恢复到选定历史快照");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveDraftBoxMutation = useMutation({
    mutationFn: () => {
      if (!advisor) throw new Error("请先选择导师");
      if (!advisor.email.includes("@")) throw new Error("该导师尚未填写有效邮箱");
      return workerApi.saveMailDraftBox({
        toEmail: advisor.email,
        subject: subject.trim() || "博士申请自荐",
        body,
        accountId: accountChoice,
        resumeId:
          resumeChoice === "none" ? "__none__" : resumeChoice === "default" ? null : resumeChoice,
      });
    },
    onSuccess: () => toast.success("已同步存入发件箱 IMAP 草稿箱"),
    onError: (err: Error) => toast.error(err.message),
  });

  const sendMailMutation = useMutation({
    mutationFn: () => {
      if (!advisor) throw new Error("请先选择导师");
      if (!advisor.email.includes("@")) throw new Error("该导师尚未填写有效邮箱");
      if (!subject.trim() || !body.trim()) throw new Error("主题和正文不能为空");
      return workerApi.sendSingleMail({
        advisorId: advisor.id,
        toEmail: advisor.email,
        subject: subject.trim(),
        body,
        accountId: accountChoice,
        includeAttachment: resumeChoice !== "none",
        resumeId: resumeChoice === "none" || resumeChoice === "default" ? null : resumeChoice,
      });
    },
    onSuccess: async () => {
      setConfirmSendOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["thread", advisor?.id] }),
      ]);
      triggerCelebration(`邮件已发出致 ${advisor?.name} 老师`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!advisor) {
    return (
      <div className="flex-1 px-8 py-12 max-w-[1140px] w-full mx-auto">
        <div className="card-surface rounded-[24px] p-10">
          <EmptyDeskIllustration
            title="请先选择一位要写信的导师"
            subtitle="你可以从「发现导师」库一键收录，或在「我的导师」中点选目标导师进入写信工坊"
          />
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className="theme-cta px-5 py-2 rounded-full text-[12.5px] font-semibold border-0 cursor-pointer"
            >
              浏览发现导师库 →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latestInbound = (threadQuery.data?.messages || [])
    .filter((m) => m.direction === "inbound")
    .slice(-1)[0];

  const modeSwitcher = (
    <div className="p-0.5 rounded-full bg-slate-900/[0.06] inline-flex items-center shrink-0">
      <button
        type="button"
        onClick={() => setWriterMode("agent")}
        className={cn(
          "px-3 py-1 rounded-full text-[12px] cursor-pointer border-0 transition-all whitespace-nowrap",
          writerMode === "agent"
            ? "bg-[#141417] text-white font-semibold"
            : "text-[#475569] bg-transparent font-medium hover:text-[#0F172A]"
        )}
      >
        Agent 协作
      </button>
      <button
        type="button"
        onClick={() => setWriterMode("manual")}
        className={cn(
          "px-3 py-1 rounded-full text-[12px] cursor-pointer border-0 transition-all whitespace-nowrap",
          writerMode === "manual"
            ? "bg-[#141417] text-white font-semibold"
            : "text-[#475569] bg-transparent font-medium hover:text-[#0F172A]"
        )}
      >
        手动直编
      </button>
    </div>
  );

  const leftPaneToggleButton =
    paneLayout === "split" ? (
      <button
        type="button"
        onClick={() => setPaneLayout("preview-only")}
        title="收起左侧写作栏，全宽预览邮件"
        aria-label="收起左侧写作栏"
        className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
      >
        <PanelLeftClose className="w-4 h-4" />
      </button>
    ) : paneLayout === "editor-only" ? (
      <button
        type="button"
        onClick={() => setPaneLayout("split")}
        title="恢复双栏，展开右侧邮件预览"
        aria-label="展开右侧邮件预览"
        className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
      >
        <PanelRightOpen className="w-4 h-4" />
      </button>
    ) : null;

  const leftPaneVisibility =
    paneLayout === "preview-only"
      ? mobilePane === "preview"
        ? "hidden"
        : "flex md:hidden"
      : mobilePane === "preview"
        ? "hidden md:flex"
        : "flex";

  const rightPaneVisibility =
    paneLayout === "editor-only"
      ? mobilePane === "editor"
        ? "hidden"
        : "flex md:hidden"
      : mobilePane === "editor"
        ? "hidden md:flex"
        : "flex";

  return (
    <div className="max-w-[1240px] w-full mx-auto px-4 md:px-6 py-3.5 md:py-4 md:h-[calc(100vh-76px)] md:min-h-[620px] flex flex-col gap-3.5">
      {/* 顶部目标导师快捷切换条 */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0 max-w-full">
          <span className="text-[12px] font-medium text-[#64748B] mr-1 shrink-0">
            写信对象：
          </span>
          {bootstrap.advisors.map((a) => {
            const active = a.id === advisor.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAdvisorId(a.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-[12px] cursor-pointer transition-all whitespace-nowrap shrink-0",
                  active
                    ? "bg-[#141417] text-white font-semibold border-0"
                    : "bg-white hairline text-[#475569] font-medium theme-hover-border"
                )}
              >
                {a.name} · {a.institutionName}
              </button>
            );
          })}
        </div>

        <span className="text-[11.5px] text-[#94A3B8] cue-mono shrink-0 whitespace-nowrap">
          {saveLabel === "saving"
            ? "自动保存草稿中..."
            : saveLabel === "saved"
              ? "草稿已自动落库"
              : "实时双向联动预览"}
        </span>
      </div>

      {/* 移动端视图切换胶囊（仅 < md 显示） */}
      <div className="md:hidden grid grid-cols-2 gap-1 p-1 rounded-full bg-white hairline shrink-0">
        <button
          type="button"
          onClick={() => setMobilePane("editor")}
          className={cn(
            "py-1.5 rounded-full text-[12px] border-0 cursor-pointer transition-all",
            mobilePane === "editor"
              ? "bg-[#141417] text-white font-semibold"
              : "bg-transparent text-[#475569] font-medium"
          )}
        >
          写作 / Agent
        </button>
        <button
          type="button"
          onClick={() => setMobilePane("preview")}
          className={cn(
            "py-1.5 rounded-full text-[12px] border-0 cursor-pointer transition-all",
            mobilePane === "preview"
              ? "bg-[#141417] text-white font-semibold"
              : "bg-transparent text-[#475569] font-medium"
          )}
        >
          邮件预览与发送
        </button>
      </div>

      {/* 主分栏工作区：桌面支持自由收起左栏或右栏，移动端按选项卡独占呈现 */}
      <div
        className={cn(
          "flex-1 min-h-0 grid gap-5",
          paneLayout === "split"
            ? "grid-cols-1 md:grid-cols-[410px_minmax(0,1fr)] lg:grid-cols-[460px_minmax(0,1fr)]"
            : "grid-cols-1 md:grid-rows-[minmax(0,1fr)]"
        )}
      >
        <div
          className={cn(
            "card-surface rounded-[24px] flex-col overflow-hidden min-h-0",
            leftPaneVisibility
          )}
        >
          {writerMode === "agent" ? (
            <AgentChatPane
              bootstrap={bootstrap}
              advisor={advisor}
              subject={subject}
              body={body}
              hookNote={hookNote}
              latestReplyText={latestInbound?.body || ""}
              embedContactCard={embedContactCard}
              modeSwitcher={modeSwitcher}
              paneToggleButton={leftPaneToggleButton}
              onToggleEmbedCard={() => {
                const next = !embedContactCard;
                setEmbedContactCard(next);
                scheduleAutosave({
                  subj: subject,
                  bd: body,
                  hk: hookNote,
                  resChoice: resumeChoice,
                  accChoice: accountChoice,
                  tpl: templateStyle,
                  embedCard: next,
                });
              }}
              onApplySuggestion={(patch) => {
                const nextSubj = patch.subject ?? subject;
                const nextBody = patch.body ?? body;
                const nextHook = patch.hook ?? hookNote;
                setSubject(nextSubj);
                setBody(nextBody);
                setHookNote(nextHook);
                saveDraftMutation.mutate({
                  advisorId: advisor.id,
                  subj: nextSubj,
                  bd: nextBody,
                  hk: nextHook,
                  resId: resolveResumeParam(resumeChoice),
                  accId: accountChoice,
                  tpl: templateStyle,
                  embedCard: embedContactCard,
                  createRevision: true,
                  revisionSource: "ai",
                });
              }}
            />
          ) : (
            <ManualEditorPane
              subject={subject}
              body={body}
              hookNote={hookNote}
              revisions={draftQuery.data?.revisions || []}
              generatingTemplate={generateMutation.isPending}
              restoringRev={restoreMutation.isPending}
              modeSwitcher={modeSwitcher}
              paneToggleButton={leftPaneToggleButton}
              onChangeSubject={(val) => {
                setSubject(val);
                scheduleAutosave({
                  subj: val,
                  bd: body,
                  hk: hookNote,
                  resChoice: resumeChoice,
                  accChoice: accountChoice,
                  tpl: templateStyle,
                  embedCard: embedContactCard,
                });
              }}
              onChangeBody={(val) => {
                setBody(val);
                scheduleAutosave({
                  subj: subject,
                  bd: val,
                  hk: hookNote,
                  resChoice: resumeChoice,
                  accChoice: accountChoice,
                  tpl: templateStyle,
                  embedCard: embedContactCard,
                });
              }}
              onChangeHook={(val) => {
                setHookNote(val);
                scheduleAutosave({
                  subj: subject,
                  bd: body,
                  hk: val,
                  resChoice: resumeChoice,
                  accChoice: accountChoice,
                  tpl: templateStyle,
                  embedCard: embedContactCard,
                });
              }}
              onGenerateTemplate={() => generateMutation.mutate()}
              onRestoreRevision={(revId) => restoreMutation.mutate(revId)}
            />
          )}
        </div>

        <HtmlEmailPreview
          className={rightPaneVisibility}
          leftHeaderAction={
            paneLayout === "preview-only" ? (
              <button
                type="button"
                onClick={() => setPaneLayout("split")}
                title="展开左侧写作栏"
                aria-label="展开左侧写作栏"
                className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            ) : null
          }
          rightHeaderAction={
            paneLayout === "split" ? (
              <button
                type="button"
                onClick={() => setPaneLayout("editor-only")}
                title="收起右侧邮件预览，专注写作"
                aria-label="收起右侧邮件预览"
                className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            ) : null
          }
          bootstrap={bootstrap}
          advisor={advisor}
          subject={subject}
          body={body}
          accountChoice={accountChoice}
          resumeChoice={resumeChoice}
          templateStyle={templateStyle}
          embedContactCard={embedContactCard}
          savingDraftBox={saveDraftBoxMutation.isPending}
          sendingNow={sendMailMutation.isPending}
          onChangeAccount={(val) => {
            setAccountChoice(val);
            scheduleAutosave({
              subj: subject,
              bd: body,
              hk: hookNote,
              resChoice: resumeChoice,
              accChoice: val,
              tpl: templateStyle,
              embedCard: embedContactCard,
            });
          }}
          onChangeResume={(val) => {
            setResumeChoice(val);
            scheduleAutosave({
              subj: subject,
              bd: body,
              hk: hookNote,
              resChoice: val,
              accChoice: accountChoice,
              tpl: templateStyle,
              embedCard: embedContactCard,
            });
          }}
          onChangeTemplateStyle={(tpl) => {
            setTemplateStyle(tpl);
            scheduleAutosave({
              subj: subject,
              bd: body,
              hk: hookNote,
              resChoice: resumeChoice,
              accChoice: accountChoice,
              tpl,
              embedCard: embedContactCard,
            });
          }}
          onOpenContactCard={() => setContactCardOpen(true)}
          onOpenSelfTest={() => setSelfTestOpen(true)}
          onSaveToDraftBox={() => saveDraftBoxMutation.mutate()}
          onRequestSend={() => setConfirmSendOpen(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmSendOpen}
        onOpenChange={setConfirmSendOpen}
        title={`确认立即发送给 ${advisor.name} 老师？`}
        description={`收件邮箱：${advisor.email || "未填写"} · 主题：${subject || "（未填写）"}`}
        confirmLabel="确认立即发送"
        loading={sendMailMutation.isPending}
        onConfirm={() => sendMailMutation.mutate()}
      />
    </div>
  );
}
