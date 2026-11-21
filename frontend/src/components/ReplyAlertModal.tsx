import React from "react";
import { ArrowRight, CheckCheck, Clock } from "lucide-react";
import { Button, ModalDialog } from "./ui";
import { PigeonMailDelivery } from "./Mascot";
import { avatarPalette, cn } from "../lib/api";
import type { UnreadReplyItem } from "../types";

export function ReplyAlertModal({
  open,
  onOpenChange,
  unreadReplies,
  onOpenProfessor,
  onMarkAllRead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unreadReplies: UnreadReplyItem[];
  onOpenProfessor: (professorId: string) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`收到 ${unreadReplies.length} 封导师新回信`}
      maxWidth="max-w-[540px]"
      footer={
        <>
          <Button variant="ghost" onClick={onMarkAllRead}>
            <CheckCheck className="w-3.5 h-3.5" />
            <span>全部标为已读</span>
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            稍后处理
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4 px-4 py-3 rounded-[14px] bg-[#FFF1F2]/55 ring-1 ring-[#F43F5E]/15">
          <PigeonMailDelivery />
          <div className="space-y-1 min-w-0">
            <div className="text-[14px] font-bold text-[#18181B]">
              小信鸽为你捎来了新回信！
            </div>
            <p className="text-[12px] text-[#52525B] m-0 leading-relaxed">
              系统已自动过滤广告与杂讯，只为你挑出了联系过的导师回信。点开即可查看全文并直接回复。
            </p>
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-0.5">
          {unreadReplies.map((r) => (
            <div
              key={r.msg_id}
              onClick={() => {
                onOpenChange(false);
                if (r.professor_id) onOpenProfessor(r.professor_id);
              }}
              className="group p-3.5 rounded-[13px] bg-white ring-1 ring-slate-900/[0.08] hover:ring-[#F43F5E]/40 hover:shadow-[0_4px_14px_-4px_rgba(244,63,94,0.16)] cursor-pointer transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full ring-1 flex items-center justify-center text-[12px] font-bold shrink-0",
                      avatarPalette(r.school + r.professor_name)
                    )}
                  >
                    {(r.professor_name || "导").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13.5px] text-[#18181B] truncate">
                        {r.professor_name}
                      </span>
                      {r.school && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#F4F5F7] text-[#52525B] shrink-0">
                          {r.school}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] font-medium text-[#3F3F46] truncate mt-0.5">
                      {r.subject}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] text-[#9CA3AF] font-mono shrink-0">
                  <Clock className="w-3 h-3" />
                  <span>{(r.timestamp || "").slice(5, 16)}</span>
                </div>
              </div>

              <p className="text-[12px] text-[#6B7280] m-0 mt-2 line-clamp-2 leading-relaxed">
                {r.snippet || "（点击查看回信全文）"}
              </p>

              <div className="mt-2.5 flex justify-end">
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#BE123C] group-hover:translate-x-0.5 transition-transform">
                  <span>查看全文并回复</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalDialog>
  );
}
