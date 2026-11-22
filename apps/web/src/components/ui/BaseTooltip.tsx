import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";

export interface BaseTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

/**
 * 基于 Base UI 的弹性悬浮提示框，使用 span 代理 Trigger 以兼容禁用态按钮。
 */
export function BaseTooltip({
  content,
  children,
  side = "top",
}: BaseTooltipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={(props) => (
          <span {...props} className="inline-flex">
            {children}
          </span>
        )}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner side={side} sideOffset={6} className="z-[100]">
          <Tooltip.Popup className="base-popup-elastic px-2.5 py-1 rounded-xl bg-slate-900/92 text-white text-[11px] font-medium shadow-lg backdrop-blur-md">
            {content}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
