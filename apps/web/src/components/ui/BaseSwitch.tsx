import { Switch } from "@base-ui/react/switch";
import { cn } from "@/lib/cn.js";

export interface BaseSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * 触感胶囊开关：使用当前主题强调色激活态与白色弹性滑块。
 */
export function BaseSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
}: BaseSwitchProps) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 select-none",
        disabled ? "opacity-55 cursor-not-allowed" : "cursor-pointer",
        className
      )}
    >
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 border outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]",
          checked
            ? "theme-bg border-transparent shadow-[0_4px_12px_-3px_var(--accent-shadow)]"
            : "bg-slate-200/90 border-slate-300/60"
        )}
      >
        <Switch.Thumb
          className={cn(
            "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.22)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </Switch.Root>
      {label && <span className="text-[12px] text-[#475569]">{label}</span>}
    </label>
  );
}
