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
  "from-[#FF5C35] to-[#E0431F]",
  "from-[#1E293B] to-[#0F172A]",
  "from-[#E07A5F] to-[#C85A3F]",
  "from-[#0D9488] to-[#0F766E]",
  "from-[#785A28] to-[#57401A]",
];

function hashSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * 导师唯一拟态几何头像：默认使用暖珊瑚与丝绒黑调色的 facehash 会眨眼角色，也支持首字母徽章。
 */
export function AdvisorAvatar({
  name,
  seed,
  styleMode = "facehash",
  size = 44,
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
      <div className="w-full h-full rounded-[32%] overflow-hidden border border-white/80 shadow-[0_6px_14px_-6px_rgba(15,23,42,0.22)] bg-[#F4F5F7]">
        {styleMode === "facehash" ? (
          <Facehash
            name={safeSeed}
            size={size}
            variant="gradient"
            intensity3d="subtle"
            interactive
            showInitial={false}
            enableBlink
            colors={["#FF5C35", "#141417", "#E07A5F", "#0D9488", "#785A28"]}
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
          className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] ring-2 ring-white shadow-[0_0_8px_rgba(16,185,129,0.55)]"
        />
      )}
    </div>
  );
}
