import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  Briefcase,
  Check,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  QrCode,
  Save,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import type { ApplicantProfile, BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { Button } from "@/components/ui/Button.js";
import { AcademicSections } from "./profile/AcademicSections.js";
import { AttachmentLibraryCard } from "./profile/AttachmentLibraryCard.js";

export interface ProfileViewProps {
  bootstrap: BootstrapData;
}

const SECTION_IDS = [
  "profile-basic",
  "profile-edu",
  "profile-pubs",
  "profile-projects",
  "profile-honors",
  "profile-files",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

/**
 * 视图 5：我的履历（左侧吸顶快捷目录 + 右侧单栏文档流：基础名片/GPA/论文/竞赛项目/荣誉/附件库）。
 */
export function ProfileView({ bootstrap }: ProfileViewProps) {
  const queryClient = useQueryClient();
  const setContactCardOpen = useAppStore((s) => s.setContactCardOpen);

  const [draft, setDraft] = useState<ApplicantProfile>(bootstrap.profile);
  const [activeSection, setActiveSection] = useState<SectionId>("profile-basic");
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(bootstrap.profile);
  }, [bootstrap.profile]);

  // 监听外层 main 滚动位置，高亮当前所在章节目录
  useEffect(() => {
    const scrollHost = containerRef.current?.closest("main");
    if (!scrollHost) return;

    const handleScroll = () => {
      const hostTop = scrollHost.getBoundingClientRect().top;
      let current: SectionId = SECTION_IDS[0];
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - hostTop <= 150) {
          current = id;
        }
      }
      setActiveSection(current);
    };

    scrollHost.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollHost.removeEventListener("scroll", handleScroll);
  }, []);

  const dirty = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(bootstrap.profile);
  }, [draft, bootstrap.profile]);

  const completeness = useMemo(() => {
    const checks = [
      { ok: Boolean(draft.name.trim()), label: "姓名" },
      { ok: Boolean(draft.affiliation.trim()), label: "就读院校" },
      { ok: Boolean(draft.researchSummary.trim()), label: "个人学术摘要" },
      { ok: Boolean(draft.phone.trim() || draft.wechat.trim()), label: "联系方式" },
      { ok: draft.targetDirections.length > 0, label: "申博方向" },
      { ok: draft.educationHistory.length > 0, label: "教育经历与 GPA" },
      { ok: draft.publications.length > 0, label: "论文或专利" },
      {
        ok:
          draft.competitions.length > 0 ||
          draft.projects.length > 0 ||
          draft.honors.length > 0,
        label: "竞赛项目与荣誉",
      },
      {
        ok: bootstrap.resumes.some((r) => (r.category || "resume") === "resume"),
        label: "个人简历 PDF",
      },
    ];
    const doneCount = checks.filter((c) => c.ok).length;
    const pct = Math.round((doneCount / checks.length) * 100);
    const missing = checks.filter((c) => !c.ok).map((c) => c.label);
    return { pct, missing };
  }, [draft, bootstrap.resumes]);

  const saveMutation = useMutation({
    mutationFn: () => workerApi.updateProfile(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("个人学术履历已持久化保存到 PostgreSQL 档案库");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function jumpToSection(id: SectionId) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const tocItems: Array<{
    id: SectionId;
    label: string;
    count?: number;
    icon: typeof UserCheck;
  }> = [
    { id: "profile-basic", label: "基础名片", icon: UserCheck },
    {
      id: "profile-edu",
      label: "教育与技能",
      count: draft.educationHistory.length,
      icon: GraduationCap,
    },
    {
      id: "profile-pubs",
      label: "论文与专利",
      count: draft.publications.length,
      icon: BookOpen,
    },
    {
      id: "profile-projects",
      label: "竞赛与项目",
      count: draft.competitions.length + draft.projects.length,
      icon: Briefcase,
    },
    {
      id: "profile-honors",
      label: "奖学金荣誉",
      count: draft.honors.length,
      icon: Award,
    },
    {
      id: "profile-files",
      label: "附件材料库",
      count: bootstrap.resumes.length,
      icon: Paperclip,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="max-w-[1080px] mx-auto px-4 sm:px-6 py-4 sm:py-7"
    >
      {/* 移动端吸顶横向快速跳转条（仅 < md 展示） */}
      <div className="md:hidden sticky top-0 z-20 -mx-4 px-4 py-2.5 mb-4 bg-white/95 backdrop-blur-md hairline-b flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold theme-soft-pill cue-mono shrink-0">
          {completeness.pct}%
        </span>
        {tocItems.map((item) => {
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => jumpToSection(item.id)}
              className={cn(
                "px-3 py-1 rounded-full text-[11.5px] shrink-0 whitespace-nowrap border cursor-pointer transition-all",
                active
                  ? "bg-[#141417] text-white border-[#141417] font-semibold"
                  : "bg-[#FAFAFB] text-[#475569] border-slate-200/80 font-medium"
              )}
            >
              {item.label}
              {item.count !== undefined ? ` (${item.count})` : ""}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-7 items-start",
          !tocCollapsed && "md:grid-cols-[204px_minmax(0,1fr)]"
        )}
      >
        {/* 桌面端左侧吸顶快速跳转目录（支持折叠收起） */}
        {!tocCollapsed && (
          <aside className="hidden md:block md:sticky md:top-6 card-surface p-4 space-y-4">
            <div className="space-y-2 pb-3 hairline-b">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[#0F172A]">档案完整度</span>
                  <span className="font-bold theme-text cue-mono">
                    {completeness.pct}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setTocCollapsed(true)}
                  title="收起左侧目录"
                  aria-label="收起左侧目录"
                  className="w-7 h-7 rounded-full bg-[#FAFAFB] hairline inline-flex items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full theme-bg transition-all duration-300"
                  style={{ width: `${completeness.pct}%` }}
                />
              </div>
              <p className="text-[11px] text-[#64748B] leading-[1.5]">
                {completeness.missing.length === 0
                  ? "核心履历模块均已完备"
                  : `可补充：${completeness.missing.slice(0, 2).join("、")}`}
              </p>
            </div>

            <nav aria-label="履历快速导航" className="space-y-1">
              {tocItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jumpToSection(item.id)}
                    className={cn(
                      "w-full px-3 py-2 rounded-[12px] text-[12.5px] flex items-center justify-between gap-2 cursor-pointer border-0 transition-all text-left",
                      active
                        ? "bg-[#141417] text-white font-semibold shadow-[0_6px_14px_-6px_rgba(20,20,23,0.32)]"
                        : "bg-transparent text-[#475569] font-medium hover:bg-[#FAFAFB] hover:text-[#0F172A]"
                    )}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0 truncate">
                      <Icon
                        className={cn(
                          "w-3.5 h-3.5 shrink-0",
                          active ? "text-white" : "text-[#64748B]"
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-full text-[10.5px] cue-mono leading-none shrink-0",
                          active
                            ? "bg-white/20 text-white"
                            : "bg-[#F4F5F7] text-[#64748B]"
                        )}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </aside>
        )}

        {/* 右侧主单栏学术档案文档流 */}
        <div className="min-w-0 space-y-6">
          {/* 顶部统一操作抬头 */}
          <div className="card-surface p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                {tocCollapsed && (
                  <button
                    type="button"
                    onClick={() => setTocCollapsed(false)}
                    title="展开左侧快速导航目录"
                    aria-label="展开左侧目录"
                    className="hidden md:inline-flex w-8 h-8 rounded-full bg-[#FAFAFB] hairline items-center justify-center text-[#475569] hover:text-[#0F172A] theme-hover-border cursor-pointer shrink-0 transition-all"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}
                <h1 className="text-[19px] sm:text-[20px] font-bold tracking-tight text-[#0F172A]">
                  我的履历 · 个人学术名片与全维素材库
                </h1>
              {dirty ? (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold theme-soft-pill shrink-0">
                  有未保存改动
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  <Check className="w-3 h-3" />
                  已同步至云端库
                </span>
              )}
            </div>
            <p className="text-[12px] text-[#64748B]">
              按学术文档结构单栏维护；所有字段保存后将实时驱动写信工坊与匹配评估
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              icon={<QrCode className="w-3.5 h-3.5 theme-text" />}
              onClick={() => setContactCardOpen(true)}
            >
              预览联系卡
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saveMutation.isPending}
              icon={<Save className="w-3.5 h-3.5" />}
              onClick={() => saveMutation.mutate()}
            >
              保存全部改动
            </Button>
          </div>
        </div>

        {/* 1. 基础名片与联系锚点 */}
        <section id="profile-basic" className="card-surface p-6 space-y-4 scroll-mt-6">
          <div>
            <h2 className="text-[15.5px] font-bold text-[#0F172A] flex items-center gap-2">
              <UserCheck className="w-4 h-4 theme-text" />
              基础名片与联系锚点
            </h2>
            <p className="text-[11.5px] text-[#64748B] mt-0.5">
              用于信尾署名、互动联系名片卡及自荐信开篇身份陈述
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                真实姓名
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="如：陈同学"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                学历 / 年级标签
              </label>
              <input
                type="text"
                value={draft.degreeInfo}
                onChange={(e) =>
                  setDraft({ ...draft, degreeInfo: e.target.value })
                }
                placeholder="如：2026 届研二在读"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                当前所在院校与学院
              </label>
              <input
                type="text"
                value={draft.affiliation}
                onChange={(e) =>
                  setDraft({ ...draft, affiliation: e.target.value })
                }
                placeholder="如：浙江大学 · 控制科学与工程学院"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                手机号码
              </label>
              <input
                type="text"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="用于互动联系卡"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                微信号
              </label>
              <input
                type="text"
                value={draft.wechat}
                onChange={(e) => setDraft({ ...draft, wechat: e.target.value })}
                placeholder="方便老师快速加微信"
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                个人主页 / Google Scholar
              </label>
              <input
                type="text"
                value={draft.homepageUrl}
                onChange={(e) =>
                  setDraft({ ...draft, homepageUrl: e.target.value })
                }
                placeholder="https://..."
                className="w-full h-9 px-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] text-[#0F172A] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                一句话研究背景摘要
              </label>
              <textarea
                rows={4}
                value={draft.researchSummary}
                onChange={(e) =>
                  setDraft({ ...draft, researchSummary: e.target.value })
                }
                placeholder="概括核心研究问题、实验平台与代表性量化突破..."
                className="w-full p-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] leading-[1.6] text-[#0F172A] outline-none resize-y"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11.5px] font-semibold text-[#475569]">
                个人简历全文或补充陈述（供 AI 深度阅读）
              </label>
              <textarea
                rows={4}
                value={draft.cvParsedText}
                onChange={(e) =>
                  setDraft({ ...draft, cvParsedText: e.target.value })
                }
                placeholder="可粘贴自我介绍或 PDF 解析长文本，供写信工坊随时检索细节..."
                className="w-full p-3 rounded-[12px] bg-[#FAFAFB] hairline text-[12.5px] leading-[1.6] text-[#334155] outline-none resize-y"
              />
            </div>
          </div>
        </section>

        {/* 2~5. 教育、论文专利、竞赛项目、奖学金荣誉 */}
        <AcademicSections profile={draft} onChange={setDraft} />

        {/* 6. 分类学术附件与联系二维码材料库 */}
        <AttachmentLibraryCard
          resumes={bootstrap.resumes}
          sectionId="profile-files"
        />
        </div>
      </div>
    </div>
  );
}
