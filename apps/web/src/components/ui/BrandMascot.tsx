import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * 呼应 Cue! 品牌灵感的八角星烁电光蓝眨眼吉祥物（o<）。
 */
export function CueMascot({ size = 34 }: { size?: number }) {
  const [wink, setWink] = useState(false);

  return (
    <motion.div
      onMouseEnter={() => setWink(true)}
      onMouseLeave={() => setWink(false)}
      whileHover={{ scale: 1.07, rotate: -3 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      style={{ width: size, height: size }}
      className="relative inline-flex items-center justify-center cursor-pointer select-none"
    >
      <svg
        viewBox="0 0 64 64"
        fill="none"
        className="w-full h-full drop-shadow-[0_4px_12px_rgba(54,149,255,0.34)]"
      >
        <defs>
          <linearGradient id="cueBodyGrad" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#5AB0FF" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        {/* 类似 Cue! 标志性的八向柔和齿轮/星芒外轮廓 */}
        <path
          d="M32 4 L38.5 11.5 L48.5 10.5 L50.5 20.5 L59.5 25 L55.5 34.5 L59 44 L49.8 48.2 L46 57.5 L36.5 55 L32 61 L27.5 55 L18 57.5 L14.2 48.2 L5 44 L8.5 34.5 L4.5 25 L13.5 20.5 L15.5 10.5 L25.5 11.5 Z"
          fill="url(#cueBodyGrad)"
        />
        {/* 高光边缘 */}
        <circle cx="22.5" cy="34" r="7.5" fill="white" />
        <motion.ellipse
          cx="22.5"
          cy="34"
          rx="3.6"
          ry={wink ? 1.2 : 4.6}
          fill="#111827"
          animate={{ ry: wink ? 1.2 : 4.6 }}
          transition={{ duration: 0.14 }}
        />
        {/* 俏皮眨眼符号 "<" */}
        <path
          d="M44 27 L34.5 34 L44 41"
          stroke="#111827"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}

/**
 * 无选中导师或空列表时的温馨插画卡片。
 */
export function EmptyDeskIllustration({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3.4, ease: "easeInOut" }}
        className="mb-4"
      >
        <CueMascot size={64} />
      </motion.div>
      <p className="text-[15px] font-semibold text-[#111827]">{title}</p>
      <p className="mt-1.5 text-[12px] text-slate-500 max-w-xs leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}

/**
 * AI 思考时的轻量跳动呼吸徽章。
 */
export function PigeonThinking({ label = "AI 顾问正在查阅导师档案与履历..." }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-blue-50/85 border border-blue-200/75 text-[#1D4ED8] text-[12px] font-medium">
      <motion.span
        animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
        className="inline-flex"
      >
        <Sparkles className="w-3.5 h-3.5 text-[#2563EB]" />
      </motion.span>
      <span>{label}</span>
    </div>
  );
}

const CONFETTI_COLORS = ["#2563EB", "#3695FF", "#FF6B4A", "#10B981", "#F59E0B"];

/**
 * 发件/操作成功时的 Family 式轻快弹性祝贺浮层。
 */
export function SendCelebrationOverlay({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 440, damping: 28 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[120] pointer-events-none"
        >
          <div className="relative px-5 py-3 rounded-full bg-white/94 backdrop-blur-2xl border border-[#2563EB]/25 shadow-[0_18px_48px_-10px_rgba(37,99,235,0.34)] flex items-center gap-3">
            <CueMascot size={28} />
            <span className="text-[13px] font-semibold text-[#111827]">{text}</span>
            {CONFETTI_COLORS.map((color, idx) => {
              const angle = (idx / CONFETTI_COLORS.length) * Math.PI * 2;
              const dx = Math.cos(angle) * 44;
              const dy = Math.sin(angle) * 26 - 10;
              return (
                <motion.span
                  key={color}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{ x: dx, y: dy, scale: [0, 1.2, 0.7], opacity: [1, 1, 0] }}
                  transition={{ duration: 0.95, ease: "easeOut" }}
                  style={{ backgroundColor: color }}
                  className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
                />
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
