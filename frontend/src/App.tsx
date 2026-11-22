import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { Toaster, toast } from "sonner";
import { Loader2, Mail, Send, Square } from "lucide-react";
import { Topbar } from "./components/Topbar";
import { ProfessorRail } from "./components/ProfessorRail";
import { MailStudio, type DraftFields } from "./components/MailStudio";
import { RightSidePanel } from "./components/RightSidePanel";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { DispatchDrawer } from "./components/DispatchDrawer";
import { AiImportModal, QuickAddProfModal } from "./components/AiImportModal";
import { ReplyAlertModal } from "./components/ReplyAlertModal";
import { QuickComposeModal } from "./components/QuickComposeModal";
import { SheetView } from "./components/SheetView";
import { UniversityNavigator } from "./components/UniversityNavigator";
import { CommandPalette } from "./components/CommandPalette";
import { SendCelebrationOverlay } from "./components/Mascot";
import { Button, ConfirmDialog, ModalDialog, SelectBox } from "./components/ui";
import {
  apiFetch,
  formatCountdown,
  matchesProfFilters,
  normalizeMatchTier,
  normalizeStatus,
} from "./lib/api";
import type {
  BootstrapPayload,
  FilterState,
  JobState,
  MailThreadMessage,
  Professor,
  UniversitiesPayload,
  UniversityItem,
  UnreadReplyItem,
  WorkbenchConfig,
} from "./types";

const EMPTY_FIELDS: DraftFields = {
  in_batch: "是",
  priority: "高度匹配",
  status: "待撰写",
  hook: "",
  email: "",
  assigned_sender: "自动分配",
  subject: "",
  body: "",
  note: "",
  reply_note: "",
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("读取本地 PDF 文件失败"));
    reader.readAsDataURL(file);
  });
}

function WorkspaceSkeleton() {
  return (
    <main className="flex-1 min-h-0 flex overflow-hidden animate-pulse bg-white">
      <aside className="w-[304px] shrink-0 bg-[#F8F9FB] border-r border-slate-900/[0.06] p-3 space-y-3">
        <div className="h-8 bg-white rounded-[9px]" />
        <div className="h-7 bg-[#EEF0F4] rounded-[9px]" />
        <div className="space-y-2 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-18 bg-white rounded-[12px]" />
          ))}
        </div>
      </aside>
      <section className="flex-1 p-7 space-y-4 bg-white">
        <div className="h-9 w-64 bg-[#F3F4F6] rounded-[10px]" />
        <div className="h-11 bg-[#F8F9FB] rounded-[10px]" />
        <div className="flex-1 h-[64vh] bg-[#FAFAFB] rounded-[14px]" />
      </section>
    </main>
  );
}

export default function App() {
  const [viewMode, setViewMode] = useState<"workspace" | "sheet" | "universities">("workspace");
  const [bootstrapped, setBootstrapped] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [config, setConfig] = useState<WorkbenchConfig | null>(null);
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [sheets, setSheets] = useState<string[]>([]);
  const [excelPath, setExcelPath] = useState("");
  const [quotaToday, setQuotaToday] = useState<Record<string, number>>({});
  const [job, setJob] = useState<JobState | null>(null);
  const [universities, setUniversities] = useState<UniversityItem[]>([]);
  const [univBookmarks, setUnivBookmarks] = useState<string[]>([]);
  const [aiImportSeed, setAiImportSeed] = useState<{ school?: string; pageUrl?: string }>({});

  const [unreadReplies, setUnreadReplies] = useState<UnreadReplyItem[]>([]);
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({});
  const [syncingReplies, setSyncingReplies] = useState(false);
  const [replyAlertOpen, setReplyAlertOpen] = useState(false);

  const [filters, setFilters] = useState<FilterState>({
    school: "ALL",
    matchTier: "ALL",
    status: "ALL",
    query: "",
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>(EMPTY_FIELDS);
  const [threadMessages, setThreadMessages] = useState<MailThreadMessage[]>([]);
  const [replyTarget, setReplyTarget] = useState<MailThreadMessage | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<"saved" | "saving" | "dirty">("saved");

  const [sendingSingle, setSendingSingle] = useState(false);
  const [savingDraftImap, setSavingDraftImap] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [sendCelebKey, setSendCelebKey] = useState(0);

  const [rightPanelTab, setRightPanelTab] = useState<"closed" | "ai" | "profile">("closed");
  const [settingsState, setSettingsState] = useState<{
    open: boolean;
    tab: "profile" | "ai" | "accounts";
  }>({ open: false, tab: "profile" });
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickComposeOpen, setQuickComposeOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const [testModal, setTestModal] = useState({
    open: false,
    testTo: "",
    accountId: "",
    sending: false,
  });

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }>({ open: false, title: "", message: "" });
  const confirmResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const askConfirm = useCallback(
    (opts: {
      title: string;
      message: string;
      confirmText?: string;
      cancelText?: string;
      danger?: boolean;
    }) => {
      return new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmState({ open: true, ...opts });
      });
    },
    []
  );

  function resolveConfirm(ok: boolean) {
    setConfirmState((prev) => ({ ...prev, open: false }));
    const fn = confirmResolverRef.current;
    confirmResolverRef.current = null;
    if (fn) fn(ok);
  }

  const filteredProfs = useMemo(
    () => professors.filter((p) => matchesProfFilters(p, filters)),
    [professors, filters]
  );

  const currentProf = useMemo(
    () => professors.find((p) => p.id === selectedId) || null,
    [professors, selectedId]
  );

  const latestInboundReply = useMemo(() => {
    const ins = threadMessages.filter((m) => m.direction === "inbound");
    return ins.length > 0 ? ins[ins.length - 1] : null;
  }, [threadMessages]);

  const loadProfessorDetail = useCallback(async (pid: string, markRead = true) => {
    try {
      const [detailRes, threadRes] = await Promise.all([
        apiFetch<{ ok: boolean; professor: Professor; body: string }>(
          `/api/professor/detail?id=${encodeURIComponent(pid)}`
        ),
        apiFetch<{
          ok: boolean;
          messages: MailThreadMessage[];
          unread_replies?: UnreadReplyItem[];
          reply_counts?: Record<string, number>;
        }>(`/api/mail/threads?id=${encodeURIComponent(pid)}&mark_read=${markRead ? "1" : "0"}`),
      ]);
      const p = detailRes.professor;
      setSelectedId(p.id);
      setReplyTarget(null);
      setFields({
        in_batch: p.in_batch || "是",
        priority: normalizeMatchTier(p.priority),
        status: normalizeStatus(p.status),
        hook: p.hook || "",
        email: p.email || "",
        assigned_sender: p.assigned_sender || "自动分配",
        subject: p.subject || "",
        body: detailRes.body || "",
        note: p.note || "",
        reply_note: p.reply_note || "",
      });
      setAutoSaveState("saved");
      setThreadMessages(threadRes.messages || []);
      if (threadRes.unread_replies) setUnreadReplies(threadRes.unread_replies);
      if (threadRes.reply_counts) setReplyCounts(threadRes.reply_counts);
      setProfessors((prev) => prev.map((x) => (x.id === p.id ? p : x)));
    } catch (e: any) {
      toast.error(`读取导师详情失败：${e.message}`);
    }
  }, []);

  const reloadBootstrap = useCallback(
    async (silent = false, preserveSelected = true, forceSelectId?: string) => {
      if (!silent) setRefreshing(true);
      try {
        const res = await apiFetch<BootstrapPayload>("/api/bootstrap");
        setConfig(res.config);
        setProfessors(res.professors || []);
        setSheets(res.sheets || []);
        setExcelPath(res.excel_path || "");
        setQuotaToday(res.quota_today || {});
        setJob(res.job || null);
        setUnreadReplies(res.unread_replies || []);
        setReplyCounts(res.reply_counts || {});

        const list = res.professors || [];
        const targetId =
          forceSelectId && list.some((p) => p.id === forceSelectId)
            ? forceSelectId
            : preserveSelected && selectedId && list.some((p) => p.id === selectedId)
              ? selectedId
              : list[0]?.id || null;

        if (targetId && (forceSelectId || !selectedId || !preserveSelected)) {
          await loadProfessorDetail(targetId, false);
        } else if (!targetId) {
          setSelectedId(null);
          setFields(EMPTY_FIELDS);
          setThreadMessages([]);
          setAutoSaveState("saved");
        }
        setBootstrapped(true);
        return res;
      } catch (e: any) {
        toast.error(`加载工作台数据失败：${e.message}`);
        return null;
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [loadProfessorDetail, selectedId]
  );

  // Sync IMAP replies (whitelist contacted professors only)
  const triggerSyncReplies = useCallback(
    async (opts?: { silent?: boolean; openPopupOnUnread?: boolean }) => {
      setSyncingReplies(true);
      try {
        const res = await apiFetch<{
          ok: boolean;
          skipped?: boolean;
          reason?: string;
          new_replies?: UnreadReplyItem[];
          unread_replies?: UnreadReplyItem[];
          reply_counts?: Record<string, number>;
          errors?: string[];
        }>("/api/mail/sync_replies", "POST", {});

        if (res.unread_replies) setUnreadReplies(res.unread_replies);
        if (res.reply_counts) setReplyCounts(res.reply_counts);

        const newlyArrived = res.new_replies || [];
        const allUnread = res.unread_replies || [];

        if (newlyArrived.length > 0) {
          await reloadBootstrap(true, true);
          if (selectedId) await loadProfessorDetail(selectedId, false);
          toast.success(`收到 ${newlyArrived.length} 封导师新回信！`);
          setReplyAlertOpen(true);
        } else if (opts?.openPopupOnUnread && allUnread.length > 0) {
          setReplyAlertOpen(true);
        } else if (!opts?.silent) {
          if (res.skipped) {
            toast.info(res.reason || "请先在「设置 → 收发邮箱」填入邮箱与授权码");
          } else if (res.errors && res.errors.length > 0) {
            toast.warning(`部分邮箱查信失败：${res.errors[0]}`);
          } else {
            toast.success("已检查收件箱，暂无新的导师回信");
          }
        }
      } catch (e: any) {
        if (!opts?.silent) toast.error(`查收新回信失败：${e.message}`);
      } finally {
        setSyncingReplies(false);
      }
    },
    [loadProfessorDetail, reloadBootstrap, selectedId]
  );

  const reloadUniversities = useCallback(async () => {
    try {
      const res = await apiFetch<UniversitiesPayload>("/api/universities");
      setUniversities(res.universities || []);
      setUnivBookmarks(res.bookmarks || []);
    } catch {
      // Optional navigation dataset
    }
  }, []);

  async function handleToggleUnivBookmark(uid: string) {
    try {
      const res = await apiFetch<{ bookmarks: string[]; bookmarked: boolean }>(
        "/api/universities/bookmark",
        "POST",
        { id: uid }
      );
      setUnivBookmarks(res.bookmarks || []);
      toast.success(res.bookmarked ? "已收藏该高校" : "已取消收藏");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleAddSchoolSheet(schoolName: string) {
    try {
      const res = await apiFetch<{ sheet: string; created: boolean }>(
        "/api/universities/add_sheet",
        "POST",
        { school: schoolName }
      );
      toast.success(res.created ? `已在 Excel 中新建「${res.sheet}」工作表` : `工作表「${res.sheet}」已存在`);
      await reloadBootstrap(true, true);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Startup load + automatic reply check & startup popup
  const startupSyncedRef = useRef(false);
  useEffect(() => {
    (async () => {
      reloadUniversities();
      const bs = await reloadBootstrap(false, false);
      if (!startupSyncedRef.current && bs) {
        startupSyncedRef.current = true;
        if ((bs.unread_replies || []).length > 0) {
          setReplyAlertOpen(true);
        }
        // Silently sync IMAP once on startup for fresh replies
        triggerSyncReplies({ silent: true, openPopupOnUnread: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic background reply check every 3.5 minutes for real-time popup
  useEffect(() => {
    const id = window.setInterval(() => {
      triggerSyncReplies({ silent: true, openPopupOnUnread: false });
    }, 210_000);
    return () => window.clearInterval(id);
  }, [triggerSyncReplies]);

  // Poll batch job status when running
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const isRunning = Boolean(job?.running);
    if (wasRunningRef.current && !isRunning) {
      reloadBootstrap(true, true);
    }
    wasRunningRef.current = isRunning;

    if (!isRunning) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await apiFetch<{
          ok: boolean;
          job: JobState;
          quota_today: Record<string, number>;
        }>("/api/job/status");
        setJob(res.job);
        if (res.quota_today) setQuotaToday(res.quota_today);
      } catch {
        // ignore transient poll hiccups
      }
    }, 1600);
    return () => window.clearInterval(timer);
  }, [job?.running, reloadBootstrap]);

  // Silent save function (used by Auto-Save & explicit saves)
  const persistCurrentFields = useCallback(
    async (overrideStatus?: string, notify = false) => {
      if (!currentProf || replyTarget) return; // Don't overwrite original email.txt while drafting a reply thread
      const targetStatus = overrideStatus ?? fields.status;
      setAutoSaveState("saving");
      try {
        const res = await apiFetch<{
          ok: boolean;
          excel_synced: boolean;
          excel_warning: string;
          body_path: string;
        }>("/api/professor/save", "POST", {
          id: currentProf.id,
          name: currentProf.name,
          priority: fields.priority,
          email: fields.email,
          in_batch: "是",
          assigned_sender: fields.assigned_sender,
          status: targetStatus,
          hook: fields.hook,
          subject: fields.subject,
          body: fields.body,
          body_path: currentProf.body_path,
          resume_path: currentProf.resume_path,
          note: fields.note,
          reply_note: fields.reply_note,
        });
        setAutoSaveState("saved");
        setProfessors((prev) =>
          prev.map((x) =>
            x.id === currentProf.id
              ? {
                  ...x,
                  priority: fields.priority,
                  email: fields.email,
                  assigned_sender: fields.assigned_sender,
                  status: targetStatus,
                  hook: fields.hook,
                  subject: fields.subject,
                  note: fields.note,
                  reply_note: fields.reply_note,
                  body_path: res.body_path || x.body_path,
                }
              : x
          )
        );
        if (overrideStatus) {
          setFields((prev) => ({ ...prev, status: targetStatus }));
        }
        if (res.excel_warning && notify) {
          toast.warning(`已保存正文，但表格被占用：${res.excel_warning}`);
        } else if (notify) {
          toast.success(
            overrideStatus === "待发送"
              ? `已将「${currentProf.name}」加入批量待发队列`
              : `已保存「${currentProf.name}」`
          );
        }
      } catch (e: any) {
        setAutoSaveState("dirty");
        if (notify) toast.error(`保存失败：${e.message}`);
      }
    },
    [currentProf, fields, replyTarget]
  );

  // Debounced auto-save whenever user edits fields
  useEffect(() => {
    if (autoSaveState !== "dirty" || !currentProf || replyTarget) return;
    const t = window.setTimeout(() => {
      persistCurrentFields(undefined, false);
    }, 1100);
    return () => window.clearTimeout(t);
  }, [autoSaveState, currentProf, fields, persistCurrentFields, replyTarget]);

  async function selectProfessor(pid: string) {
    if (autoSaveState === "dirty" && currentProf && !replyTarget) {
      await persistCurrentFields(undefined, false);
    }
    setViewMode("workspace");
    await loadProfessorDetail(pid, true);
  }

  function handleChangeField<K extends keyof DraftFields>(key: K, val: DraftFields[K]) {
    setFields((prev) => ({ ...prev, [key]: val }));
    setAutoSaveState("dirty");
  }

  function handleSelectReplyTarget(msg: MailThreadMessage | null) {
    setReplyTarget(msg);
    if (msg) {
      const baseSubj = msg.subject.replace(/^(?:re|回复|答复)\s*[:：]\s*/i, "").trim();
      setFields((prev) => ({
        ...prev,
        subject: `Re: ${baseSubj}`,
        body: "",
      }));
    } else if (currentProf) {
      loadProfessorDetail(currentProf.id, false);
    }
  }

  async function handleSendSingle() {
    if (!currentProf) return;
    if (!fields.email.trim() || !fields.email.includes("@")) {
      toast.warning("请先填写导师的有效收件邮箱");
      return;
    }
    if (!fields.subject.trim() || !fields.body.trim()) {
      toast.warning("请先填写邮件标题和正文");
      return;
    }

    const ok = await askConfirm({
      title: replyTarget ? `确认回复 ${currentProf.name} 老师？` : `确认发送给 ${currentProf.name} 老师？`,
      message: `收件邮箱：${fields.email.trim()}\n邮件主题：${fields.subject.trim()}\n附件：${
        !replyTarget && currentProf.resume_exists ? currentProf.resume_name : "纯文本（无简历附件）"
      }`,
      confirmText: "立即发送",
    });
    if (!ok) return;

    setSendingSingle(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string; excel_warning?: string }>(
        "/api/mail/send_single",
        "POST",
        {
          professor_id: currentProf.id,
          to_email: fields.email.trim(),
          subject: fields.subject.trim(),
          body: fields.body,
          account_id: fields.assigned_sender,
          in_reply_to: replyTarget?.message_id || "",
          include_attachment: !replyTarget,
          resume_path: currentProf.effective_resume_path || "",
        }
      );
      setSendCelebKey((k) => k + 1);
      toast.success(res.message || "邮件已发出");
      if (res.excel_warning) toast.warning(res.excel_warning);
      setReplyTarget(null);
      await reloadBootstrap(true, true);
      await loadProfessorDetail(currentProf.id, false);
    } catch (e: any) {
      toast.error(e.message || "发送失败");
    } finally {
      setSendingSingle(false);
    }
  }

  async function handleSaveSingleDraft() {
    if (!currentProf) return;
    if (!fields.email.trim() || !fields.subject.trim()) {
      toast.warning("请先填写收件邮箱和邮件主题");
      return;
    }
    setSavingDraftImap(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        "/api/mail/save_single_draft",
        "POST",
        {
          to_email: fields.email.trim(),
          subject: fields.subject.trim(),
          body: fields.body,
          account_id: fields.assigned_sender,
          resume_path: currentProf.effective_resume_path || "",
        }
      );
      toast.success(res.message);
    } catch (e: any) {
      toast.error(e.message || "写入草稿箱失败");
    } finally {
      setSavingDraftImap(false);
    }
  }

  async function handleGenerateTemplateDraft() {
    if (!currentProf) return;
    if (fields.body.trim()) {
      const ok = await askConfirm({
        title: "替换为套磁模板初稿？",
        message: "当前正文已有内容，套用模板将替换现有标题和正文。",
        confirmText: "套用模板",
      });
      if (!ok) return;
    }
    setGeneratingDraft(true);
    try {
      const res = await apiFetch<{ ok: boolean; subject: string; body: string }>(
        "/api/professor/generate_draft",
        "POST",
        { id: currentProf.id, hook: fields.hook }
      );
      setFields((prev) => ({
        ...prev,
        subject: res.subject || prev.subject,
        body: res.body || prev.body,
      }));
      setAutoSaveState("dirty");
      toast.success("已填入基础模板，你可以直接微调或让 AI 助手润色");
    } catch (e: any) {
      toast.error(`生成模板失败：${e.message}`);
    } finally {
      setGeneratingDraft(false);
    }
  }

  async function handleUploadResume(file: File) {
    if (!currentProf) return;
    try {
      const content_base64 = await readFileAsBase64(file);
      const res = await apiFetch<{
        ok: boolean;
        resume_name: string;
        resume_size_mb: number;
      }>("/api/professor/upload_resume", "POST", {
        id: currentProf.id,
        name: currentProf.name,
        filename: file.name,
        content_base64,
      });
      toast.success(`已挂上专属简历：${res.resume_name}（${res.resume_size_mb} MB）`);
      await reloadBootstrap(true, true);
      await loadProfessorDetail(currentProf.id, false);
    } catch (e: any) {
      toast.error(`上传简历失败：${e.message}`);
    }
  }

  async function handleCompressResume() {
    if (!currentProf?.effective_resume_path) return;
    setCompressing(true);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>("/api/pdf/compress", "POST", {
        id: currentProf.id,
        path: currentProf.effective_resume_path,
        dpi: 400,
      });
      toast.success(res.message);
      await reloadBootstrap(true, true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCompressing(false);
    }
  }

  async function handleResetResume() {
    if (!currentProf) return;
    try {
      await apiFetch("/api/professor/quick_update", "POST", {
        id: currentProf.id,
        updates: { resume_path: "" },
      });
      toast.success("已恢复使用默认简历 PDF");
      await reloadBootstrap(true, true);
      await loadProfessorDetail(currentProf.id, false);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDeleteProfessor() {
    if (!currentProf) return;
    const ok = await askConfirm({
      title: `移除「${currentProf.name}」？`,
      message: "将从本地 Excel 名录中删除这位导师的记录（已发出的邮件记录仍保留在你的发件箱）。",
      confirmText: "确认移除",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch("/api/professor/delete", "POST", { id: currentProf.id });
      toast.success(`已移除「${currentProf.name}」`);
      setRightPanelTab("closed");
      await reloadBootstrap(true, false);
    } catch (e: any) {
      toast.error(e.message || "删除失败");
    }
  }

  function handleOpenTestModal() {
    const accs = config?.accounts || [];
    const explicitSender = accs.some((a) => a.id === fields.assigned_sender)
      ? fields.assigned_sender
      : "";
    const defaultAcc = explicitSender || accs.find((a) => a.enabled)?.id || accs[0]?.id || "";
    const accObj = accs.find((a) => a.id === defaultAcc);
    setTestModal({
      open: true,
      accountId: defaultAcc,
      testTo: accObj?.email || "",
      sending: false,
    });
  }

  async function handleSendTestSelf() {
    if (!currentProf) return;
    if (!testModal.testTo.trim()) {
      toast.warning("请填写你自己的收件邮箱");
      return;
    }
    if (!fields.subject.trim() || !fields.body.trim()) {
      toast.warning("请先填写邮件标题和正文");
      return;
    }
    setTestModal((prev) => ({ ...prev, sending: true }));
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(
        "/api/dispatch/test_self",
        "POST",
        {
          test_to: testModal.testTo.trim(),
          account_id: testModal.accountId,
          subject: fields.subject,
          body: fields.body,
          resume_path: currentProf.effective_resume_path || "",
        }
      );
      toast.success(res.message || "预览测试邮件已发往你的邮箱");
      setTestModal((prev) => ({ ...prev, open: false, sending: false }));
    } catch (e: any) {
      toast.error(e.message);
      setTestModal((prev) => ({ ...prev, sending: false }));
    }
  }

  async function handleStopJob() {
    const ok = await askConfirm({
      title: "停止剩余批量发送？",
      message: "当前正在处理的这封完成后将安全停止队列。",
      confirmText: "停止",
      danger: true,
    });
    if (!ok) return;
    try {
      await apiFetch("/api/dispatch/stop", "POST", {});
      toast.info("已下发停止信号...");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // Silent keyboard shortcuts for power users
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (viewMode === "workspace" && currentProf) {
          e.preventDefault();
          persistCurrentFields(undefined, true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const hasAiKey = Boolean(config?.ai_config?.has_api_key || config?.ai_config?.api_key);
  const accounts = config?.accounts || [];
  const defaultResumeName = config?.default_resume_path
    ? config.default_resume_path.split(/[\\/]/).pop() || ""
    : "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-screen w-screen flex flex-col bg-white text-[#18181B] overflow-hidden">
        <Toaster
          position="top-right"
          offset={{ top: 64, right: 16 }}
          richColors={false}
          toastOptions={{
            style: {
              background: "#FFFFFF",
              color: "#18181B",
              border: "1px solid rgba(15, 23, 42, 0.09)",
              borderRadius: "12px",
              boxShadow: "0 12px 32px -4px rgba(15, 23, 42, 0.14)",
              fontSize: "13px",
            },
          }}
        />

        <SendCelebrationOverlay triggerKey={sendCelebKey} />

        <Topbar
          viewMode={viewMode}
          onChangeView={setViewMode}
          professors={professors}
          config={config}
          filters={filters}
          unreadReplies={unreadReplies}
          syncingReplies={syncingReplies}
          onToggleMetricFilter={(st) =>
            setFilters((prev) => ({ ...prev, status: prev.status === st ? "ALL" : st }))
          }
          onSyncReplies={() => triggerSyncReplies({ silent: false, openPopupOnUnread: true })}
          onOpenReplyAlert={() => setReplyAlertOpen(true)}
          onOpenQuickCompose={() => setQuickComposeOpen(true)}
          onOpenSettings={() => setSettingsState({ open: true, tab: "profile" })}
          onOpenDispatch={() => setDispatchOpen(true)}
        />

        {/* Running Batch Job Ribbon */}
        {job?.running && (
          <div className="px-4 py-1.5 bg-[#18181B] text-white text-[12px] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-[#93C5FD]" />
              <span className="font-medium shrink-0 tabular-nums">
                {job.mode === "send" ? "批量错峰发送中" : "批量写草稿中"} · {job.completed}/{job.total}
              </span>
              {job.schedule_wait_seconds && job.schedule_wait_seconds > 0 ? (
                <span className="font-mono text-[#BFDBFE] truncate">
                  预约倒计时 {formatCountdown(job.schedule_wait_seconds)}
                </span>
              ) : job.current_item ? (
                <span className="text-white/85 truncate">
                  正在处理：{job.current_item.name}（{job.current_item.to_email}）
                </span>
              ) : job.waiting_seconds > 0 && job.next_item ? (
                <span className="font-mono text-[#BFDBFE] truncate">
                  防拦截休息 {formatCountdown(job.waiting_seconds)} → 下一位：{job.next_item.name}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setDispatchOpen(true)}
                className="px-2.5 py-0.5 rounded-[6px] bg-white/15 hover:bg-white/25 text-[11.5px] cursor-pointer"
              >
                查看进度
              </button>
              <button
                type="button"
                onClick={handleStopJob}
                className="px-2.5 py-0.5 rounded-[6px] bg-[#E11D48] hover:bg-[#BE123C] text-[11.5px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Square className="w-3 h-3" />
                停止
              </button>
            </div>
          </div>
        )}

        {/* Main View */}
        {!bootstrapped && refreshing ? (
          <WorkspaceSkeleton />
        ) : viewMode === "universities" ? (
          <UniversityNavigator
            universities={universities}
            bookmarks={univBookmarks}
            professors={professors}
            sheets={sheets}
            onToggleBookmark={handleToggleUnivBookmark}
            onAddSchoolSheet={handleAddSchoolSheet}
            onExtractCollege={(schoolName, pageUrl) => {
              setAiImportSeed({ school: schoolName, pageUrl });
              setAiImportOpen(true);
            }}
            onJumpToSchoolMail={(sheetName) => {
              setFilters((prev) => ({ ...prev, school: sheets.includes(sheetName) ? sheetName : "ALL" }));
              const firstProf = professors.find((p) => p.sheet === sheetName);
              if (firstProf) {
                loadProfessorDetail(firstProf.id, false);
              }
              setViewMode("workspace");
            }}
          />
        ) : viewMode === "sheet" ? (
          <SheetView
            professors={professors}
            sheets={sheets}
            excelPath={excelPath}
            onEditProfessor={(pid) => selectProfessor(pid)}
            onBackToWorkspace={() => setViewMode("workspace")}
          />
        ) : (
          <main className="flex-1 min-h-0 flex overflow-hidden">
            <ProfessorRail
              professors={professors}
              filtered={filteredProfs}
              sheets={sheets}
              selectedId={selectedId}
              filters={filters}
              unreadReplies={unreadReplies}
              replyCounts={replyCounts}
              onFiltersChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
              onSelectProfessor={(pid) => selectProfessor(pid)}
              onOpenAiImport={() => setAiImportOpen(true)}
              onOpenQuickAdd={() => setQuickAddOpen(true)}
            />

            <MailStudio
              professor={currentProf}
              fields={fields}
              threadMessages={threadMessages}
              autoSaveState={autoSaveState}
              sendingSingle={sendingSingle}
              savingDraftImap={savingDraftImap}
              generatingDraft={generatingDraft}
              compressing={compressing}
              accounts={accounts}
              policy={config?.policy}
              rightPanelTab={rightPanelTab}
              onToggleRightPanel={(tab) =>
                setRightPanelTab((cur) => (cur === tab ? "closed" : tab))
              }
              onChangeField={handleChangeField}
              onSendSingle={handleSendSingle}
              onSaveSingleDraft={handleSaveSingleDraft}
              onMarkBatchReady={() => persistCurrentFields("待发送", true)}
              onGenerateTemplateDraft={handleGenerateTemplateDraft}
              onOpenTestModal={handleOpenTestModal}
              onUploadResume={handleUploadResume}
              onCompressResume={handleCompressResume}
              onResetResume={handleResetResume}
              onOpenSettings={() => setSettingsState({ open: true, tab: "profile" })}
              onOpenAiImport={() => setAiImportOpen(true)}
              onOpenQuickCompose={() => setQuickComposeOpen(true)}
              replyTarget={replyTarget}
              onSelectReplyTarget={handleSelectReplyTarget}
            />

            <AnimatePresence initial={false}>
              {rightPanelTab !== "closed" && currentProf && (
                <RightSidePanel
                  key="right-side-panel"
                  activeTab={rightPanelTab}
                  onChangeTab={setRightPanelTab}
                  professor={currentProf}
                  fields={fields}
                  aiConfig={config?.ai_config}
                  latestReply={latestInboundReply}
                  onChangeField={handleChangeField}
                  onApplyDraft={(subj, body, hook) => {
                    setFields((prev) => ({
                      ...prev,
                      subject: subj || prev.subject,
                      body: body || prev.body,
                      hook: hook !== undefined && hook.trim() ? hook : prev.hook,
                    }));
                    setAutoSaveState("dirty");
                  }}
                  onApplyHook={(hook) => {
                    setFields((prev) => ({ ...prev, hook }));
                    setAutoSaveState("dirty");
                  }}
                  onDeleteProfessor={handleDeleteProfessor}
                  onOpenAiSettings={() => setSettingsState({ open: true, tab: "ai" })}
                  onClose={() => setRightPanelTab("closed")}
                />
              )}
            </AnimatePresence>
          </main>
        )}

        {/* Drawers & Modals */}
        <SettingsDrawer
          open={settingsState.open}
          initialTab={settingsState.tab}
          onOpenChange={(open) => setSettingsState((prev) => ({ ...prev, open }))}
          config={config}
          quotaToday={quotaToday}
          onSaved={async () => {
            await reloadBootstrap(true, true);
          }}
          askConfirm={askConfirm}
        />

        <DispatchDrawer
          open={dispatchOpen}
          onOpenChange={setDispatchOpen}
          job={job}
          policy={config?.policy}
          onJobStarted={async () => {
            const res = await apiFetch<{ job: JobState }>("/api/job/status");
            setJob(res.job);
          }}
          onAfterQuotaReset={async () => {
            await reloadBootstrap(true, true);
          }}
          askConfirm={askConfirm}
        />

        <ReplyAlertModal
          open={replyAlertOpen}
          onOpenChange={setReplyAlertOpen}
          unreadReplies={unreadReplies}
          onOpenProfessor={(pid) => selectProfessor(pid)}
          onMarkAllRead={async () => {
            const res = await apiFetch<{ unread_replies: UnreadReplyItem[] }>(
              "/api/mail/mark_read",
              "POST",
              { all: true }
            );
            setUnreadReplies(res.unread_replies || []);
            setReplyAlertOpen(false);
            toast.success("已全部标为已读");
          }}
        />

        <QuickComposeModal
          open={quickComposeOpen}
          onOpenChange={setQuickComposeOpen}
          accounts={accounts}
          defaultResumeName={defaultResumeName}
          onSent={async (newProfId) => {
            setSendCelebKey((k) => k + 1);
            await reloadBootstrap(true, true, newProfId || undefined);
          }}
        />

        <AiImportModal
          open={aiImportOpen}
          onOpenChange={(v) => {
            setAiImportOpen(v);
            if (!v) setAiImportSeed({});
          }}
          sheets={sheets}
          hasAiKey={hasAiKey}
          initialSchool={aiImportSeed.school}
          initialPageUrl={aiImportSeed.pageUrl}
          onOpenAiSettings={() => setSettingsState({ open: true, tab: "ai" })}
          onImported={async () => {
            await reloadBootstrap(true, false);
          }}
        />

        <QuickAddProfModal
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
          sheets={sheets}
          onCreated={async () => {
            await reloadBootstrap(true, false);
          }}
        />

        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          professors={professors}
          onSelectProfessor={(pid) => selectProfessor(pid)}
          onRunAction={(act) => {
            if (act === "ai_import") {
              setAiImportSeed({});
              setAiImportOpen(true);
            } else if (act === "quick_compose") setQuickComposeOpen(true);
            else if (act === "settings") setSettingsState({ open: true, tab: "profile" });
            else if (act === "sheet") setViewMode("sheet");
            else if (act === "universities") setViewMode("universities");
          }}
        />

        {/* Self-Test Preview Modal */}
        <ModalDialog
          open={testModal.open}
          onOpenChange={(v) => setTestModal((prev) => ({ ...prev, open: v }))}
          title="先发一封给自己看效果"
          description="发到你自己的邮箱里，方便用手机或电脑检查排版换行和简历 PDF 附件名称（不会发给导师）。"
          maxWidth="max-w-[460px]"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setTestModal((prev) => ({ ...prev, open: false }))}
              >
                取消
              </Button>
              <Button variant="primary" loading={testModal.sending} onClick={handleSendTestSelf}>
                <Send className="w-3.5 h-3.5" />
                <span>发送预览邮件</span>
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">使用哪个发件箱</label>
              <SelectBox
                variant="form"
                value={testModal.accountId}
                onValueChange={(v) => setTestModal((prev) => ({ ...prev, accountId: v }))}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.label} (${a.email || "未填邮箱"})`,
                }))}
                placeholder="选择发件邮箱"
              />
            </div>
            <div>
              <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">接收预览的邮箱（填你自己的）</label>
              <input
                type="email"
                value={testModal.testTo}
                onChange={(e) => setTestModal((prev) => ({ ...prev, testTo: e.target.value }))}
                placeholder="例如 your_name@qq.com"
                className="w-full h-8.5 px-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[9px] text-[12.5px] font-mono outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
              />
            </div>
            {currentProf && (
              <div className="p-2.5 rounded-[10px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] text-[11.5px] text-[#52525B] flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
                <span className="truncate">
                  附件：{currentProf.resume_exists ? currentProf.resume_name : "纯文本（无 PDF 附件）"}
                </span>
              </div>
            )}
          </div>
        </ModalDialog>

        <ConfirmDialog state={confirmState} onResolve={resolveConfirm} />
      </div>
    </MotionConfig>
  );
}
