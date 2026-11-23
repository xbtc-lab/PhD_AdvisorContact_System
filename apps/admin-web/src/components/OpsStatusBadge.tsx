import type { CmsFingerprint, HealthStatus, RecruitmentStatus } from "@app/shared";

const HEALTH_MAP: Record<HealthStatus, { label: string; cls: string }> = {
  healthy: { label: "健康可用", cls: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]" },
  unprobed: { label: "待探测", cls: "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]" },
  degraded: { label: "部分降级", cls: "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]" },
  broken: { label: "采集异常", cls: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]" },
};

export function HealthBadge({ status }: { status: string }) {
  const cfg = HEALTH_MAP[(status as HealthStatus) || "unprobed"] || HEALTH_MAP.unprobed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const RECRUIT_MAP: Record<RecruitmentStatus, { label: string; cls: string }> = {
  confirmed_open: { label: "明确招博", cls: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]" },
  phd_default_open: { label: "博导默认在招", cls: "bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]" },
  explicitly_closed: { label: "明确停招/退休", cls: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]" },
  unknown: { label: "待核实资格", cls: "bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]" },
};

export function RecruitmentBadge({ status }: { status: string }) {
  const cfg =
    RECRUIT_MAP[(status as RecruitmentStatus) || "phd_default_open"] ||
    RECRUIT_MAP.phd_default_open;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const CMS_LABELS: Record<CmsFingerprint, string> = {
  boda_vsb: "博达 VSB",
  sudi_webplus: "苏迪 Webplus",
  unified_portal: "统一教师门户",
  custom_static: "自研静态站",
  ruishu_waf: "瑞数 JS 挑战",
  unknown: "未探测",
};

export function CmsBadge({ cms }: { cms: string }) {
  const isWarn = cms === "ruishu_waf";
  const label = CMS_LABELS[(cms as CmsFingerprint) || "unknown"] || cms;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] ops-mono border ${
        isWarn
          ? "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]"
          : "bg-[#F8FAFC] text-[#475569] border-[#E2E8F0]"
      }`}
    >
      {label}
    </span>
  );
}
