import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { cn } from "@/lib/cn.js";

export interface BasePopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * 原点感知弹性气泡弹层：用于草稿历史版本切换、筛选面板等轻量化交互。
 */
export function BasePopover({
  trigger,
  children,
  open,
  onOpenChange,
  align = "end",
  side = "bottom",
  className,
}: BasePopoverProps) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={(props) => (
          <span {...props} className="inline-flex">
            {trigger}
          </span>
        )}
      />
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} side={side} align={align} className="z-[85]">
          <Popover.Popup
            className={cn(
              "base-popup-elastic rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/85 shadow-[0_18px_45px_-12px_rgba(15,23,42,0.18)] p-3 outline-none",
              className
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
