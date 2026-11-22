import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Bookmark,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Globe,
  GraduationCap,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button, SelectBox, SwitchControl } from "./ui";
import { cn, normalizeStatus, schoolShort } from "../lib/api";
import type { CollegeItem, Professor, UniversityItem } from "../types";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type ContactFilterKey = "ALL" | "contacted" | "preparing" | "uncontacted" | "bookmarked";

export interface SchoolContactSummary {
  total: number;
  replied: number;
  sent: number;
  preparing: number;
  hasSheet: boolean;
  sheetName: string;
  stage: "replied" | "sent" | "preparing" | "sheet_only" | "none";
}

function getEmailDomain(email: string): string {
  const at = (email || "").indexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

function computeSchoolContact(
  univ: UniversityItem,
  professors: Professor[],
  sheets: string[]
): SchoolContactSummary {
  const shortNm = schoolShort(univ.name);
  const domains = (univ.domains || []).map((d) => d.toLowerCase());
  const aliases = new Set(
    [univ.name, univ.full_name || "", shortNm]
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
  );

  const matchedSheet = sheets.find(
    (s) => aliases.has(s.trim()) || s.includes(univ.name) || univ.name.includes(s)
  ) || "";

  const matchedProfs = professors.filter((p) => {
    const pSheet = (p.sheet || "").trim();
    if (pSheet && (aliases.has(pSheet) || pSheet.includes(univ.name))) {
      return true;
    }
    const dom = getEmailDomain(p.email || "");
    if (dom && domains.some((d) => dom === d || dom.endsWith("." + d))) {
      return true;
    }
    const textHay = `${p.dept || ""} ${p.note || ""}`;
    if (textHay.includes(univ.name)) {
      return true;
    }
    return false;
  });

  let replied = 0;
  let sent = 0;
  let preparing = 0;
  for (const p of matchedProfs) {
    const st = normalizeStatus(p.status);
    if (st === "已回信") replied += 1;
    else if (st === "已发送") sent += 1;
    else if (st === "待撰写" || st === "待发送") preparing += 1;
  }

  let stage: SchoolContactSummary["stage"] = "none";
  if (replied > 0) stage = "replied";
  else if (sent > 0) stage = "sent";
  else if (preparing > 0) stage = "preparing";
  else if (matchedSheet) stage = "sheet_only";

  return {
    total: matchedProfs.length,
    replied,
    sent,
    preparing,
    hasSheet: Boolean(matchedSheet),
    sheetName: matchedSheet || univ.name,
    stage,
  };
}

function UniversityCrest({
  univ,
  size = "sm",
}: {
  univ: UniversityItem;
  size?: "sm" | "lg";
}) {
  const [imgErr, setImgErr] = useState(false);
  const dim = size === "lg" ? "w-13 h-13 rounded-[14px]" : "w-9 h-9 rounded-[10px]";
  const fallbackText = (univ.name || "校").slice(0, 2);

  if (univ.logo_file && !imgErr) {
    return (
      <div
        className={cn(
          "bg-white ring-1 ring-slate-900/[0.08] p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
          dim
        )}
      >
        <img
          src={`/api/university_logo/${encodeURIComponent(univ.logo_file)}`}
          alt={univ.name}
          onError={() => setImgErr(true)}
          className="w-full h-full object-contain select-none"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-[#F4F5F7] text-[#18181B] ring-1 ring-slate-900/[0.08] flex items-center justify-center shrink-0 font-bold tracking-tight select-none",
        dim,
        size === "lg" ? "text-[16px]" : "text-[12px]"
      )}
    >
      {fallbackText}
    </div>
  );
}

function RankBadge({ label, rankNum }: { label: string; rankNum: number }) {
  const num = Number.isFinite(rankNum) ? rankNum : 999;
  const tone =
    num === 1
      ? "bg-[#FEF3C7] text-[#92400E] ring-1 ring-[#F59E0B]/35 shadow-[0_1px_2px_rgba(245,158,11,0.18)]"
      : num === 2
        ? "bg-[#E2E8F0] text-[#334155] ring-1 ring-slate-400/35"
        : num === 3
          ? "bg-[#FFEDD5] text-[#9A3412] ring-1 ring-[#EA580C]/28"
          : "bg-[#F4F5F7] text-[#71717A] ring-1 ring-slate-900/[0.06]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-[7px] font-mono text-[11.5px] font-semibold tabular-nums shrink-0",
        tone
      )}
    >
      {label || (num < 900 ? String(num) : "—")}
    </span>
  );
}

function formatHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "";
  }
}

export function UniversityNavigator({
  universities,
  bookmarks,
  professors,
  sheets,
  onToggleBookmark,
  onAddSchoolSheet,
  onExtractCollege,
  onJumpToSchoolMail,
}: {
  universities: UniversityItem[];
  bookmarks: string[];
  professors: Professor[];
  sheets: string[];
  onToggleBookmark: (uid: string) => Promise<void>;
  onAddSchoolSheet: (schoolName: string) => Promise<void>;
  onExtractCollege: (schoolName: string, pageUrl: string, collegeName: string) => void;
  onJumpToSchoolMail: (sheetName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [province, setProvince] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [contactFilter, setContactFilter] = useState<ContactFilterKey>("ALL");
  const [sortBy, setSortBy] = useState<"rank" | "score" | "colleges">("rank");
  const [hoverSync, setHoverSync] = useState(true);

  const [selectedId, setSelectedId] = useState<string>("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  // Inner workbench filter state
  const [collegeQuery, setCollegeQuery] = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState("ALL");
  const [onlyWithFaculty, setOnlyWithFaculty] = useState(false);
  const [creatingSheet, setCreatingSheet] = useState(false);

  const bookmarkSet = useMemo(() => new Set(bookmarks), [bookmarks]);

  const contactByUniv = useMemo(() => {
    const mp: Record<string, SchoolContactSummary> = {};
    for (const u of universities) {
      mp[u.id] = computeSchoolContact(u, professors, sheets);
    }
    return mp;
  }, [universities, professors, sheets]);

  // Dynamic filter dropdown values
  const provinces = useMemo(() => {
    const s = new Set<string>();
    universities.forEach((u) => {
      if (u.province) s.add(u.province);
    });
    return Array.from(s);
  }, [universities]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    universities.forEach((u) => {
      if (u.category) s.add(u.category);
    });
    return Array.from(s);
  }, [universities]);

  const tiersList = useMemo(() => {
    const s = new Set<string>();
    universities.forEach((u) => {
      (u.tags || []).forEach((t) => s.add(t));
    });
    return ["985", "211", "双一流"].filter((t) => s.has(t));
  }, [universities]);

  // Summary counts
  const summaryStats = useMemo(() => {
    let contacted = 0;
    let preparing = 0;
    let uncontacted = 0;
    for (const u of universities) {
      const c = contactByUniv[u.id];
      if (!c || c.stage === "none" || c.stage === "sheet_only") {
        uncontacted += 1;
      } else if (c.stage === "replied" || c.stage === "sent") {
        contacted += 1;
      } else {
        preparing += 1;
      }
    }
    return {
      total: universities.length,
      contacted,
      preparing,
      uncontacted,
      bookmarked: universities.filter((u) => bookmarkSet.has(u.id)).length,
    };
  }, [universities, contactByUniv, bookmarkSet]);

  // Filtered + sorted universities
  const filteredUniversities = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = universities.filter((u) => {
      if (province !== "ALL" && u.province !== province) return false;
      if (category !== "ALL" && u.category !== category) return false;
      if (tier !== "ALL" && !(u.tags || []).includes(tier)) return false;

      const c = contactByUniv[u.id];
      if (contactFilter === "contacted" && c?.stage !== "replied" && c?.stage !== "sent") return false;
      if (contactFilter === "preparing" && c?.stage !== "preparing") return false;
      if (
        contactFilter === "uncontacted" &&
        c &&
        (c.stage === "replied" || c.stage === "sent" || c.stage === "preparing")
      ) {
        return false;
      }
      if (contactFilter === "bookmarked" && !bookmarkSet.has(u.id)) return false;

      if (q) {
        const collegeHit = (u.colleges || []).some(
          (col) =>
            col.name.toLowerCase().includes(q) ||
            (col.discipline_tags || []).some((t) => t.toLowerCase().includes(q))
        );
        const schoolHit =
          u.name.toLowerCase().includes(q) ||
          (u.name_en || "").toLowerCase().includes(q) ||
          (u.province || "").toLowerCase().includes(q) ||
          (u.city || "").toLowerCase().includes(q);
        if (!schoolHit && !collegeHit) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "score") {
        return (b.score ?? -1) - (a.score ?? -1) || a.ranking - b.ranking;
      }
      if (sortBy === "colleges") {
        return (b.colleges?.length || 0) - (a.colleges?.length || 0) || a.ranking - b.ranking;
      }
      return (a.ranking ?? 999) - (b.ranking ?? 999);
    });
    return list;
  }, [
    universities,
    province,
    category,
    tier,
    contactFilter,
    query,
    sortBy,
    contactByUniv,
    bookmarkSet,
  ]);

  // Keep valid selection automatically
  useEffect(() => {
    if (filteredUniversities.length === 0) return;
    if (!selectedId || !filteredUniversities.some((u) => u.id === selectedId)) {
      setSelectedId(filteredUniversities[0].id);
    }
  }, [filteredUniversities, selectedId]);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const activeUniv = useMemo(
    () =>
      filteredUniversities.find((u) => u.id === selectedId) ||
      filteredUniversities[0] ||
      null,
    [filteredUniversities, selectedId]
  );

  // Reset per-school subfilter lightly when active school changes
  useEffect(() => {
    setDisciplineFilter("ALL");
    setCollegeQuery("");
  }, [activeUniv?.id]);

  function handleRowMouseEnter(uid: string) {
    setHoveredId(uid);
    if (!hoverSync) return;
    if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
    // 180ms hover-intent dwell prevents accidental focus steals when sweeping toward right workbench
    hoverTimerRef.current = window.setTimeout(() => {
      setSelectedId(uid);
    }, 180);
  }

  function handleRowMouseLeave(uid: string) {
    if (hoveredId === uid) setHoveredId(null);
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }

  // Right workbench college filtering & search highlighting
  const activeColleges = useMemo(() => {
    if (!activeUniv) return [];
    const topQ = query.trim().toLowerCase();
    const innerQ = collegeQuery.trim().toLowerCase();
    const cols = (activeUniv.colleges || []).filter((col) => {
      if (onlyWithFaculty && !col.faculty_url) return false;
      if (
        disciplineFilter !== "ALL" &&
        !(col.discipline_tags || []).includes(disciplineFilter)
      ) {
        return false;
      }
      if (innerQ) {
        const hay = `${col.name} ${(col.discipline_tags || []).join(" ")}`.toLowerCase();
        if (!hay.includes(innerQ)) return false;
      }
      return true;
    });

    // If user typed a college keyword in top search bar, bubble matching colleges to top
    if (topQ) {
      return [...cols].sort((a, b) => {
        const aMatch = a.name.toLowerCase().includes(topQ) ? 1 : 0;
        const bMatch = b.name.toLowerCase().includes(topQ) ? 1 : 0;
        return bMatch - aMatch;
      });
    }
    return cols;
  }, [activeUniv, onlyWithFaculty, disciplineFilter, collegeQuery, query]);

  const activeDisciplines = useMemo(() => {
    if (!activeUniv) return [];
    const counts = new Map<string, number>();
    for (const col of activeUniv.colleges || []) {
      for (const t of col.discipline_tags || []) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeUniv]);

  const totalMatchingCollegesAcrossAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return 0;
    let sum = 0;
    for (const u of filteredUniversities) {
      for (const col of u.colleges || []) {
        if (col.name.toLowerCase().includes(q)) sum += 1;
      }
    }
    return sum;
  }, [filteredUniversities, query]);

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-[#F8F9FB] overflow-hidden">
      {/* Top Aggregated Search & ShanghaiRanking-Style Filter Bar */}
      <div className="bg-white border-b border-slate-900/[0.07] px-5 py-3 space-y-2.5 shrink-0">
        {/* Row 1: Title, Contact Progress Chips, Aggregated Search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-[#E11D48] shrink-0" />
              <h2 className="text-[15.5px] font-bold tracking-[-0.015em] text-[#18181B] m-0">
                985 高校与院系官网导航
              </h2>
              <span className="text-[12px] text-[#71717A] tabular-nums">
                共 {filteredUniversities.length} / {universities.length} 所
              </span>
            </div>

            <div className="h-3.5 w-px bg-slate-900/[0.08] hidden md:block" />

            {/* Contact Progress Filter Pills */}
            <div className="inline-flex items-center gap-1 flex-wrap">
              {(
                [
                  { id: "ALL", label: "全部", count: summaryStats.total, dot: "bg-[#9CA3AF]" },
                  { id: "contacted", label: "已联系", count: summaryStats.contacted, dot: "bg-[#10B981]" },
                  { id: "preparing", label: "筹备中", count: summaryStats.preparing, dot: "bg-[#3B82F6]" },
                  { id: "uncontacted", label: "尚未联系", count: summaryStats.uncontacted, dot: "bg-[#D4D4D8]" },
                  { id: "bookmarked", label: "已收藏", count: summaryStats.bookmarked, dot: "bg-[#F59E0B]" },
                ] as const
              ).map((pill) => {
                const active = contactFilter === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setContactFilter(pill.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] cursor-pointer transition-all duration-150 select-none active:scale-[0.97]",
                      active
                        ? "bg-[#18181B] text-white font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.16)]"
                        : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#EAECEF] hover:text-[#18181B]"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-white" : pill.dot)} />
                    <span>{pill.label}</span>
                    <span className={cn("font-mono text-[11px] tabular-nums", active ? "text-white/80" : "text-[#71717A]")}>
                      {pill.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Global School & College Search Box */}
          <div className="flex items-center gap-2.5 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-[320px] xl:w-[360px]">
              <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜校名、英文名或学院（如：人工智能 / 新闻）"
                className="w-full h-8.5 pl-8.5 pr-8 bg-[#F8F9FB] focus:bg-white border border-slate-900/[0.09] rounded-[9px] text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/12 transition-all"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded inline-flex items-center justify-center text-[#9CA3AF] hover:text-[#18181B] hover:bg-slate-900/[0.05] cursor-pointer"
                  aria-label="清空搜索"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: ShanghaiRanking Matching Dropdown Filters + Hover-Sync Toggle */}
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11.5px] text-[#71717A] mr-0.5">
              <Filter className="w-3 h-3" />
              筛选
            </span>
            <SelectBox
              variant="mini"
              value={province}
              onValueChange={setProvince}
              options={[
                { value: "ALL", label: "省市：全部" },
                ...provinces.map((p) => ({ value: p, label: `省市：${p}` })),
              ]}
              className="w-[126px]"
            />
            <SelectBox
              variant="mini"
              value={category}
              onValueChange={setCategory}
              options={[
                { value: "ALL", label: "类型：全部" },
                ...categories.map((c) => ({ value: c, label: `类型：${c}` })),
              ]}
              className="w-[126px]"
            />
            <SelectBox
              variant="mini"
              value={tier}
              onValueChange={setTier}
              options={[
                { value: "ALL", label: "办学层次：全部" },
                ...tiersList.map((t) => ({ value: t, label: `层次：${t}` })),
              ]}
              className="w-[138px]"
            />
            <SelectBox
              variant="mini"
              value={sortBy}
              onValueChange={(v) => setSortBy(v as "rank" | "score" | "colleges")}
              options={[
                { value: "rank", label: "排序：软科排名" },
                { value: "score", label: "排序：总分从高到低" },
                { value: "colleges", label: "排序：学院数量" },
              ]}
              className="w-[152px]"
            />

            {(province !== "ALL" ||
              category !== "ALL" ||
              tier !== "ALL" ||
              contactFilter !== "ALL" ||
              query.trim() !== "") && (
              <button
                type="button"
                onClick={() => {
                  setProvince("ALL");
                  setCategory("ALL");
                  setTier("ALL");
                  setContactFilter("ALL");
                  setQuery("");
                }}
                className="text-[11.5px] text-[#2563EB] hover:underline px-1.5 cursor-pointer"
              >
                重置筛选
              </button>
            )}

            {query.trim() && totalMatchingCollegesAcrossAll > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[11.5px] font-medium">
                跨校命中 {totalMatchingCollegesAcrossAll} 个相关学院
              </span>
            )}
          </div>

          <SwitchControl
            checked={hoverSync}
            onCheckedChange={setHoverSync}
            label="鼠标悬停滑出即预览学校"
            title="开启后，鼠标在左侧高校停留片刻即可顺滑切换右侧工作台，无需频繁点击"
          />
        </div>
      </div>

      {/* Main Split: Left University Ranking List + Right University & College Workbench */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left: ShanghaiRanking-Inspired Interactive University List */}
        <aside className="w-[430px] lg:w-[468px] xl:w-[504px] shrink-0 bg-white border-r border-slate-900/[0.07] flex flex-col min-h-0">
          {/* Table Header mimicking ShanghaiRanking */}
          <div className="px-3.5 py-2 bg-[#F8F9FB] border-b border-slate-900/[0.06] grid grid-cols-[44px_1fr_92px_68px] items-center gap-2 text-[11px] font-medium text-[#71717A] select-none shrink-0">
            <span className="text-center">排名</span>
            <span>学校名称 / 层次标签</span>
            <span className="text-right">省市 · 类型</span>
            <span className="text-right">总分 / 进度</span>
          </div>

          {/* Scrollable List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredUniversities.length === 0 ? (
              <div className="py-16 px-6 text-center space-y-2">
                <GraduationCap className="w-8 h-8 text-[#D4D4D8] mx-auto" />
                <div className="text-[13px] font-medium text-[#52525B]">
                  没有符合当前筛选条件的高校
                </div>
                <div className="text-[12px] text-[#9CA3AF]">
                  试试清空搜索关键词或切换“联系状态”筛选
                </div>
              </div>
            ) : (
              filteredUniversities.map((u) => {
                const isSelected = activeUniv?.id === u.id;
                const isHovered = hoveredId === u.id;
                const cStat = contactByUniv[u.id];
                const isBookmarked = bookmarkSet.has(u.id);
                const collegePreview = (u.colleges || []).slice(0, 4);

                return (
                  <div
                    key={u.id}
                    onMouseEnter={() => handleRowMouseEnter(u.id)}
                    onMouseLeave={() => handleRowMouseLeave(u.id)}
                    onClick={() => setSelectedId(u.id)}
                    className={cn(
                      "group relative rounded-[12px] p-2.5 cursor-pointer select-none transition-colors duration-150",
                      isSelected
                        ? "bg-[#F4F6FA] ring-1 ring-[#2563EB]/25"
                        : "hover:bg-[#F8F9FB]"
                    )}
                  >
                    {/* Smooth Sliding Layout Highlight Pill */}
                    {isHovered && !isSelected && (
                      <motion.div
                        layoutId="univ-hover-highlight"
                        transition={{ type: "spring", stiffness: 520, damping: 38 }}
                        className="pointer-events-none absolute inset-0 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.08]"
                      />
                    )}
                    {isSelected && (
                      <motion.span
                        layoutId="univ-active-rail"
                        transition={{ type: "spring", stiffness: 540, damping: 40 }}
                        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-[#2563EB] z-20"
                      />
                    )}

                    {/* Main Row Grid matching ShanghaiRanking */}
                    <div className="relative z-10 grid grid-cols-[44px_1fr_92px_68px] items-center gap-2">
                      <div className="flex justify-center">
                        <RankBadge label={u.ranking_label} rankNum={u.ranking} />
                      </div>

                      <div className="flex items-center gap-2.5 min-w-0">
                        <UniversityCrest univ={u} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[13.5px] font-bold text-[#18181B] truncate">
                              {u.name}
                            </span>
                            {isBookmarked && (
                              <Bookmark className="w-3 h-3 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                            )}
                          </div>
                          <div className="text-[11px] text-[#71717A] truncate">
                            {u.name_en}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <span className="text-[10.5px] text-[#52525B] bg-white/90 px-1.5 py-0.2 rounded border border-slate-900/[0.07]">
                              {(u.tags || []).join("/")}
                            </span>
                            <span className="text-[10.5px] text-[#9CA3AF] font-mono tabular-nums">
                              {u.colleges?.length || 0}院系
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right min-w-0">
                        <div className="text-[12px] font-medium text-[#3F3F46] truncate">
                          {u.province}
                        </div>
                        <div className="text-[11px] text-[#71717A] truncate">
                          {u.category}
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end gap-1">
                        <span className="font-mono text-[12.5px] font-semibold text-[#18181B] tabular-nums">
                          {u.score !== null && u.score !== undefined ? u.score.toFixed(1) : "—"}
                        </span>
                        {cStat?.stage === "replied" ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-[#FFF1F2] text-[#BE123C] text-[10px] font-semibold ring-1 ring-[#F43F5E]/20">
                            已回信 {cStat.replied}
                          </span>
                        ) : cStat?.stage === "sent" ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-[#ECFDF5] text-[#047857] text-[10px] font-semibold ring-1 ring-[#10B981]/20">
                            已联系 {cStat.sent}
                          </span>
                        ) : cStat?.stage === "preparing" ? (
                          <span className="px-1.5 py-0.2 rounded-full bg-[#EFF6FF] text-[#1D4ED8] text-[10px] font-medium ring-1 ring-[#3B82F6]/20">
                            筹备 {cStat.preparing}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#A1A1AA]">未联系</span>
                        )}
                      </div>
                    </div>

                    {/* Smooth Sliding Micro-Module Bar on Hover or Active Selection */}
                    <AnimatePresence initial={false}>
                      {(isHovered || isSelected) && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: EASE_OUT }}
                          className="relative z-10 mt-2 pt-2 border-t border-slate-900/[0.06] flex items-center gap-1.5 flex-wrap pl-[52px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={u.official_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-[#18181B] text-white text-[10.5px] font-medium hover:bg-[#27272A] transition-colors"
                          >
                            <Globe className="w-2.5 h-2.5" />
                            <span>学校官网</span>
                            <ArrowUpRight className="w-2.5 h-2.5 opacity-80" />
                          </a>
                          {u.grad_url && (
                            <a
                              href={u.grad_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] bg-white text-[#3F3F46] ring-1 ring-slate-900/[0.09] text-[10.5px] hover:text-[#18181B] hover:border-slate-900/[0.2] transition-colors"
                            >
                              <GraduationCap className="w-2.5 h-2.5 text-[#2563EB]" />
                              <span>研招</span>
                            </a>
                          )}
                          {collegePreview.map((col) => (
                            <a
                              key={col.name}
                              href={col.faculty_url || col.college_url}
                              target="_blank"
                              rel="noreferrer"
                              title={col.faculty_url ? `${col.name} · 直达师资队伍` : `${col.name}官网`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-[6px] bg-white/90 text-[#52525B] ring-1 ring-slate-900/[0.07] text-[10.5px] max-w-[110px] truncate hover:bg-[#EFF6FF] hover:text-[#1D4ED8] hover:ring-[#3B82F6]/25 transition-colors"
                            >
                              {col.name}
                            </a>
                          ))}
                          {(u.colleges?.length || 0) > 4 && (
                            <span className="text-[10.5px] text-[#71717A] ml-auto pr-0.5">
                              +{u.colleges.length - 4} 学院 →
                            </span>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: Animated Sliding University & Colleges Workbench */}
        <main className="flex-1 min-w-0 bg-[#F8F9FB] overflow-y-auto">
          {!activeUniv ? (
            <div className="h-full flex flex-col items-center justify-center p-10 text-center text-[#9CA3AF]">
              <Building2 className="w-10 h-10 text-[#D4D4D8] mb-3" />
              <p className="text-[14px] font-medium text-[#52525B]">请从左侧选择一所高校</p>
              <p className="text-[12px] mt-1">即可查看学校官网、研招网与下设全部二级学院及师资链接</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeUniv.id}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                className="max-w-[1060px] mx-auto p-5 lg:p-6 space-y-4"
              >
                {/* University Hero Card + Official Portals */}
                <div className="bg-white rounded-[16px] ring-1 ring-slate-900/[0.075] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.04)] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 min-w-0">
                      <UniversityCrest univ={activeUniv} size="lg" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h1 className="text-[20px] font-bold tracking-[-0.02em] text-[#18181B] m-0">
                            {activeUniv.name}
                          </h1>
                          <RankBadge
                            label={`排名 ${activeUniv.ranking_label}`}
                            rankNum={activeUniv.ranking}
                          />
                          {activeUniv.score !== null && activeUniv.score !== undefined && (
                            <span className="px-2 py-0.5 rounded-[7px] bg-[#F4F5F7] text-[#3F3F46] font-mono text-[11.5px] font-medium tabular-nums">
                              软科总分 {activeUniv.score.toFixed(1)}
                            </span>
                          )}
                        </div>
                        <div className="text-[12.5px] text-[#71717A] mt-0.5">
                          {activeUniv.name_en}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11.5px] text-[#52525B]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F8F9FB] ring-1 ring-slate-900/[0.07]">
                            {activeUniv.city || activeUniv.province}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[#F8F9FB] ring-1 ring-slate-900/[0.07]">
                            {activeUniv.category}类
                          </span>
                          {activeUniv.admin_type && (
                            <span className="px-2 py-0.5 rounded-md bg-[#F8F9FB] ring-1 ring-slate-900/[0.07]">
                              {activeUniv.admin_type}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1D4ED8] font-medium ring-1 ring-[#3B82F6]/20">
                            {(activeUniv.tags || []).join(" / ")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant={bookmarkSet.has(activeUniv.id) ? "blue" : "secondary"}
                        size="sm"
                        onClick={() => onToggleBookmark(activeUniv.id)}
                      >
                        <Bookmark
                          className={cn(
                            "w-3.5 h-3.5 transition-transform",
                            bookmarkSet.has(activeUniv.id) && "fill-[#2563EB] scale-110"
                          )}
                        />
                        <span>{bookmarkSet.has(activeUniv.id) ? "已收藏" : "收藏高校"}</span>
                      </Button>
                    </div>
                  </div>

                  {/* Quick Official Portals Mini-Modules */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <a
                      href={activeUniv.official_url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#18181B] text-white hover:bg-[#27272A] transition-all shadow-[0_2px_6px_rgba(15,23,42,0.14)]"
                    >
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[#93C5FD]" />
                          <span>学校官网主页</span>
                        </div>
                        <div className="font-mono text-[11px] text-white/70 truncate mt-0.5">
                          {formatHost(activeUniv.official_url)}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-white/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
                    </a>

                    {activeUniv.grad_url ? (
                      <a
                        href={activeUniv.grad_url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] hover:bg-white hover:ring-[#2563EB]/30 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-[#18181B] flex items-center gap-1.5">
                            <GraduationCap className="w-3.5 h-3.5 text-[#2563EB]" />
                            <span>研究生院 / 研招</span>
                          </div>
                          <div className="font-mono text-[11px] text-[#71717A] truncate mt-0.5">
                            {formatHost(activeUniv.grad_url)}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-[#9CA3AF] group-hover:text-[#2563EB] transition-colors shrink-0" />
                      </a>
                    ) : (
                      <div className="flex items-center gap-2.5 p-3 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] text-[#9CA3AF] text-[12px]">
                        <GraduationCap className="w-4 h-4 shrink-0" />
                        <span>研招网请由官网主页进入</span>
                      </div>
                    )}

                    {activeUniv.faculty_portal ? (
                      <a
                        href={activeUniv.faculty_portal}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#EFF6FF]/65 ring-1 ring-[#3B82F6]/20 hover:bg-[#EFF6FF] transition-all"
                      >
                        <div className="min-w-0">
                          <div className="text-[12.5px] font-semibold text-[#1D4ED8] flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5" />
                            <span>全校教师主页库</span>
                          </div>
                          <div className="font-mono text-[11px] text-[#3B82F6] truncate mt-0.5">
                            {formatHost(activeUniv.faculty_portal)}
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                      </a>
                    ) : (
                      <div className="flex items-center justify-between gap-2 p-3 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.06]">
                        <div>
                          <div className="text-[12.5px] font-semibold text-[#18181B]">
                            师资直链覆盖
                          </div>
                          <div className="text-[11px] text-[#71717A] mt-0.5 tabular-nums">
                            {activeUniv.stats?.faculty_links || 0} / {activeUniv.colleges.length} 个学院直达
                          </div>
                        </div>
                        <Users className="w-4 h-4 text-[#2563EB] shrink-0" />
                      </div>
                    )}

                    {/* Excel Contact Integration Tile */}
                    {(() => {
                      const cs = contactByUniv[activeUniv.id];
                      if (cs && cs.total > 0) {
                        return (
                          <button
                            type="button"
                            onClick={() => onJumpToSchoolMail(cs.sheetName)}
                            className="flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#ECFDF5]/75 ring-1 ring-[#10B981]/25 hover:bg-[#ECFDF5] text-left cursor-pointer transition-all"
                          >
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#047857] flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>已录 {cs.total} 位导师</span>
                              </div>
                              <div className="text-[11px] text-[#059669] truncate mt-0.5">
                                已投 {cs.sent + cs.replied} · 回信 {cs.replied} · 去写信管理 →
                              </div>
                            </div>
                          </button>
                        );
                      }
                      if (cs?.hasSheet) {
                        return (
                          <button
                            type="button"
                            onClick={() => onJumpToSchoolMail(cs.sheetName)}
                            className="flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] hover:bg-white text-left cursor-pointer transition-all"
                          >
                            <div className="min-w-0">
                              <div className="text-[12.5px] font-semibold text-[#18181B] flex items-center gap-1.5">
                                <FileSpreadsheet className="w-3.5 h-3.5 text-[#10B981]" />
                                <span>Excel 已建分页</span>
                              </div>
                              <div className="text-[11px] text-[#71717A] truncate mt-0.5">
                                点击前往收集或写信 →
                              </div>
                            </div>
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          disabled={creatingSheet}
                          onClick={async () => {
                            setCreatingSheet(true);
                            try {
                              await onAddSchoolSheet(activeUniv.name);
                            } finally {
                              setCreatingSheet(false);
                            }
                          }}
                          className="flex items-center justify-between gap-2.5 p-3 rounded-[12px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.08] hover:bg-[#EFF6FF]/60 hover:ring-[#3B82F6]/30 text-left cursor-pointer transition-all disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-semibold text-[#18181B] flex items-center gap-1.5">
                              <FileSpreadsheet className="w-3.5 h-3.5 text-[#2563EB]" />
                              <span>{creatingSheet ? "建表中..." : "在 Excel 建该校表"}</span>
                            </div>
                            <div className="text-[11px] text-[#71717A] truncate mt-0.5">
                              尚无投递记录 · 点此快速建分页
                            </div>
                          </div>
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {/* Secondary Colleges & Faculty Module Grid */}
                <div className="bg-white rounded-[16px] ring-1 ring-slate-900/[0.075] shadow-[0_2px_10px_-2px_rgba(15,23,42,0.04)] p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-[14.5px] font-bold text-[#18181B] m-0">
                        二级学院与师资直达（{activeColleges.length} / {activeUniv.colleges.length}）
                      </h3>
                      <p className="text-[11.5px] text-[#71717A] m-0 mt-0.5">
                        点击「学院官网」或「师资队伍」直达院系网站；点击「AI 抓导师」可直接抽取该院导师写入 Excel
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                      <SwitchControl
                        checked={onlyWithFaculty}
                        onCheckedChange={setOnlyWithFaculty}
                        label="只看有师资直链"
                      />
                      <div className="relative w-[200px]">
                        <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={collegeQuery}
                          onChange={(e) => setCollegeQuery(e.target.value)}
                          placeholder="在本校内筛选学院..."
                          className="w-full h-7.5 pl-8 pr-6 bg-[#F8F9FB] focus:bg-white border border-slate-900/[0.09] rounded-[8px] text-[12px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB]"
                        />
                        {collegeQuery && (
                          <button
                            type="button"
                            onClick={() => setCollegeQuery("")}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#18181B] cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discipline Category Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setDisciplineFilter("ALL")}
                      className={cn(
                        "px-2.5 py-1 rounded-[7px] text-[11.5px] cursor-pointer transition-colors",
                        disciplineFilter === "ALL"
                          ? "bg-[#18181B] text-white font-semibold"
                          : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#EAECEF]"
                      )}
                    >
                      全部学科（{activeUniv.colleges.length}）
                    </button>
                    {activeDisciplines.map(([tag, cnt]) => {
                      const active = disciplineFilter === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setDisciplineFilter(active ? "ALL" : tag)}
                          className={cn(
                            "px-2.5 py-1 rounded-[7px] text-[11.5px] cursor-pointer transition-colors",
                            active
                              ? "bg-[#2563EB] text-white font-semibold"
                              : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#EAECEF]"
                          )}
                        >
                          {tag} {cnt}
                        </button>
                      );
                    })}
                  </div>

                  {/* Colleges Cards Grid */}
                  {activeColleges.length === 0 ? (
                    <div className="py-12 text-center text-[12.5px] text-[#9CA3AF]">
                      暂无匹配的学院，试试切换上方学科分类或关闭“只看有师资直链”
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {activeColleges.map((col, idx) => {
                        const globalMatched =
                          query.trim() !== "" &&
                          col.name.toLowerCase().includes(query.trim().toLowerCase());
                        return (
                          <motion.div
                            key={`${activeUniv.id}-${col.name}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              duration: 0.2,
                              delay: Math.min(idx * 0.014, 0.22),
                              ease: EASE_OUT,
                            }}
                            className={cn(
                              "group rounded-[12px] p-3.5 bg-[#FAFAFC] hover:bg-white ring-1 transition-[transform,background-color,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-6px_rgba(15,23,42,0.09)] flex flex-col justify-between gap-3",
                              globalMatched
                                ? "ring-[#2563EB]/45 bg-[#EFF6FF]/35"
                                : "ring-slate-900/[0.075] hover:ring-slate-900/[0.15]"
                            )}
                          >
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-[13.5px] font-semibold text-[#18181B] leading-snug m-0">
                                  {col.name}
                                </h4>
                                {globalMatched && (
                                  <span className="px-1.5 py-0.2 rounded bg-[#2563EB] text-white text-[10px] font-medium shrink-0">
                                    命中
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {(col.discipline_tags || []).map((t) => (
                                  <span
                                    key={t}
                                    className="px-1.5 py-0.2 rounded bg-white ring-1 ring-slate-900/[0.06] text-[10.5px] text-[#52525B]"
                                  >
                                    {t}
                                  </span>
                                ))}
                                <span className="font-mono text-[10.5px] text-[#9CA3AF] truncate">
                                  {formatHost(col.college_url)}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-slate-900/[0.05]">
                              <a
                                href={col.college_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[7px] bg-white text-[#18181B] ring-1 ring-slate-900/[0.1] hover:border-slate-900/[0.22] text-[11.5px] font-medium transition-colors"
                              >
                                <Globe className="w-3 h-3 text-[#52525B]" />
                                <span>学院官网</span>
                              </a>

                              {col.faculty_url ? (
                                <a
                                  href={col.faculty_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="直接跳转到该学院的师资队伍 / 导师介绍页"
                                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-[7px] bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#3B82F6]/25 hover:bg-[#DBEAFE] text-[11.5px] font-semibold transition-colors"
                                >
                                  <Users className="w-3 h-3" />
                                  <span>师资队伍</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </a>
                              ) : null}

                              <button
                                type="button"
                                onClick={() =>
                                  onExtractCollege(
                                    activeUniv.name,
                                    col.faculty_url || col.college_url,
                                    col.name
                                  )
                                }
                                title="将该学院官网或师资页送入 AI 导入弹窗提取导师"
                                className="inline-flex items-center gap-1 h-7 px-2 rounded-[7px] text-[#52525B] hover:bg-[#F4F5F7] hover:text-[#18181B] text-[11.5px] cursor-pointer ml-auto transition-colors"
                              >
                                <Sparkles className="w-3 h-3 text-[#2563EB]" />
                                <span>抓导师</span>
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </section>
  );
}
