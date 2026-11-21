import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CornerUpLeft,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Loader2,
  Paperclip,
  PenLine,
  Reply,
  RotateCcw,
  Send,
  Sparkles,
  Upload,
  UserCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, ModalDialog, SegmentedControl, SelectBox } from "./ui";
import { EmptyDeskIllustration } from "./Mascot";
import {
  avatarPalette,
  cn,
  MATCH_OPTIONS,
  normalizeMatchTier,
  normalizeStatus,
  STATUS_OPTIONS,
} from "../lib/api";
import type {
  AccountConfig,
  MailThreadMessage,
  PolicyConfig,
  Professor,
} from "../types";

export interface DraftFields {
  in_batch: string;
  priority: string;
  status: string;
  hook: string;
  email: string;
  assigned_sender: string;
  subject: string;
  body: string;
  note: string;
  reply_note: string;
}

export function MailStudio({
  professor,
  fields,
  threadMessages,
  autoSaveState,
  sendingSingle,
  savingDraftImap,
  generatingDraft,
  compressing,
  accounts,
  policy,
  rightPanelTab,
  onToggleRightPanel,
  onChangeField,
  onSendSingle,
  onSaveSingleDraft,
  onMarkBatchReady,
  onGenerateTemplateDraft,
  onOpenTestModal,
  onUploadResume,
  onCompressResume,
  onResetResume,
  onOpenSettings,
  onOpenAiImport,
  onOpenQuickCompose,
  replyTarget,
  onSelectReplyTarget,
}: {
  professor: Professor | null;
  fields: DraftFields;
  threadMessages: MailThreadMessage[];
  autoSaveState: "saved" | "saving" | "dirty";
  sendingSingle: boolean;
  savingDraftImap: boolean;
  generatingDraft: boolean;
  compressing: boolean;
  accounts: AccountConfig[];
  policy?: PolicyConfig;
  rightPanelTab: "closed" | "ai" | "profile";
  onToggleRightPanel: (tab: "ai" | "profile") => void;
  onChangeField: <K extends keyof DraftFields>(key: K, val: DraftFields[K]) => void;
  onSendSingle: () => void;
  onSaveSingleDraft: () => void;
  onMarkBatchReady: () => void;
  onGenerateTemplateDraft: () => void;
  onOpenTestModal: () => void;
  onUploadResume: (file: File) => void;
  onCompressResume: () => void;
  onResetResume: () => void;
  onOpenSettings: () => void;
  onOpenAiImport: () => void;
  onOpenQuickCompose: () => void;
  replyTarget: MailThreadMessage | null;
  onSelectReplyTarget: (msg: MailThreadMessage | null) => void;
}) {
  const [composerMode, setComposerMode] = useState<"edit" | "preview">("edit");
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [threadCollapsed, setThreadCollapsed] = useState(false);
  const [draggingPdf, setDraggingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  if (!professor) {
    return (
      <section className="flex-1 min-w-0 flex items-center justify-center p-8 bg-white">
        <div className="max-w-[460px] text-center space-y-4">
          <EmptyDeskIllustration />
          <div className="space-y-1.5">
            <h2 className="text-[18px] font-bold tracking-tight text-[#18181B] m-0">
              干净的书桌已为你准备好
            </h2>
            <p className="text-[13px] text-[#71717A] m-0 leading-relaxed">
              从左侧挑一位导师开始写信，或者直接把学院官网的师资页面文字粘贴给 AI，一键生成带匹配度评价的导师名录。
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
            <Button variant="primary" onClick={onOpenAiImport}>
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI 导入导师</span>
            </Button>
            <Button variant="secondary" onClick={onOpenQuickCompose}>
              写一封新邮件
            </Button>
            <Button variant="ghost" onClick={onOpenSettings}>
              配置名片与邮箱
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const maxMb = policy?.max_attachment_mb ?? 3.0;
  const overSize = professor.resume_exists && professor.resume_size_mb > maxMb;
  const wordCount = (fields.body || "").replace(/\s+/g, "").length;
  const emailMissing = !fields.email.trim() || !fields.email.includes("@");
  const pdfUrl =
    professor.resume_exists && professor.effective_resume_path
      ? `/api/pdf/view?path=${encodeURIComponent(professor.effective_resume_path)}`
      : "";

  const senderOptions = [
    { value: "自动分配", label: "自动选择可用发件箱" },
    ...accounts.map((a) => ({
      value: a.id,
      label: `${a.id}${a.email ? ` (${a.email})` : ""}${!a.enabled ? " · 未启用" : !a.has_password ? " · 待填授权码" : ""}`,
    })),
  ];

  const inboundCount = threadMessages.filter((m) => m.direction === "inbound").length;

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDraggingPdf(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast.warning("目前简历附件请上传 PDF 格式文件");
      return;
    }
    onUploadResume(f);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDraggingPdf(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDraggingPdf(false);
      }}
      onDrop={handleDrop}
      className="relative flex-1 min-w-0 @container flex flex-col bg-white overflow-hidden"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadResume(f);
          e.target.value = "";
        }}
      />

      {/* Playful Drag-and-Drop PDF Overlay */}
      {draggingPdf && (
        <div
          onDragLeave={() => setDraggingPdf(false)}
          className="absolute inset-4 z-40 rounded-[18px] bg-[#EFF6FF]/92 backdrop-blur-xs border-2 border-dashed border-[#2563EB] flex flex-col items-center justify-center gap-2 pointer-events-none"
        >
          <div className="w-12 h-12 rounded-full bg-white shadow-card flex items-center justify-center text-[#2563EB]">
            <Paperclip className="w-5 h-5" />
          </div>
          <div className="text-[14px] font-bold text-[#1D4ED8]">松手即可挂上该导师的专属简历 PDF</div>
          <div className="text-[12px] text-[#3B82F6]">将自动保存在本地并关联到当前邮件</div>
        </div>
      )}

      {/* Airy Pure-White Mentor Header */}
      <div className="px-6 py-3.5 border-b border-slate-900/[0.06] flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 shrink-0 bg-white">
        <div className="flex items-center gap-3 min-w-[220px] flex-1">
          <div
            className={cn(
              "w-9 h-9 rounded-full ring-1 flex items-center justify-center text-[14px] font-bold shrink-0 select-none",
              avatarPalette(professor.sheet + professor.name)
            )}
          >
            {(professor.name || "导").charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-[18px] font-bold tracking-[-0.02em] text-[#18181B] m-0 leading-tight whitespace-nowrap">
                {professor.name}
              </h1>
              {professor.homepage && (
                <a
                  href={professor.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 h-5.5 px-2 rounded-full bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] text-[11px] font-medium text-[#52525B] hover:text-[#18181B] hover:bg-[#F3F4F6] no-underline transition-colors shrink-0"
                >
                  <span>主页</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
              <span className="text-[12px] font-medium text-[#52525B] whitespace-nowrap">
                {professor.sheet}
              </span>
              {professor.dept && (
                <span className="text-[12px] text-[#71717A] truncate">{professor.dept}</span>
              )}
              {professor.title && (
                <span className="text-[12px] text-[#9CA3AF] whitespace-nowrap">
                  {professor.title}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap max-w-full shrink-0">
          <SelectBox
            value={normalizeMatchTier(fields.priority)}
            onValueChange={(v) => onChangeField("priority", v)}
            options={MATCH_OPTIONS.map((o) => ({ value: o.value, label: o.short }))}
            className="w-[108px]"
          />

          <SelectBox
            value={normalizeStatus(fields.status)}
            onValueChange={(v) => onChangeField("status", v)}
            options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))}
            className="w-[96px]"
          />

          <Button
            variant={rightPanelTab === "profile" ? "primary" : "secondary"}
            onClick={() => onToggleRightPanel("profile")}
          >
            <UserCircle2 className="w-3.5 h-3.5" />
            <span>档案</span>
          </Button>

          <Button
            variant={rightPanelTab === "ai" ? "primary" : "blue"}
            onClick={() => onToggleRightPanel("ai")}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{rightPanelTab === "ai" ? "收起 AI" : "AI 助手"}</span>
          </Button>
        </div>
      </div>

      {/* Main Scrollable Thread + Full-Width Composer Container */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
        {/* Conversation Thread History (only when messages exist) */}
        {threadMessages.length > 0 && (
          <div className="border-b border-slate-900/[0.06] bg-[#FAFAFC] shrink-0">
            <div className="px-6 py-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setThreadCollapsed((v) => !v)}
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#3F3F46] hover:text-[#18181B] cursor-pointer select-none"
              >
                <span>
                  往来信件记录（{threadMessages.length} 封
                  {inboundCount > 0 ? ` · 含 ${inboundCount} 封导师回信` : ""}）
                </span>
                {threadCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#71717A]" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-[#71717A]" />
                )}
              </button>
              {inboundCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const latestIn = [...threadMessages].reverse().find((m) => m.direction === "inbound");
                    if (latestIn) {
                      onSelectReplyTarget(latestIn);
                      setThreadCollapsed(true);
                      setTimeout(() => bodyRef.current?.focus(), 60);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#BE123C] hover:underline cursor-pointer"
                >
                  <Reply className="w-3.5 h-3.5" />
                  <span>回复最新来信</span>
                </button>
              )}
            </div>

            {!threadCollapsed && (
              <div className="px-6 pb-3 max-h-[290px] overflow-y-auto space-y-2">
                {threadMessages.map((m, idx) => {
                  const isInbound = m.direction === "inbound";
                  const isLatest = idx === threadMessages.length - 1;
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "rounded-[12px] ring-1 transition-all",
                        isInbound
                          ? "bg-[#FFF1F2]/60 ring-[#F43F5E]/25 p-3.5"
                          : isLatest
                            ? "bg-white ring-slate-900/[0.07] p-3.5"
                            : "bg-white/80 ring-slate-900/[0.06] px-3.5 py-2"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "px-2 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0",
                              isInbound
                                ? "bg-[#F43F5E] text-white"
                                : "bg-[#F3F4F6] text-[#52525B]"
                            )}
                          >
                            {isInbound ? "导师回信" : "我发出"}
                          </span>
                          <span className="text-[12.5px] font-semibold text-[#18181B] truncate">
                            {m.subject}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#71717A]">
                            <Clock className="w-3 h-3" />
                            <span>{(m.timestamp || "").slice(0, 16)}</span>
                          </span>
                          {isInbound && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectReplyTarget(m);
                                setTimeout(() => bodyRef.current?.focus(), 60);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-white ring-1 ring-[#F43F5E]/30 text-[11px] font-semibold text-[#BE123C] hover:bg-[#FFF1F2] cursor-pointer"
                            >
                              <CornerUpLeft className="w-3 h-3" />
                              <span>回复</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div
                        className={cn(
                          "text-[13px] leading-[1.72] text-[#27272A] whitespace-pre-wrap break-words",
                          isInbound || isLatest
                            ? "max-h-[165px] overflow-y-auto mt-1"
                            : "line-clamp-1 text-[#71717A] text-[12px]"
                        )}
                      >
                        {m.body}
                      </div>

                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {m.attachments.map((att, aIdx) => (
                            <span
                              key={aIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-white/90 ring-1 ring-slate-900/[0.08] text-[11px] text-[#52525B]"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>{att}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Active Reply Banner */}
        {replyTarget && (
          <div className="px-6 py-2 bg-[#FFF1F2]/75 border-b border-[#F43F5E]/18 flex items-center justify-between gap-2 text-[12px] text-[#BE123C] shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <CornerUpLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                正在回复 <strong>{replyTarget.from_name || professor.name}</strong> 的来信「{replyTarget.subject}」（发送时将自动保留原邮件会话线索）
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSelectReplyTarget(null)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded hover:bg-[#FFE4E6] text-[11.5px] cursor-pointer shrink-0"
            >
              <X className="w-3 h-3" />
              <span>退出回复模式</span>
            </button>
          </div>
        )}

        {/* Minimalist Pure-White Envelope Meta */}
        <div className="border-b border-slate-900/[0.06] shrink-0 bg-white">
          <div className="grid grid-cols-1 @[560px]:grid-cols-2 border-b border-slate-900/[0.045]">
            <div className="flex items-center gap-3 px-6 py-2 border-b @[560px]:border-b-0 @[560px]:border-r border-slate-900/[0.045]">
              <label className="w-[46px] shrink-0 text-[12px] text-[#9CA3AF]">收件人</label>
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    emailMissing ? "bg-[#F43F5E]" : "bg-[#10B981]"
                  )}
                />
                <input
                  type="text"
                  value={fields.email}
                  onChange={(e) => onChangeField("email", e.target.value)}
                  placeholder="professor@university.edu.cn"
                  className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-[12.5px] text-[#18181B] placeholder:text-[#D4D4D8] py-0.5"
                />
                {emailMissing && (
                  <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-[5px] bg-[#FFF1F2] text-[#BE123C] shrink-0">
                    请填邮箱
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 px-6 py-2">
              <label className="w-[46px] shrink-0 text-[12px] text-[#9CA3AF]">发件箱</label>
              <div className="flex-1 min-w-0">
                <SelectBox
                  variant="flat"
                  value={fields.assigned_sender}
                  onValueChange={(v) => onChangeField("assigned_sender", v)}
                  options={senderOptions}
                  className="w-full px-1.5"
                />
              </div>
            </div>
          </div>

          {/* Prominent Subject Line */}
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-slate-900/[0.045]">
            <label className="w-[46px] shrink-0 text-[12px] text-[#9CA3AF]">主题</label>
            <input
              type="text"
              value={fields.subject}
              onChange={(e) => onChangeField("subject", e.target.value)}
              placeholder="输入清晰礼貌的邮件标题..."
              className="flex-1 min-w-0 bg-transparent border-none outline-none text-[15.5px] font-semibold tracking-[-0.015em] text-[#18181B] placeholder:text-[#D4D4D8] placeholder:font-normal py-0.5"
            />
          </div>

          {/* Attachment Chip + Edit/Preview Toggle */}
          <div className="px-6 py-2 bg-[#FAFAFB] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div
                className={cn(
                  "inline-flex items-center gap-2 h-7 px-2.5 rounded-[8px] ring-1 text-[12px] max-w-full",
                  !professor.resume_exists
                    ? "bg-white ring-slate-900/[0.08] text-[#71717A]"
                    : overSize
                      ? "bg-[#FFFBEB] ring-[#F59E0B]/30 text-[#B45309]"
                      : "bg-white ring-slate-900/[0.08] text-[#18181B]"
                )}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 opacity-70" />
                <span className="font-medium truncate max-w-[220px]">
                  {professor.resume_exists ? professor.resume_name : "未附简历 PDF（可直接拖入文件）"}
                </span>
                {professor.resume_exists && (
                  <span
                    className={cn(
                      "font-mono text-[11px] px-1.5 py-0.2 rounded-[5px] shrink-0 tabular-nums",
                      overSize ? "bg-[#FEF3C7] text-[#B45309]" : "bg-[#ECFDF5] text-[#047857]"
                    )}
                  >
                    {professor.resume_size_mb.toFixed(2)} MB
                  </span>
                )}
                {professor.is_custom_resume && (
                  <span className="text-[10.5px] px-1.5 py-0.2 rounded-[5px] bg-[#EFF6FF] text-[#1D4ED8] font-medium shrink-0">
                    专属版
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5">
                {professor.resume_exists && (
                  <button
                    type="button"
                    onClick={() => setPdfModalOpen(true)}
                    className="h-7 px-2 rounded-[7px] text-[12px] text-[#52525B] hover:bg-slate-900/[0.05] hover:text-[#18181B] cursor-pointer transition-colors"
                  >
                    预览
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-7 px-2 rounded-[7px] text-[12px] font-medium text-[#2563EB] hover:bg-[#EFF6FF] cursor-pointer transition-colors"
                >
                  {professor.resume_exists ? "换一份 PDF" : "上传 PDF"}
                </button>
                {overSize && (
                  <button
                    type="button"
                    disabled={compressing}
                    onClick={onCompressResume}
                    className="h-7 px-2 rounded-[7px] text-[12px] font-medium text-[#B45309] hover:bg-[#FFFBEB] cursor-pointer transition-colors"
                  >
                    {compressing ? "压缩中..." : "自动压缩"}
                  </button>
                )}
                {professor.is_custom_resume && (
                  <button
                    type="button"
                    onClick={onResetResume}
                    className="h-7 px-2 rounded-[7px] text-[12px] text-[#71717A] hover:bg-slate-900/[0.05] cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3 h-3 inline mr-0.5" />
                    用默认
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <SegmentedControl
                size="sm"
                layoutId="composer-body-mode"
                value={composerMode}
                onValueChange={(v) => setComposerMode(v as "edit" | "preview")}
                options={[
                  { value: "edit", label: "撰写", icon: PenLine },
                  { value: "preview", label: "预览", icon: Eye },
                ]}
              />

              <button
                type="button"
                onClick={async () => {
                  if (!fields.body.trim()) {
                    toast.warning("当前正文为空");
                    return;
                  }
                  await navigator.clipboard.writeText(fields.body);
                  toast.success("已复制正文");
                }}
                className="inline-flex items-center gap-1 h-7 px-2 rounded-[7px] text-[12px] text-[#52525B] hover:bg-slate-900/[0.05] hover:text-[#18181B] cursor-pointer transition-colors"
              >
                <Copy className="w-3 h-3" />
                <span>复制</span>
              </button>
            </div>
          </div>
        </div>

        {/* Unconstrained Pure-White Full-Width Writing Area */}
        <div className="flex-1 min-h-0 flex bg-white overflow-hidden">
          {composerMode === "edit" ? (
            <textarea
              ref={bodyRef}
              value={fields.body}
              onChange={(e) => onChangeField("body", e.target.value)}
              placeholder={
                replyTarget
                  ? "在这里手写给导师的回信，也可以点右上角「AI 助手」让它帮你拟定礼貌得体的回复..."
                  : "在这里像写信一样自由撰写正文；编辑内容会自动保存。也可以点击左下角「套用模板」，或点右上角「AI 助手」由 DeepSeek 帮你打磨。"
              }
              className="w-full h-full border-none resize-none outline-none px-7 py-5 text-[14.5px] leading-[1.9] text-[#18181B] placeholder:text-[#A1A1AA] bg-white"
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-6 bg-[#F8F9FB]">
              <article className="w-full bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] p-7 shadow-paper">
                <div className="pb-4 mb-5 border-b border-slate-900/[0.06]">
                  <div className="text-[17px] font-bold tracking-[-0.015em] text-[#18181B] mb-2">
                    {fields.subject.trim() || "（未填写邮件主题）"}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-[#71717A]">
                    <span>
                      收件人：
                      <code className="font-mono text-[#3F3F46] bg-[#F4F5F7] px-1.5 py-0.5 rounded-[5px]">
                        {fields.email || "待填写"}
                      </code>
                    </span>
                    <span>
                      附件：
                      <strong className="font-medium text-[#3F3F46]">
                        {professor.resume_exists ? professor.resume_name : "纯文本无附件"}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="text-[14.5px] leading-[1.9] text-[#18181B] whitespace-pre-wrap break-words">
                  {fields.body || "（暂无正文内容）"}
                </div>
              </article>
            </div>
          )}
        </div>

        {/* Clean Action Footer with Auto-Save & Direct Single-Send */}
        <div className="px-6 py-3 border-t border-slate-900/[0.06] bg-white flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#71717A] mr-1">
              {autoSaveState === "saving" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin text-[#2563EB]" />
                  <span>保存中...</span>
                </>
              ) : autoSaveState === "dirty" ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                  <span>待保存</span>
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-[#10B981]" />
                  <span>已自动保存</span>
                </>
              )}
              <span className="text-[#D4D4D8] mx-0.5">·</span>
              <span className="font-mono tabular-nums">{wordCount} 字</span>
            </span>

            {!replyTarget && (
              <Button variant="subtle" size="sm" loading={generatingDraft} onClick={onGenerateTemplateDraft}>
                套用模板
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onOpenTestModal}>
              先发给自己看效果
            </Button>
            <Button variant="ghost" size="sm" loading={savingDraftImap} onClick={onSaveSingleDraft}>
              存邮箱草稿
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {!replyTarget && (
              <Button variant="secondary" onClick={onMarkBatchReady}>
                <Layers className="w-3.5 h-3.5 text-[#52525B]" />
                <span>加入批量待发</span>
              </Button>
            )}
            <Button variant="primary" loading={sendingSingle} onClick={onSendSingle}>
              <Send className="w-3.5 h-3.5" />
              <span>{replyTarget ? "立即回复导师" : "立即发送这一封"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Inline PDF Preview Modal */}
      <ModalDialog
        open={pdfModalOpen}
        onOpenChange={setPdfModalOpen}
        title={professor.resume_name || "简历附件预览"}
        maxWidth="max-w-[820px]"
        footer={
          <>
            {pdfUrl && (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 h-8 px-3 rounded-[8px] bg-white ring-1 ring-slate-900/[0.1] text-[12.5px] text-[#3F3F46] hover:bg-[#F8F9FB] no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>新窗口打开</span>
              </a>
            )}
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
              <span>替换专属 PDF</span>
            </Button>
            <Button variant="primary" onClick={() => setPdfModalOpen(false)}>
              完成预览
            </Button>
          </>
        }
      >
        <div className="h-[68vh] bg-[#F3F4F6] rounded-[12px] overflow-hidden ring-1 ring-slate-900/[0.06]">
          {pdfUrl ? (
            <iframe title="简历 PDF 预览" src={`${pdfUrl}&t=${Date.now()}`} className="w-full h-full border-none" />
          ) : (
            <div className="h-full flex items-center justify-center text-[13px] text-[#71717A]">
              暂未上传 PDF 简历
            </div>
          )}
        </div>
      </ModalDialog>
    </section>
  );
}
