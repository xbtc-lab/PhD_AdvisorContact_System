import { Facehash } from "facehash";
import { cn } from "@/lib/cn.js";

export interface AdvisorAvatarProps {
  name: string;
  seed: string;
  styleMode?: "facehash" | "initials";
  size?: number;
  unread?: boolean;
  className?: string;
}

const INITIAL_BG_PALETTE = [
  "from-[#3695FF] to-[#2563EB]",
  "from-[#60A5FA] to-[#3B82F6]",
  "from-[#FF8A6B] to-[#FF6B4A]",
  "from-[#34D399] to-[#059669]",
  "from-[#818CF8] to-[#4F46E5]",
];

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 导师唯一拟态几何头像：默认采用 facehash 会眨眼的趣味小伙伴，也可在设置中切换为学术姓名首字徽章。
 */
export function AdvisorAvatar({
  name,
  seed,
  styleMode = "facehash",
  size = 40,
  unread = false,
  className,
}: AdvisorAvatarProps) {
  const safeSeed = seed || name || "advisor";
  const paletteIdx = hashSeed(safeSeed) % INITIAL_BG_PALETTE.length;

  return (
    <div
      className={cn("relative shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    >
      <div className="w-full h-full rounded-[30%] overflow-hidden border border-white/80 shadow-[0_3px_10px_-3px_rgba(37,99,235,0.22)] bg-slate-100">
        {styleMode === "facehash" ? (
          <Facehash
            name={safeSeed}
            size={size}
            variant="gradient"
            intensity3d="subtle"
            interactive
            showInitial={false}
            enableBlink
            colors={["#3695FF", "#2563EB", "#4F46E5", "#0EA5E9", "#FF6B4A"]}
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex items-center justify-center bg-gradient-to-br text-white font-semibold tracking-tight",
              INITIAL_BG_PALETTE[paletteIdx]
            )}
            style={{ fontSize: Math.max(12, Math.round(size * 0.42)) }}
          >
            {(name || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      {unread && (
        <span
          aria-label="有未读回信"
          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#FF6B4A] ring-2 ring-white shadow-[0_0_8px_rgba(255,107,74,0.65)] animate-pulse"
        />
      )}
    </div>
  );
}
