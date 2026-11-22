import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@/lib/cn.js";

export interface FamilyDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  direction?: "right" | "bottom";
  widthClass?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * 基于 Vaul 的 Family 触感抽屉组件，带磨砂顶栏与平滑弹性阻力。
 */
export function FamilyDrawer({
  open,
  onOpenChange,
  title,
  description,
  direction = "right",
  widthClass = "w-full max-w-[740px]",
  headerExtra,
  children,
  footer,
}: FamilyDrawerProps) {
  const isRight = direction === "right";

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={direction}
      dismissible
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-slate-950/24 backdrop-blur-[4px]" />
        <Drawer.Content
          className={cn(
            "fixed z-[65] flex flex-col bg-[#FAFAFC]/96 backdrop-blur-2xl border border-white/80 shadow-[-18px_0_60px_-16px_rgba(15,23,42,0.2)] outline-none",
            isRight
              ? cn("top-2 right-2 bottom-2 rounded-3xl overflow-hidden", widthClass)
              : "inset-x-0 bottom-0 max-h-[88vh] rounded-t-3xl"
          )}
        >
          {!isRight && (
            <div className="pt-3 pb-1 flex justify-center">
              <Drawer.Handle className="w-10 h-1.5 rounded-full bg-slate-300" />
            </div>
          )}

          <div className="px-6 py-4 bg-white/85 backdrop-blur-xl border-b border-slate-200/70 flex items-center justify-between gap-4 shrink-0">
            <div className="min-w-0">
              <Drawer.Title className="text-[16px] font-semibold text-[#111827] tracking-tight truncate">
                {title}
              </Drawer.Title>
              <Drawer.Description
                className={cn(
                  "text-[12px] text-slate-500 mt-0.5 truncate",
                  !description && "sr-only"
                )}
              >
                {description || "抽屉面板"}
              </Drawer.Description>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              <button
                type="button"
                aria-label="关闭抽屉"
                onClick={() => onOpenChange(false)}
                className="w-8 h-8 rounded-full inline-flex items-center justify-center text-slate-400 hover:text-[#111827] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && (
            <div className="px-6 py-3.5 bg-white/85 backdrop-blur-xl border-t border-slate-200/70 flex items-center justify-end gap-2.5 shrink-0">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
