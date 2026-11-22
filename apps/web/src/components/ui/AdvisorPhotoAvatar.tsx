import { useState } from "react";
import { Camera } from "lucide-react";
import { cn } from "@/lib/cn.js";
import { AdvisorAvatar } from "./AdvisorAvatar.js";

export interface AdvisorPhotoAvatarProps {
  name: string;
  school: string;
  dept?: string;
  title?: string;
  seed: string;
  styleMode?: "facehash" | "initials";
  photoUrl?: string;
  photoSource?: string;
  homepageUrl?: string;
  unread?: boolean;
  compact?: boolean;
  onOpenPhoto?: () => void;
}

/**
 * 学术导师占位实拍肖像 SVG（当尚未抓取到官方真实头像或图片加载失败时优雅兜底）。
 */
export function AcademicPortraitPlaceholder({ accentColor = "var(--accent)" }: { accentColor?: string }) {
  return (
    <svg viewBox="0 0 220 146" className="w-full h-full block">
      <defs>
        <linearGradient id="portraitBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>
      </defs>
      <rect width="220" height="146" fill="url(#portraitBg)" />
      <rect x="18" y="16" width="38" height="44" rx="4" fill="#F8FAFC" opacity="0.65" />
      <rect x="164" y="20" width="36" height="50" rx="4" fill="#F8FAFC" opacity="0.55" />
      <path d="M54 146 C54 114, 78 100, 110 100 C142 100, 166 114, 166 146 Z" fill="#1E293B" />
      <path d="M97 100 L110 124 L123 100 Z" fill="#F8FAFC" />
      <path d="M107 106 L113 106 L115 128 L110 134 L105 128 Z" fill={accentColor} />
      <circle cx="110" cy="68" r="24" fill="#F2C9AC" />
      <path d="M86 64 C86 46, 98 38, 112 38 C126 38, 134 48, 134 64 C128 54, 118 51, 108 51 C98 51, 90 56, 86 64 Z" fill="#1E293B" />
      <circle cx="101" cy="69" r="5" fill="none" stroke="#334155" strokeWidth="1.6" />
      <circle cx="119" cy="69" r="5" fill="none" stroke="#334155" strokeWidth="1.6" />
      <line x1="106" y1="69" x2="114" y2="69" stroke="#334155" strokeWidth="1.6" />
    </svg>
  );
}

/**
 * V3.2 56px 宽松留白导师头像容器（支持 compact 44px 变体）：
 * - 右下角附相机微角标提示可查看实拍照片
 * - 悬停平滑浮现真实照片预览卡，点击直接唤起高清大图灯箱
 */
export function AdvisorPhotoAvatar({
  name,
  school,
  dept,
  title,
  seed,
  styleMode = "facehash",
  photoUrl,
  photoSource,
  homepageUrl,
  unread = false,
  compact = false,
  onOpenPhoto,
}: AdvisorPhotoAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const hasRealPhoto = Boolean(photoUrl && photoUrl.trim() && !imgError);
  const domainHint = (() => {
    if (photoSource) return photoSource;
    if (!homepageUrl) return "官方教师主页";
    try {
      return new URL(homepageUrl).hostname;
    } catch {
      return homepageUrl.slice(0, 26);
    }
  })();

  const wrapperClass = compact ? "w-11 h-11" : "w-14 h-14";
  const faceSize = compact ? 42 : 48;

  return (
    <div className={cn("avatar-trigger relative shrink-0", wrapperClass)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenPhoto?.();
        }}
        title={`悬停或点击查看 ${name} 老师真实照片`}
        className={cn(
          "relative p-0 border-0 bg-transparent cursor-pointer text-left flex items-start",
          wrapperClass
        )}
      >
        <div className="avatar-face rounded-[16px] transition-all">
          <AdvisorAvatar
            name={name}
            seed={seed}
            styleMode={styleMode}
            size={faceSize}
            unread={unread}
          />
        </div>
        {!compact && (
          <span className="cam-badge absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-white hairline shadow-sm inline-flex items-center justify-center text-[#0F172A] transition-all">
            <Camera className="w-2.5 h-2.5" />
          </span>
        )}
      </button>

      {/* Hover 浮层：导师官网实拍照片与跳转 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="avatar-popover hidden md:block absolute left-0 top-[58px] w-[244px] glass-popover rounded-[20px] p-3 z-50 space-y-2.5"
      >
        <div
          onClick={() => onOpenPhoto?.()}
          className="relative aspect-[220/146] rounded-[14px] overflow-hidden hairline bg-[#F4F5F7] cursor-pointer"
        >
          {hasRealPhoto ? (
            <img
              src={photoUrl}
              alt={`${name} 教师照片`}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <AcademicPortraitPlaceholder />
          )}
          <span className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full bg-white/95 hairline text-[11px] font-semibold text-[#0F172A]">
            {hasRealPhoto ? "官网实拍照片" : "官网实拍 · 待采集"}
          </span>
        </div>

        <div className="px-1 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13.5px] font-bold text-[#0F172A] truncate">
              {name}
            </span>
            <span className="text-[11.5px] font-medium text-[#64748B] shrink-0">
              {school}
            </span>
          </div>
          <div className="text-[11.5px] text-[#64748B] truncate">
            {[dept, title].filter(Boolean).join(" · ") || "博导档案"}
          </div>
          <div className="flex items-center justify-between pt-1 text-[11.5px]">
            <span className="cue-mono text-[#94A3B8] truncate max-w-[145px]">
              {domainHint}
            </span>
            <button
              type="button"
              onClick={() => onOpenPhoto?.()}
              className="theme-text font-semibold bg-transparent border-0 p-0 cursor-pointer shrink-0 hover:underline"
            >
              点击放大 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
