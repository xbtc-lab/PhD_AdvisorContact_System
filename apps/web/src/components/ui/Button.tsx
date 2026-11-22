import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn.js";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "glass"
  | "coral"
  | "danger";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-[#3695FF] to-[#2563EB] text-white border border-[#2563EB]/70 shadow-[0_6px_18px_-5px_rgba(37,99,235,0.45),0_1px_0_rgba(255,255,255,0.32)_inset] hover:brightness-[1.04]",
  secondary:
    "bg-white text-[#111827] border border-slate-200/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-slate-50/90 hover:border-slate-300",
  ghost:
    "bg-transparent text-slate-600 border border-transparent hover:bg-slate-100/80 hover:text-[#111827]",
  glass:
    "glass-pill text-[#111827] hover:bg-white/95 hover:border-[#2563EB]/25",
  coral:
    "bg-gradient-to-b from-[#FF8468] to-[#FF6B4A] text-white border border-[#FF6B4A]/80 shadow-[0_6px_18px_-5px_rgba(255,107,74,0.45),0_1px_0_rgba(255,255,255,0.3)_inset] hover:brightness-[1.04]",
  danger:
    "bg-rose-50 text-rose-600 border border-rose-200/80 hover:bg-rose-100/80 hover:border-rose-300",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11px] rounded-xl gap-1",
  sm: "h-8 px-3 text-[12px] rounded-xl gap-1.5",
  md: "h-9 px-4 text-[13px] rounded-2xl gap-2",
  lg: "h-10 px-5 text-[14px] rounded-2xl gap-2",
};

/**
 * 触感弹簧按钮：遵循 Family/Cue! 风格微缩放反馈与克制电光晕。
 */
export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      whileHover={isDisabled ? undefined : { y: -0.8 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
      className={cn(
        "inline-flex items-center justify-center font-medium select-none transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
      ) : icon ? (
        <span className="inline-flex shrink-0">{icon}</span>
      ) : null}
      {children}
    </motion.button>
  );
}
