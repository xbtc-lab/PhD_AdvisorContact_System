import type { ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn.js";
import { Button } from "./Button.js";

export interface ModalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
  footer?: ReactNode;
}

/**
 * 基于 @base-ui/react/dialog 封装的磨砂模态窗口。
 */
export function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidthClass = "max-w-xl",
  footer,
}: ModalDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[70] bg-slate-950/24 backdrop-blur-[5px]" />
        <Dialog.Viewport className="fixed inset-0 z-[75] flex items-center justify-center p-4 overflow-y-auto">
          <Dialog.Popup
            className={cn(
              "base-dialog-popup w-full rounded-3xl bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_24px_70px_-16px_rgba(15,23,42,0.22),0_0_0_1px_rgba(15,23,42,0.06)] overflow-hidden outline-none",
              maxWidthClass
            )}
          >
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <Dialog.Title className="text-[16px] font-semibold tracking-tight text-[#111827]">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 text-[12px] text-slate-500">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                aria-label="关闭弹窗"
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>

            <div className="px-6 py-4 max-h-[75vh] overflow-y-auto">
              {children}
            </div>

            {footer && (
              <div className="px-6 py-3.5 bg-slate-50/75 border-t border-slate-100 flex items-center justify-end gap-2.5">
                {footer}
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
}

/**
 * 替代原生 window.confirm 的危险/关键动作二次确认弹层。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "确认执行",
  cancelLabel = "再想想",
  danger = false,
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-relaxed text-slate-600">{description}</p>
    </ModalDialog>
  );
}
