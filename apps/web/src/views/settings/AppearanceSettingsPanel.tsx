import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Palette, Smile } from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore, type ThemeKey } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "@/components/ui/AdvisorAvatar.js";

export interface AppearanceSettingsPanelProps {
  bootstrap: BootstrapData;
}

const THEME_CARDS: ReadonlyArray<{
  key: ThemeKey;
  name: string;
  tag: string;
  desc: string;
  accentHex: string;
  ctaHex: string;
  softHex: string;
}> = [
  {
    key: "coral",
    name: "丝绒墨黑 × 珊瑚微光",
    tag: "V3.2 主推",
    desc: "纯白漫射底色配合暖珊瑚激活光斑与丝绒黑主按钮，对比明快极具人文刊物感。",
    accentHex: "#FF5C35",
    ctaHex: "#141417",
    softHex: "#FFF4F0",
  },
  {
    key: "jade",
    name: "松针墨绿 × 玉石微光",
    tag: "护眼理工",
    desc: "沉稳松针绿与温润玉石底调，大幅削弱高饱和刺激，适合长时间筛选百位教授。",
    accentHex: "#0F766E",
    ctaHex: "#115E59",
    softHex: "#ECFDF5",
  },
  {
    key: "iris",
    name: "深蓝墨黑 × 鸢尾微光",
    tag: "极客专注",
    desc: "冷静克制的深渊墨黑搭配低饱和鸢尾紫靛信号，适合深夜批量撰稿与微调。",
    accentHex: "#6366F1",
    ctaHex: "#1E1B4B",
    softHex: "#EEF2FF",
  },
  {
    key: "sky",
    name: "晴空微光 × 冰蓝秩序",
    tag: "轻盈通透",
    desc: "通透澄澈的冰蓝微光与深海蓝操作反馈，提供现代实验室看板般的清爽视觉。",
    accentHex: "#0284C7",
    ctaHex: "#0C4A6E",
    softHex: "#F0F9FF",
  },
];

/**
 * 系统设置子面板 1：全局主题色板（4 套微光切换）与导师默认占位头像风格。
 */
export function AppearanceSettingsPanel({
  bootstrap,
}: AppearanceSettingsPanelProps) {
  const queryClient = useQueryClient();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const avatarMutation = useMutation({
    mutationFn: (avatarStyle: "facehash" | "initials") =>
      workerApi.updateSettings({ preferences: { avatarStyle } }),
    onSuccess: async (_res, avatarStyle) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(
        avatarStyle === "facehash"
          ? "已切换为灵动几何颜文字占位头像"
          : "已切换为简洁单字学术徽章占位"
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currentAvatarStyle = bootstrap.preferences.avatarStyle;

  return (
    <div className="space-y-6">
      {/* 主题色系切换 */}
      <div className="card-surface p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
              <Palette className="w-4 h-4 theme-text" />
              全站微光视觉主题
            </h2>
            <p className="text-[12px] text-[#64748B] mt-1">
              选择即刻生效并自动记忆于本地浏览器；顶栏高亮、主动作按钮与漫射背景光斑将同步换肤。
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-medium theme-soft-pill shrink-0">
            实时生效
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {THEME_CARDS.map((card) => {
            const active = theme === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  setTheme(card.key);
                  toast.success(`已切换主题：${card.name}`);
                }}
                className={cn(
                  "text-left p-4 rounded-[18px] border transition-all cursor-pointer relative",
                  active
                    ? "bg-[#FAFAFB] border-[var(--accent-border)] shadow-[0_8px_22px_-12px_var(--accent-shadow)]"
                    : "bg-white border-slate-200/80 hover:border-slate-300"
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: card.ctaHex }}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: card.accentHex }}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10"
                      style={{ backgroundColor: card.softHex }}
                    />
                  </div>
                  {active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold theme-soft-pill">
                      <Check className="w-3 h-3" />
                      当前使用
                    </span>
                  ) : (
                    <span className="text-[10.5px] font-medium text-[#64748B]">
                      {card.tag}
                    </span>
                  )}
                </div>

                <div className="text-[14px] font-bold text-[#0F172A]">
                  {card.name}
                </div>
                <p className="text-[12px] leading-[1.6] text-[#64748B] mt-1">
                  {card.desc}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 导师列表头像占位模式 */}
      <div className="card-surface p-6 space-y-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
            <Smile className="w-4 h-4 theme-text" />
            导师卡片占位头像样式
          </h2>
          <p className="text-[12px] text-[#64748B] mt-1">
            控制列表左方默认图标外观；悬停或点击仍随时弹出对应教授真实照片卡片。
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {(
            [
              {
                key: "facehash",
                title: "几何颜文字徽章（Facehash）",
                desc: "按导师 ID 唯一确定神态与配色，视觉节奏灵动且辨识度极高。",
              },
              {
                key: "initials",
                title: "极简姓氏首字",
                desc: "传统学术通讯录质感，仅展示教授姓名首字。",
              },
            ] as const
          ).map((opt) => {
            const selected = currentAvatarStyle === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={avatarMutation.isPending}
                onClick={() => avatarMutation.mutate(opt.key)}
                className={cn(
                  "text-left p-4 rounded-[18px] border transition-all cursor-pointer flex items-center gap-3.5",
                  selected
                    ? "bg-[#FAFAFB] border-[var(--accent-border)]"
                    : "bg-white border-slate-200/80 hover:border-slate-300"
                )}
              >
                <AdvisorAvatar
                  name="杨波"
                  seed="preview-yangbo"
                  styleMode={opt.key}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-bold text-[#0F172A]">
                      {opt.title}
                    </span>
                    {selected && (
                      <Check className="w-4 h-4 theme-text shrink-0" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-[#64748B] mt-0.5 leading-[1.5]">
                    {opt.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
