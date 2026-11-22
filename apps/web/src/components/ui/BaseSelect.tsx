import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn.js";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface BaseSelectProps<T extends string = string> {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  size?: "xs" | "sm" | "md";
  className?: string;
}

/**
 * 基于 @base-ui/react/select 封装的原点感知弹性下拉选择器。
 * 显式传递 items 列表，确保 Trigger 中自动展示中文人类标签而非原始枚举键。
 */
export function BaseSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  disabled = false,
  size = "sm",
  className,
}: BaseSelectProps<T>) {
  return (
    <Select.Root
      value={value}
      onValueChange={(nextVal) => {
        if (nextVal !== null) {
          onValueChange(nextVal as T);
        }
      }}
      items={options}
      disabled={disabled}
    >
      <Select.Trigger
        className={cn(
          "inline-flex items-center justify-between gap-2 rounded-xl bg-white border border-slate-200/90 text-[#111827] font-medium shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-[#2563EB]/40 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
          size === "xs" && "h-7 px-2.5 text-[11px]",
          size === "sm" && "h-8 px-3 text-[12px]",
          size === "md" && "h-9 px-3.5 text-[13px]",
          className
        )}
      >
        <Select.Value placeholder={placeholder} className="truncate" />
        <Select.Icon className="text-slate-400 shrink-0">
          <ChevronDown className="w-3.5 h-3.5" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner sideOffset={6} align="start" className="z-[90]">
          <Select.Popup className="base-popup-elastic min-w-[var(--anchor-width)] max-h-[280px] overflow-y-auto rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/85 shadow-[0_14px_38px_-10px_rgba(15,23,42,0.16),0_0_0_1px_rgba(255,255,255,0.8)_inset] p-1.5 outline-none">
            <Select.List className="flex flex-col gap-0.5">
              {options.map((opt) => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  className="group flex items-center justify-between gap-2.5 px-2.5 py-1.5 rounded-xl text-[12px] text-slate-700 cursor-pointer outline-none select-none data-[highlighted]:bg-blue-50/80 data-[highlighted]:text-[#1D4ED8] data-[selected]:font-semibold data-[selected]:text-[#2563EB]"
                >
                  <Select.ItemText className="truncate">{opt.label}</Select.ItemText>
                  <Select.ItemIndicator className="text-[#2563EB] shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
