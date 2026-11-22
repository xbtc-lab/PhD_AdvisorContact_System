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
 * 基于 Framer Motion layoutId 的共享元素磨砂滑动分段控制器。
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
        "inline-flex items-center p-1 rounded-2xl bg-slate-100/85 border border-slate-200/70 backdrop-blur-md",
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
              "relative flex items-center justify-center gap-1.5 font-medium rounded-xl transition-colors cursor-pointer select-none whitespace-nowrap",
              size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-[12px]",
              active ? "text-[#111827]" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-pill-${layoutGroupId}`}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                className="absolute inset-0 rounded-xl bg-white shadow-[0_1px_4px_rgba(15,23,42,0.08),0_0_0_1px_rgba(37,99,235,0.08)]"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {opt.icon}
              <span>{opt.label}</span>
              {opt.badge !== undefined && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none",
                    active
                      ? "bg-[#2563EB]/10 text-[#2563EB]"
                      : "bg-slate-200/70 text-slate-600"
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
