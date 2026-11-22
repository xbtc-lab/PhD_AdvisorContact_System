import { useId, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn.js";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * 基于 Framer Motion layoutId 的滑动分段控制器。
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const layoutGroupId = useId();

  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-full bg-slate-900/[0.05] border border-slate-900/[0.06]",
        className
      )}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative flex items-center justify-center gap-1.5 font-medium rounded-full transition-colors cursor-pointer select-none whitespace-nowrap",
              size === "sm" ? "px-3 py-1 text-[11.5px]" : "px-3.5 py-1.5 text-[12px]",
              active ? "text-white font-semibold" : "text-[#475569] hover:text-[#0F172A]"
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-pill-${layoutGroupId}`}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                className="absolute inset-0 rounded-full bg-[#141417] shadow-[0_6px_16px_-6px_rgba(20,20,23,0.34)]"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              <span>{opt.label}</span>
              {opt.badge !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none",
                    active ? "bg-white/20 text-white" : "bg-black/[0.06] text-[#475569]"
                  )}
                >
                  {opt.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
