import React from "react";
import { AnimatePresence, motion } from "motion/react";

/** Interactive minimalist academic pigeon badge for Topbar */
export function PigeonBadge({ hasUnread = false }: { hasUnread?: boolean }) {
  return (
    <motion.div
      whileHover={{ rotate: [-2, 4, 0], scale: 1.05 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
      className="relative w-8 h-8 rounded-[10px] bg-[#18181B] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_2px_6px_rgba(15,23,42,0.14)] flex items-center justify-center shrink-0 select-none"
    >
      <svg viewBox="0 0 32 32" className="w-[22px] h-[22px]" fill="none">
        {/* Graduation cap */}
        <path d="M10.5 8.8 16.5 6.4 22.5 8.8 16.5 11.2 10.5 8.8Z" fill="#93C5FD" />
        <path d="M21.5 9.2v3.1" stroke="#93C5FD" strokeWidth="1.3" strokeLinecap="round" />
        {/* Pigeon body */}
        <path
          d="M8.8 20.2c0-4.7 3.3-8.1 7.6-8.1 3.1 0 5.4 1.7 6.1 4.2l2.3.7-2 1.6c-.5 3.1-3.1 5.4-6.6 5.4H11l-2.8 1.8.6-3.1a5.4 5.4 0 0 1 0-2.5Z"
          fill="#FFFFFF"
        />
        {/* Wing curve */}
        <path
          d="M12.2 19.3c1.6 1.2 4.1 1.1 5.7-.4"
          stroke="#18181B"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        {/* Cute eye */}
        <circle cx="19.3" cy="15.8" r="1.2" fill="#18181B" />
        {/* Rosy cheek */}
        <circle cx="17.5" cy="17.5" r="1.05" fill="#FDA4AF" />
      </svg>
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F43F5E] ring-2 ring-white animate-pulse" />
      )}
    </motion.div>
  );
}

/** Animated thinking pigeon for AI Copilot loading / welcome state */
export function PigeonThinking({ active = false }: { active?: boolean }) {
  return (
    <motion.div
      animate={active ? { y: [0, -3, 0] } : { y: 0 }}
      transition={active ? { repeat: Infinity, duration: 1.4, ease: "easeInOut" } : undefined}
      className="inline-flex items-center justify-center"
    >
      <svg viewBox="0 0 56 56" className="w-11 h-11" fill="none">
        <circle cx="28" cy="28" r="24" fill="#EFF6FF" />
        {/* Tiny mortarboard */}
        <path d="M19 16.5 28 12.8 37 16.5 28 20.2 19 16.5Z" fill="#2563EB" />
        <path d="M35.5 17.2v4.6" stroke="#2563EB" strokeWidth="1.6" strokeLinecap="round" />
        {/* Pigeon outline */}
        <path
          d="M15.5 34.5c0-7.1 5-12.3 11.7-12.3 4.8 0 8.5 2.6 9.6 6.4l3.6 1.1-3.1 2.4c-.8 4.7-4.9 8.3-10.3 8.3H19l-4.2 2.8.9-4.7a9 9 0 0 1-.2-4Z"
          fill="#FFFFFF"
          stroke="#18181B"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path d="M21 33.2c2.5 1.8 6.4 1.6 8.8-.7" stroke="#18181B" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="32.2" cy="27.8" r="1.6" fill="#18181B" />
        <circle cx="29.6" cy="30.2" r="1.4" fill="#FDA4AF" />
        {active && (
          <>
            <motion.circle
              cx="42"
              cy="15"
              r="2"
              fill="#60A5FA"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
            />
            <motion.circle
              cx="47"
              cy="19"
              r="1.5"
              fill="#93C5FD"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.3 }}
            />
          </>
        )}
      </svg>
    </motion.div>
  );
}

/** Playful pigeon carrying a sealed letter for the New Reply Alert Popup */
export function PigeonMailDelivery() {
  return (
    <motion.div
      animate={{ y: [0, -5, 0], rotate: [-1.5, 1.5, -1.5] }}
      transition={{ repeat: Infinity, duration: 2.8, ease: "easeInOut" }}
      className="inline-flex items-center justify-center select-none"
    >
      <svg viewBox="0 0 96 84" className="w-[84px] h-[74px]" fill="none">
        {/* Soft halo */}
        <ellipse cx="48" cy="44" rx="34" ry="29" fill="#FFF1F2" />
        {/* Sparkles */}
        <path d="M16 24l1.5-3.5L19 24l3.5 1.5L19 27l-1.5 3.5L16 27l-3.5-1.5L16 24Z" fill="#FDA4AF" />
        <circle cx="80" cy="24" r="2.5" fill="#93C5FD" />
        <circle cx="75" cy="15" r="1.6" fill="#FCD34D" />
        {/* Pigeon carrying envelope */}
        <path d="M35 19.5 47 14.5 59 19.5 47 24.5 35 19.5Z" fill="#18181B" />
        <path d="M57 20.5v5.5" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" />
        <path
          d="M27 45c0-9.6 6.8-16.6 15.8-16.6 6.5 0 11.4 3.5 13 8.7l5 1.4-4.2 3.3c-1.1 6.4-6.7 11.2-14 11.2H31.8l-5.6 3.7 1.2-6.3A12 12 0 0 1 27 45Z"
          fill="#FFFFFF"
          stroke="#18181B"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {/* Wing */}
        <path d="M34.5 43.5c3.4 2.4 8.6 2.1 11.8-1" stroke="#18181B" strokeWidth="1.9" strokeLinecap="round" />
        {/* Happy eye & cheek */}
        <path d="M48.5 36.2c.9-1.2 2.4-1.2 3.3 0" stroke="#18181B" strokeWidth="1.9" strokeLinecap="round" />
        <circle cx="46.2" cy="39.3" r="2" fill="#FDA4AF" />
        {/* Envelope held in beak */}
        <g transform="translate(55, 36) rotate(8)">
          <rect x="0" y="0" width="24" height="17" rx="3.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="1.8" />
          <path d="M1.5 2 12 9.5 22.5 2" stroke="#18181B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="9.5" r="2.8" fill="#F43F5E" />
        </g>
      </svg>
    </motion.div>
  );
}

/** Notion-inspired minimal desk illustration for empty states */
export function EmptyDeskIllustration() {
  return (
    <svg viewBox="0 0 120 90" className="w-[116px] h-[86px] mx-auto" fill="none">
      <ellipse cx="60" cy="76" rx="44" ry="7" fill="#F4F5F7" />
      {/* Paper sheet */}
      <rect x="26" y="18" width="52" height="54" rx="8" fill="#FFFFFF" stroke="#18181B" strokeWidth="1.8" />
      <path d="M36 32h28M36 42h32M36 52h20" stroke="#D4D4D8" strokeWidth="2.2" strokeLinecap="round" />
      {/* Little sealed envelope */}
      <g transform="translate(58, 42) rotate(-7)">
        <rect x="0" y="0" width="38" height="26" rx="5" fill="#FFFFFF" stroke="#18181B" strokeWidth="1.8" />
        <path d="M2 3 19 14.5 36 3" stroke="#18181B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="19" cy="14.5" r="3.4" fill="#2563EB" />
      </g>
      {/* Cute pigeon head peeking from top-right */}
      <circle cx="88" cy="24" r="10" fill="#EFF6FF" />
      <path d="M81 17l7-2.8 7 2.8-7 2.8-7-2.8Z" fill="#2563EB" />
      <circle cx="91" cy="24" r="1.4" fill="#18181B" />
      <circle cx="88.5" cy="26.5" r="1.3" fill="#FDA4AF" />
    </svg>
  );
}

/** Non-blocking joyful flying paper-plane celebration after sending an email */
export function SendCelebrationOverlay({ triggerKey }: { triggerKey: number }) {
  const sparkles = [
    { x: -34, y: -22, color: "#60A5FA", size: 6 },
    { x: 38, y: -28, color: "#FDA4AF", size: 7 },
    { x: -18, y: -44, color: "#34D399", size: 5 },
    { x: 24, y: -50, color: "#FBBF24", size: 6 },
    { x: 48, y: -8, color: "#A78BFA", size: 5 },
  ];

  return (
    <AnimatePresence>
      {triggerKey > 0 && (
        <motion.div
          key={triggerKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 1, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.15, times: [0, 0.15, 0.78, 1] }}
          className="fixed inset-0 z-[150] pointer-events-none flex items-center justify-center"
        >
          <div className="relative flex items-center justify-center">
            {sparkles.map((s, idx) => (
              <motion.span
                key={idx}
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{ x: s.x * 1.9, y: s.y * 1.9, scale: [0, 1.15, 0.6], opacity: [0, 1, 0] }}
                transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1], delay: idx * 0.04 }}
                style={{ width: s.size, height: s.size, backgroundColor: s.color }}
                className="absolute rounded-full"
              />
            ))}
            <motion.div
              initial={{ x: -24, y: 24, scale: 0.75, rotate: -12, opacity: 0 }}
              animate={{ x: 56, y: -56, scale: 1.05, rotate: 6, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.05, ease: [0.23, 1, 0.32, 1] }}
              className="bg-white rounded-full p-3.5 shadow-[0_14px_34px_rgba(15,23,42,0.16)] ring-1 ring-slate-900/[0.08]"
            >
              <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none">
                <path
                  d="M4.5 15.2 27.2 5.4 20.6 26.6 15.2 19.2 4.5 15.2Z"
                  fill="#18181B"
                  stroke="#18181B"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M27.2 5.4 15.2 19.2" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
