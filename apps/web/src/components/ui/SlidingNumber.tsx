import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn.js";

export interface SlidingNumberProps {
  value: number;
  className?: string;
}

/**
 * 数字滑动翻牌器：字数统计、队列计数与倒计时变动时呈现流畅弹性位移动画。
 */
export function SlidingNumber({ value, className }: SlidingNumberProps) {
  const digits = String(value).split("");

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono tabular-nums overflow-hidden leading-none",
        className
      )}
    >
      {digits.map((digit, index) => (
        <span key={`${index}-${digits.length}`} className="relative inline-block h-[1.15em] min-w-[0.62em] text-center">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={digit}
              initial={{ y: "65%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-65%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="inline-block"
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
