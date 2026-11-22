import { useState, type ReactNode } from "react";
import { History, RotateCcw, Wand2 } from "lucide-react";
import type { DraftRevision } from "@app/shared";
import { formatShortTime } from "@/lib/cn.js";

export interface ManualEditorPaneProps {
  subject: string;
  body: string;
  hookNote: string;
  revisions: DraftRevision[];
  generatingTemplate: boolean;
  restoringRev: boolean;
  modeSwitcher: ReactNode;
  paneToggleButton?: ReactNode;
  onChangeSubject: (val: string) => void;
  onChangeBody: (val: string) => void;
  onChangeHook: (val: string) => void;
  onGenerateTemplate: () => void;
  onRestoreRevision: (revId: string) => void;
}

/**
 * 写信工坊左栏 — 模式 B：纯手动精细直编（统一顶栏 + 同心圆角编辑域 + 历史版本回滚）。
 */
export function ManualEditorPane({
  subject,
  body,
  hookNote,
  revisions,
  generatingTemplate,
  restoringRev,
  modeSwitcher,
  paneToggleButton,
  onChangeSubject,
  onChangeBody,
  onChangeHook,
  onGenerateTemplate,
  onRestoreRevision,
}: ManualEditorPaneProps) {
  const [revOpen, setRevOpen] = useState(false);
  const charCount = body.replace(/\s+/g, "").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-white">
      {/* 统一左栏顶栏：h-14 与右栏完全等高平齐 */}
      <div className="px-5 h-14 shrink-0 hairline-b bg-white flex items-center justify-between gap-2">
        {modeSwitcher}

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11.5px] text-[#64748B] cue-mono px-1">
            {charCount} 字
          </span>

          <button
            type="button"
            disabled={generatingTemplate}
            onClick={onGenerateTemplate}
            className="h-8 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#0F172A] theme-hover-border cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
          >
            <Wand2 className="w-3 h-3 theme-text" />
            <span>{generatingTemplate ? "生成中..." : "模板"}</span>
          </button>

          <button
            type="button"
            onClick={() => setRevOpen((v) => !v)}
            className="h-8 px-3 rounded-full bg-white hairline text-[11.5px] font-medium text-[#475569] theme-hover-border cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
          >
            <History className="w-3 h-3" />
            <span>版本 ({revisions.length})</span>
          </button>

          {paneToggleButton}
        </div>
      </div>

      {/* 编辑主体区 */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5 min-h-0">
        {revOpen && (
          <div className="card-well p-3 space-y-2 max-h-44 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between text-[11.5px] font-semibold text-[#0F172A]">
              <span>草稿历史快照（点击回滚恢复）</span>
              <button
                type="button"
                onClick={() => setRevOpen(false)}
                className="text-[#64748B] bg-transparent border-0 cursor-pointer"
              >
                收起
              </button>
            </div>
            {revisions.length === 0 ? (
              <div className="text-[11.5px] text-[#94A3B8] py-1">暂无历史修订快照</div>
            ) : (
              revisions.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 bg-white rounded-[12px] px-3 py-2 hairline text-[11.5px]"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-[#0F172A] truncate">
                      {r.subject || "（无主题）"}
                    </div>
                    <div className="text-[#94A3B8] cue-mono">
                      {r.note || r.source} · {formatShortTime(r.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={restoringRev}
                    onClick={() => {
                      onRestoreRevision(r.id);
                      setRevOpen(false);
                    }}
                    className="px-2.5 py-1 rounded-full theme-soft-pill text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div>
          <label className="text-[11.5px] font-semibold text-[#64748B]">邮件主题</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => onChangeSubject(e.target.value)}
            placeholder="例如：【博士申请自荐】— 姓名（院校与研究方向）"
            className="mt-1.5 w-full h-10 px-3.5 rounded-[12px] bg-[#FAFAFB] hairline text-[13.5px] font-semibold text-[#0F172A] focus:outline-none theme-focus transition-all"
          />
        </div>

        <div>
          <label className="text-[11.5px] font-semibold text-[#64748B]">
            研究契合切入点备注（供自己与 Cue 对齐方向）
          </label>
          <input
            type="text"
            value={hookNote}
            onChange={(e) => onChangeHook(e.target.value)}
            placeholder="例如：呼应老师近两年在微弱传感与自适应校准方向的工作..."
            className="mt-1.5 w-full h-9 px-3.5 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#334155] focus:outline-none theme-focus transition-all"
          />
        </div>

        <div className="flex-1 flex flex-col min-h-[240px]">
          <label className="text-[11.5px] font-semibold text-[#64748B]">正文文本</label>
          <textarea
            value={body}
            onChange={(e) => onChangeBody(e.target.value)}
            placeholder="在这里精修套磁信正文，右侧 HTML 邮件画框将实时同步排版..."
            className="mt-1.5 flex-1 w-full p-4 rounded-[12px] bg-[#FAFAFB] hairline text-[13.5px] leading-[1.8] text-[#0F172A] resize-none focus:outline-none theme-focus transition-all"
          />
        </div>
      </div>
    </div>
  );
}
