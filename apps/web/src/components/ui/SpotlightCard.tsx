import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn.js";

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * 克制电光蓝高光交互卡片：鼠标悬浮时跟随产生极淡冰蓝径向高光。
 */
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const [pos, setPos] = useState({ x: 0, y: 0, opacity: 0 });

  return (
    <div
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          opacity: 1,
        });
      }}
      onMouseLeave={() => setPos((prev) => ({ ...prev, opacity: 0 }))}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white border border-slate-200/85 shadow-[0_2px_10px_-4px_rgba(15,23,42,0.05)] transition-colors",
        className
      )}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity: pos.opacity,
          background: `radial-gradient(240px circle at ${pos.x}px ${pos.y}px, rgba(54, 149, 255, 0.12), transparent 72%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
