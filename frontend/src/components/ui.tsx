import React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { cn } from "../lib/api";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1];

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "subtle" | "blue" | "danger" | "danger-solid";
  size?: "sm" | "md";
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", loading = false, disabled, children, ...props }, ref) => {
    const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
      primary:
        "bg-[#18181B] text-white border-[#18181B] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(15,23,42,0.18)] hover:bg-[#27272A] hover:border-[#27272A]",
      secondary:
        "bg-white text-[#18181B] border-slate-900/[0.11] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-[#F8F9FB] hover:border-slate-900/[0.2]",
      ghost:
        "bg-transparent text-[#52525B] border-transparent hover:bg-slate-900/[0.045] hover:text-[#18181B]",
      subtle:
        "bg-[#F4F5F7] text-[#3F3F46] border-slate-900/[0.06] hover:bg-[#EAECEF] hover:text-[#18181B]",
      blue:
        "bg-[#EFF6FF] text-[#1D4ED8] border-[#3B82F6]/25 hover:bg-[#DBEAFE] hover:border-[#3B82F6]/40",
      danger:
        "bg-[#FFF1F2] text-[#BE123C] border-[#F43F5E]/22 hover:bg-[#FFE4E6]",
      "danger-solid":
        "bg-[#E11D48] text-white border-[#E11D48] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(225,29,72,0.25)] hover:bg-[#BE123C]",
    };
    const sizes = {
      sm: "h-7 px-2.5 text-[12px] rounded-[8px] gap-1.5",
      md: "h-8.5 px-3.5 text-[12.5px] rounded-[9px] gap-1.5",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium border whitespace-nowrap select-none cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out active:not-disabled:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25 focus-visible:ring-offset-1",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function SegmentedControl({
  value,
  onValueChange,
  options,
  layoutId,
  size = "md",
  className,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: SegmentedOption[];
  layoutId: string;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex items-center bg-[#F3F4F6] p-[3px] rounded-[10px] ring-1 ring-slate-900/[0.05]",
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              "relative z-10 inline-flex items-center gap-1.5 rounded-[7.5px] font-medium whitespace-nowrap cursor-pointer transition-colors duration-150 select-none outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25",
              size === "sm" ? "h-6 px-2.5 text-[11.5px]" : "h-7 px-3 text-[12px]",
              active ? "text-[#18181B] font-semibold" : "text-[#6B7280] hover:text-[#18181B]"
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.7 }}
                className="absolute inset-0 -z-10 rounded-[7.5px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08),0_0_0_1px_rgba(15,23,42,0.04)]"
              />
            )}
            {Icon && <Icon className={cn("w-3.5 h-3.5", active && "text-[#18181B]")} />}
            <span>{opt.label}</span>
            {opt.badge !== undefined && opt.badge > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#F43F5E] text-white font-mono text-[10px] leading-tight">
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectBox({
  value,
  onValueChange,
  options,
  placeholder,
  variant = "ctrl",
  className,
}: {
  value: string;
  onValueChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
  variant?: "ctrl" | "mini" | "flat" | "form";
  className?: string;
}) {
  const triggerStyles = {
    ctrl: "h-8 px-2.5 text-[12.5px] bg-white border border-slate-900/[0.1] rounded-[9px] shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-900/[0.18]",
    mini: "h-7 px-2.5 text-[12px] bg-white border border-slate-900/[0.09] rounded-[8px] text-[#52525B] hover:border-slate-900/[0.18]",
    flat: "h-7 px-2 text-[12.5px] bg-transparent border border-transparent rounded-[7px] hover:bg-slate-900/[0.04]",
    form: "h-8.5 px-2.5 text-[12.5px] bg-white border border-slate-900/[0.11] rounded-[9px] w-full shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-slate-900/[0.2]",
  };

  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "inline-flex items-center justify-between gap-1.5 text-left outline-none cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 data-[state=open]:border-[#2563EB] data-[state=open]:ring-2 data-[state=open]:ring-[#2563EB]/15 focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#2563EB]/15",
          triggerStyles[variant],
          className
        )}
      >
        <span className="truncate flex-1">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="w-3.5 h-3.5 text-[#71717A] shrink-0 transition-transform duration-150" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[120] min-w-[var(--radix-select-trigger-width)] max-w-[360px] max-h-[280px] overflow-hidden bg-white rounded-[12px] shadow-popover p-1 popover-motion"
        >
          <SelectPrimitive.Viewport className="p-0.5 max-h-[268px] overflow-y-auto">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex items-center justify-between gap-2 px-2.5 py-1.5 text-[12.5px] text-[#52525B] rounded-[8px] cursor-pointer outline-none select-none transition-colors duration-100 data-[highlighted]:bg-[#F4F5F7] data-[highlighted]:text-[#18181B] data-[state=checked]:bg-[#EFF6FF] data-[state=checked]:text-[#1D4ED8] data-[state=checked]:font-semibold"
              >
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="w-3.5 h-3.5 text-[#2563EB]" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SwitchControl({
  checked,
  onCheckedChange,
  label,
  title,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <label
      title={title}
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none text-[12.5px] text-[#52525B]",
        className
      )}
    >
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="w-8 h-[18px] bg-[#D4D4D8] rounded-full relative transition-colors duration-150 data-[state=checked]:bg-[#18181B] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/25 cursor-pointer shrink-0"
      >
        <SwitchPrimitive.Thumb className="block w-3.5 h-3.5 bg-white rounded-full shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] translate-x-[2px] data-[state=checked]:translate-x-[16px]" />
      </SwitchPrimitive.Root>
      {label && <span className={cn("transition-colors", checked && "text-[#18181B] font-medium")}>{label}</span>}
    </label>
  );
}

export function DrawerSheet({
  open,
  onOpenChange,
  title,
  subtitle,
  wide = false,
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-slate-950/22 backdrop-blur-[3px]"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ duration: 0.28, ease: EASE_DRAWER }}
                className={cn(
                  "fixed top-2.5 right-2.5 bottom-2.5 z-50 flex flex-col bg-[#F8F9FB] rounded-[18px] ring-1 ring-slate-900/[0.08] shadow-[-16px_0_48px_rgba(15,23,42,0.14)] overflow-hidden outline-none max-w-[calc(100vw-20px)]",
                  wide ? "w-[860px]" : "w-[720px]"
                )}
              >
                <div className="px-6 py-4 bg-white/95 backdrop-blur-md border-b border-slate-900/[0.06] flex items-start justify-between gap-3 shrink-0">
                  <div>
                    <DialogPrimitive.Title className="text-[16.5px] font-bold tracking-tight text-[#18181B] m-0">
                      {title}
                    </DialogPrimitive.Title>
                    {subtitle && <div className="text-[12px] text-[#71717A] mt-0.5">{subtitle}</div>}
                  </div>
                  <DialogPrimitive.Close className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center text-[#71717A] hover:bg-slate-900/[0.05] hover:text-[#18181B] cursor-pointer transition-colors">
                    <X className="w-4 h-4" />
                  </DialogPrimitive.Close>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">{children}</div>
                {footer && (
                  <div className="px-6 py-3.5 bg-white/95 backdrop-blur-md border-t border-slate-900/[0.06] flex items-center justify-between gap-3 shrink-0">
                    {footer}
                  </div>
                )}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export function ModalDialog({
  open,
  onOpenChange,
  title,
  description,
  maxWidth = "max-w-[460px]",
  footer,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  maxWidth?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="fixed inset-0 z-[80] bg-slate-950/24 backdrop-blur-[3px]"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.975, y: 4 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className={cn(
                  "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[81] w-[92vw] bg-white rounded-[18px] ring-1 ring-slate-900/[0.08] shadow-[0_24px_64px_-8px_rgba(15,23,42,0.2)] overflow-hidden outline-none",
                  maxWidth
                )}
              >
                <div className="px-5 py-3.5 border-b border-slate-900/[0.06] flex items-center justify-between bg-white">
                  <DialogPrimitive.Title className="text-[15.5px] font-bold text-[#18181B] m-0">
                    {title}
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close className="w-7 h-7 rounded-[8px] inline-flex items-center justify-center text-[#71717A] hover:bg-slate-900/[0.05] hover:text-[#18181B] cursor-pointer transition-colors">
                    <X className="w-4 h-4" />
                  </DialogPrimitive.Close>
                </div>
                <div className="px-5 py-4">
                  {description && (
                    <p className="text-[12.5px] text-[#52525B] mt-0 mb-3.5 leading-relaxed">
                      {description}
                    </p>
                  )}
                  {children}
                </div>
                {footer && (
                  <div className="px-5 py-3 bg-[#F8F9FB] border-t border-slate-900/[0.06] flex items-center justify-end gap-2">
                    {footer}
                  </div>
                )}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  state,
  onResolve,
}: {
  state: {
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  };
  onResolve: (ok: boolean) => void;
}) {
  return (
    <ModalDialog
      open={state.open}
      onOpenChange={(v) => {
        if (!v) onResolve(false);
      }}
      title={state.title}
      maxWidth="max-w-[420px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onResolve(false)}>
            {state.cancelText || "取消"}
          </Button>
          <Button
            variant={state.danger ? "danger-solid" : "primary"}
            onClick={() => onResolve(true)}
            autoFocus
          >
            {state.confirmText || "确定"}
          </Button>
        </>
      }
    >
      <p className="text-[13px] leading-[1.7] text-[#52525B] whitespace-pre-line m-0">
        {state.message}
      </p>
    </ModalDialog>
  );
}
