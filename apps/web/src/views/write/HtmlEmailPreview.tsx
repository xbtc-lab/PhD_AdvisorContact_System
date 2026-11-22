import type { ReactNode } from "react";
import { ArrowRight, FileText, FlaskConical, Paperclip, Phone, Save } from "lucide-react";
import type { Advisor, BootstrapData } from "@app/shared";
import { cn } from "@/lib/cn.js";

export interface HtmlEmailPreviewProps {
  bootstrap: BootstrapData;
  advisor: Advisor;
  subject: string;
  body: string;
  accountChoice: string;
  resumeChoice: string;
  templateStyle: "editorial" | "classic";
  embedContactCard: boolean;
  savingDraftBox: boolean;
  sendingNow: boolean;
  className?: string;
  leftHeaderAction?: ReactNode;
  rightHeaderAction?: ReactNode;
  onChangeAccount: (val: string) => void;
  onChangeResume: (val: string) => void;
  onChangeTemplateStyle: (val: "editorial" | "classic") => void;
  onOpenContactCard: () => void;
  onOpenSelfTest: () => void;
  onSaveToDraftBox: () => void;
  onRequestSend: () => void;
}

/**
 * 写信工坊右栏：统一大卡片容器（等高头栏 + HTML 学术信纸预览 + 齐整底栏发送操作）。
 */
export function HtmlEmailPreview({
  bootstrap,
  advisor,
  subject,
  body,
  accountChoice,
  resumeChoice,
  templateStyle,
  embedContactCard,
  savingDraftBox,
  sendingNow,
  className,
  leftHeaderAction,
  rightHeaderAction,
  onChangeAccount,
  onChangeResume,
  onChangeTemplateStyle,
  onOpenContactCard,
  onOpenSelfTest,
  onSaveToDraftBox,
  onRequestSend,
}: HtmlEmailPreviewProps) {
  const profile = bootstrap.profile;
  const senderLabel = [
    profile.name || "未填姓名",
    [profile.affiliation, profile.degreeInfo].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");

  const attachedResume =
    resumeChoice === "none"
      ? null
      : bootstrap.resumes.find((r) => r.id === resumeChoice) ||
        bootstrap.resumes.find((r) => r.isDefault) ||
        bootstrap.resumes[0] ||
        null;

  return (
    <div className={cn("card-surface rounded-[24px] flex flex-col overflow-hidden min-h-0", className)}>
      {/* 统一右栏顶栏：桌面 h-14 与左栏完全等高平齐，移动端自适应折行 */}
      <div className="px-4 md:px-5 min-h-14 py-2 md:py-0 md:h-14 shrink-0 hairline-b bg-white flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {leftHeaderAction}
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F4F5F7] text-[#475569] shrink-0">
            收件
          </span>
          <span className="text-[13px] font-bold text-[#0F172A] shrink-0">
            {advisor.name}
          </span>
          <span className="cue-mono text-[12px] text-[#64748B] truncate min-w-0">
            {advisor.email ? `<${advisor.email}>` : "（未填邮箱）"}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={accountChoice}
            onChange={(e) => onChangeAccount(e.target.value)}
            title="选择发件邮箱信道"
            className="h-8 max-w-[156px] px-2.5 rounded-[12px] bg-[#FAFAFB] hairline text-[12px] font-medium text-[#0F172A] cursor-pointer focus:outline-none truncate"
          >
            <option value="auto">智能轮换发件箱</option>
            {bootstrap.mailAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.label} ({bootstrap.quotaToday[acc.id] || 0}/{acc.dailyLimit})
              </option>
            ))}
          </select>

          <select
            value={templateStyle}
            onChange={(e) =>
              onChangeTemplateStyle(
                e.target.value === "classic" ? "classic" : "editorial"
              )
            }
            title="切换邮件信纸样式"
            className="h-8 px-2.5 rounded-[12px] bg-[#FAFAFB] hairline text-[12px] font-medium text-[#0F172A] cursor-pointer focus:outline-none shrink-0"
          >
            <option value="editorial">学术白卡</option>
            <option value="classic">经典白纸</option>
          </select>

          {rightHeaderAction}
        </div>
      </div>

      {/* 中部最终 HTML 邮件信纸渲染画框 */}
      <div className="flex-1 overflow-y-auto p-5 bg-[#FAFAFB]/55 min-h-[300px]">
        <div
          className={cn(
            "rounded-[16px] bg-white overflow-hidden flex flex-col border",
            templateStyle === "editorial"
              ? "border-slate-200/80 shadow-[0_6px_22px_-10px_rgba(15,23,42,0.08)]"
              : "border-slate-200/90"
          )}
        >
          {templateStyle === "editorial" && (
            <div className="h-[3px] w-full theme-bg shrink-0 transition-colors" />
          )}

          <div className="px-7 py-6 space-y-5">
            <h2
              className={cn(
                "text-[16px] font-bold tracking-[-0.015em] leading-[1.45] m-0 pb-3.5 hairline-b",
                subject.trim() ? "text-[#0F172A]" : "text-[#94A3B8] font-medium text-[14.5px]"
              )}
            >
              {subject.trim() || "尚未填写邮件主题 — 可在左侧让 Cue 起草或手动输入"}
            </h2>

            <div
              className={cn(
                "text-[14px] leading-[1.9] whitespace-pre-wrap tracking-[0.01em] min-h-[140px]",
                body.trim() ? "text-[#1E293B]" : "text-[#94A3B8]",
                templateStyle === "classic" && "font-serif"
              )}
            >
              {body.trim() || "邮件正文预览区（实时同步左栏编辑或 AI 生成结果）"}
            </div>

            {embedContactCard && (
              <div className="rounded-[16px] card-well p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-bold text-[#0F172A] truncate">
                      {senderLabel}
                    </div>
                    <div className="text-[11.5px] text-[#64748B] mt-0.5 truncate">
                      研究方向：{profile.targetDirections.join("、") || "暂未设置"}
                    </div>
                  </div>
                  <span className="text-[11px] text-[#94A3B8] shrink-0 whitespace-nowrap">
                    互动联系卡 · 电脑/手机自适应
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  {attachedResume ? (
                    <button
                      type="button"
                      onClick={() =>
                        window.open(`/api/resumes/${attachedResume.id}/view`, "_blank")
                      }
                      className="theme-cta h-8 px-3.5 rounded-full text-[11.5px] font-semibold border-0 cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>在线阅读简历 PDF（含点击追踪）</span>
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full neutral-pill text-[11.5px]">
                      请先在「我的履历」上传个人简历 PDF
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={onOpenContactCard}
                    className="h-8 px-3.5 rounded-full bg-white hairline text-[11.5px] font-medium text-[#0F172A] cursor-pointer theme-hover-border inline-flex items-center gap-1.5 transition-all whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>致电 · 微信名片</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 统一底栏：附件下拉与单行发送按钮组 */}
      <div className="px-5 py-3.5 shrink-0 hairline-t bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Paperclip className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
          <select
            value={resumeChoice}
            onChange={(e) => onChangeResume(e.target.value)}
            title="选择随信附带简历附件"
            className="min-w-0 max-w-[200px] h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12px] font-medium text-[#0F172A] cursor-pointer focus:outline-none"
          >
            <option value="default">默认主简历附件</option>
            <option value="none">不附带任何 PDF</option>
            {bootstrap.resumes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.filename} ({r.sizeMb} MB)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenSelfTest}
            className="h-9 px-3.5 rounded-full bg-white hairline text-[12px] font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer inline-flex items-center gap-1.5 theme-hover-border transition-all whitespace-nowrap"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>测发</span>
          </button>

          <button
            type="button"
            disabled={savingDraftBox}
            onClick={onSaveToDraftBox}
            className="h-9 px-3.5 rounded-full bg-white hairline text-[12px] font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer inline-flex items-center gap-1.5 theme-hover-border transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingDraftBox ? "写入中..." : "存草稿"}</span>
          </button>

          <button
            type="button"
            disabled={sendingNow}
            onClick={onRequestSend}
            className="theme-cta h-9 px-4 rounded-full text-[12px] font-semibold border-0 cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
          >
            <span>{sendingNow ? "发送中..." : "立即发送"}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
