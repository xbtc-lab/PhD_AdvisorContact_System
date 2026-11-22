import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * PhD Cue 八角星芒品牌眨眼吉祥物（o<），主色随主题 CSS 变量实时切换。
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
        className="w-full h-full drop-shadow-[0_4px_12px_var(--accent-shadow)]"
      >
        <path
          d="M32 4 L38.5 11.5 L48.5 10.5 L50.5 20.5 L59.5 25 L55.5 34.5 L59 44 L49.8 48.2 L46 57.5 L36.5 55 L32 61 L27.5 55 L18 57.5 L14.2 48.2 L5 44 L8.5 34.5 L4.5 25 L13.5 20.5 L15.5 10.5 L25.5 11.5 Z"
          fill="var(--mascot-fill)"
        />
        <circle cx="22.5" cy="34" r="7.5" fill="white" />
        <motion.g
          style={{ transformOrigin: "22.5px 34px" }}
          animate={{ scaleY: wink ? 0.25 : 1 }}
          transition={{ duration: 0.14 }}
        >
          <ellipse cx="22.5" cy="34" rx="3.6" ry="4.6" fill="#0F172A" />
        </motion.g>
        <path
          d="M44 27 L34.5 34 L44 41"
          stroke="#0F172A"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}

/**
 * 空状态插画卡。
 */
export function EmptyDeskIllustration({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <motion.div
        animate={{ y: [0, -5, 0] }}
        transition={{ repeat: Infinity, duration: 3.4, ease: "easeInOut" }}
        className="mb-4"
      >
        <CueMascot size={60} />
      </motion.div>
      <p className="text-[15px] font-semibold text-[#0F172A]">{title}</p>
      <p className="mt-1.5 text-[12.5px] text-[#64748B] max-w-xs leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}

/**
 * AI 思考时的轻量呼吸徽章。
 */
export function PigeonThinking({ label = "Cue 正在查阅导师档案与你的履历..." }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl theme-soft-pill text-[12px] font-medium">
      <motion.span
        animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 1.4 }}
        className="inline-flex"
      >
        <Sparkles className="w-3.5 h-3.5 theme-text" />
      </motion.span>
      <span>{label}</span>
    </div>
  );
}

const CONFETTI_COLORS = ["#FF5C35", "#141417", "#10B981", "#E07A5F", "#F59E0B"];

/**
 * 发件/操作成功时的轻快弹性祝贺浮层。
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
          <div className="relative px-5 py-3 rounded-full glass-popover flex items-center gap-3">
            <CueMascot size={28} />
            <span className="text-[13px] font-semibold text-[#0F172A]">{text}</span>
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
