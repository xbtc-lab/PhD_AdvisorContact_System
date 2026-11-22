import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCheck, MailCheck } from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { formatShortTime } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { Button } from "./ui/Button.js";

export interface ReplyAlertModalProps {
  bootstrap: BootstrapData;
}

/**
 * 导师未读回信集中提醒弹窗：
 * 展示 IMAP 白名单同步发现的新回复，点击任一卡片直接跳往对应导师的邮件线程并消未读。
 */
export function ReplyAlertModal({ bootstrap }: ReplyAlertModalProps) {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.replyAlertOpen);
  const setOpen = useAppStore((s) => s.setReplyAlertOpen);
  const openInboxFor = useAppStore((s) => s.openInboxFor);

  const markAllMutation = useMutation({
    mutationFn: () => workerApi.markRepliesRead({ all: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已将所有未读回信标为已读");
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function openAdvisorThread(advisorId: string) {
    try {
      await workerApi.getMailThread(advisorId, true);
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      await queryClient.invalidateQueries({ queryKey: ["mail-thread", advisorId] });
    } catch {
      // 忽略标已读偶发异常，优先完成跳转
    }
    openInboxFor(advisorId);
    setOpen(false);
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <MailCheck className="w-4 h-4 text-[#FF6B4A]" />
          <span>收到导师未读回信 ({bootstrap.unreadReplies.length})</span>
        </span>
      }
      description="仅聚合已联系导师白名单的来信回复，避免垃圾促销邮件干扰"
      maxWidthClass="max-w-xl"
      footer={
        <>
          {bootstrap.unreadReplies.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              loading={markAllMutation.isPending}
              icon={<CheckCheck className="w-3.5 h-3.5" />}
              onClick={() => markAllMutation.mutate()}
            >
              全部标为已读
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
            关闭
          </Button>
        </>
      }
    >
      {bootstrap.unreadReplies.length === 0 ? (
        <div className="py-10 text-center text-[13px] text-slate-500">
          当前已无未读的导师回信
        </div>
      ) : (
        <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
          {bootstrap.unreadReplies.map((item) => (
            <div
              key={item.msgId}
              onClick={() => openAdvisorThread(item.advisorId)}
              className="p-3.5 rounded-2xl bg-white hover:bg-[#FAFAFB] hairline theme-hover-border cursor-pointer transition-all space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-[#FF5C35] shrink-0" />
                  <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                    {item.advisorName}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    {item.institutionName}
                  </span>
                </div>
                <span className="text-[10.5px] cue-mono text-slate-400 shrink-0">
                  {formatShortTime(item.timestamp)}
                </span>
              </div>

              <div className="text-[12px] font-semibold theme-text truncate">
                {item.subject}
              </div>

              <p className="text-[11.5px] text-slate-600 line-clamp-2">
                {item.snippet || "（点击查看完整来信正文）"}
              </p>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                <span className="cue-mono">{item.fromEmail}</span>
                <span className="inline-flex items-center gap-1 theme-text font-medium">
                  查看来信并标已读
                  <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalDialog>
  );
}
