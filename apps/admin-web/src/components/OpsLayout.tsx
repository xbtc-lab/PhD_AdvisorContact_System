import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Database,
  LogOut,
  ShieldAlert,
} from "lucide-react";

export type OpsNavKey = "overview" | "sources" | "runs" | "hitl" | "guardrails";

const NAV_ITEMS: Array<{ key: OpsNavKey; label: string; sub: string; icon: typeof Activity }> = [
  { key: "overview", label: "运维驾驶舱", sub: "01 · Overview", icon: Activity },
  { key: "sources", label: "院校源与沙盒", sub: "02 · Sources", icon: Database },
  { key: "runs", label: "定时与运行日志", sub: "03 · Scheduler", icon: CalendarClock },
  { key: "hitl", label: "人工审核纠偏台", sub: "04 · HITL", icon: CheckCircle2 },
  { key: "guardrails", label: "词典与AI护栏", sub: "05 · Guardrails", icon: ShieldAlert },
];

const AI_MODE_LABELS: Record<string, string> = {
  rule_only: "纯规则 · ¥0",
  manual: "手动触发 AI",
  auto_fallback: "规则优先+AI兜底",
};

export function OpsLayout({
  activeNav,
  onSelectNav,
  aiMode,
  pendingBadgeCount,
  onLogout,
  children,
}: {
  activeNav: OpsNavKey;
  onSelectNav: (nav: OpsNavKey) => void;
  aiMode: string;
  pendingBadgeCount: number;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#F8F8FA] text-[#0F172A]">
      <aside className="w-[232px] shrink-0 bg-white border-r border-[#E5E7EB] flex flex-col justify-between p-4 sticky top-0 h-screen">
        <div className="space-y-6">
          <div className="flex items-center gap-2.5 px-1.5 pt-1">
            <div className="w-8 h-8 rounded-lg bg-[#141417] text-white flex items-center justify-center font-bold text-sm">
              <span className="text-[#FF5C35]">Q</span>
            </div>
            <div>
              <div className="text-[14px] font-bold tracking-tight leading-tight">
                PhD Cue Ops
              </div>
              <div className="text-[11px] text-[#64748B]">Rule-First 独立运维域</div>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelectNav(item.key)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors ${
                    active
                      ? "bg-[#141417] text-white"
                      : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#FF5C35]" : ""}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{item.label}</div>
                      <div className={`text-[10.5px] ops-mono ${active ? "text-[#94A3B8]" : "text-[#94A3B8]"}`}>
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  {item.key === "hitl" && pendingBadgeCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] ops-mono font-semibold bg-[#FF5C35] text-white">
                      {pendingBadgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-3 border-t border-[#E5E7EB] pt-3">
          <div className="px-2.5 py-2 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0]">
            <div className="text-[10.5px] text-[#047857] font-medium">当前全局 AI 模式</div>
            <div className="text-[12px] font-semibold text-[#065F46] ops-mono mt-0.5">
              {AI_MODE_LABELS[aiMode] || aiMode}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-[12.5px] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            退出管理会话
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 max-w-[1380px]">{children}</main>
    </div>
  );
}
