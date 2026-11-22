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
  primary: "theme-cta border border-transparent",
  secondary:
    "bg-white text-[#0F172A] hairline shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:bg-[#FAFAFB] theme-hover-border",
  ghost:
    "bg-transparent text-[#475569] border border-transparent hover:bg-[#F4F5F7] hover:text-[#0F172A]",
  glass: "glass-bar text-[#0F172A] theme-hover-border hover:bg-white",
  coral:
    "bg-[#FF5C35] text-white border border-[#FF5C35]/80 shadow-[0_8px_18px_-5px_rgba(255,92,53,0.34)] hover:brightness-[1.04]",
  danger:
    "bg-rose-50 text-rose-600 border border-rose-200/80 hover:bg-rose-100/80 hover:border-rose-300",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[11.5px] rounded-full gap-1",
  sm: "h-8 px-3.5 text-[12px] rounded-full gap-1.5",
  md: "h-9 px-4 text-[13px] rounded-full gap-2",
  lg: "h-10 px-5 text-[14px] rounded-full gap-2",
};

/**
 * 触感弹簧按钮：对齐 V3.2 丝绒墨黑/珊瑚主题、极细发丝描边与柔和微缩放手感。
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
        "inline-flex items-center justify-center font-medium select-none transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed",
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
