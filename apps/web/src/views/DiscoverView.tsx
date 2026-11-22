import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData, CatalogAdvisor } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorPhotoAvatar } from "@/components/ui/AdvisorPhotoAvatar.js";

export interface DiscoverViewProps {
  bootstrap: BootstrapData;
}

const SORT_LABELS: Record<"fit" | "rank" | "updated", string> = {
  fit: "AI 契合度",
  rank: "软科排名",
  updated: "最近更新",
};

/**
 * 视图 1：发现导师（多维软科筛选条 + 4 槽位 4 档字号导师档案卡）。
 */
export function DiscoverView({ bootstrap }: DiscoverViewProps) {
  const queryClient = useQueryClient();
  const openWriterFor = useAppStore((s) => s.openWriterFor);
  const setPhotoModalData = useAppStore((s) => s.setPhotoModalData);

  const [q, setQ] = useState("");
  const [rankTier, setRankTier] = useState<"all" | "top20" | "double">("all");
  const [honorCategory, setHonorCategory] = useState<"all" | "national" | "provincial">(
    "all"
  );
  const [recruitOnly, setRecruitOnly] = useState(false);
  const [sort, setSort] = useState<"fit" | "rank" | "updated">("fit");
  const [facetOpen, setFacetOpen] = useState(false);
  const facetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!facetOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (facetRef.current && !facetRef.current.contains(e.target as Node)) {
        setFacetOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [facetOpen]);

  const catalogQuery = useQuery({
    queryKey: ["catalog-advisors", q, rankTier, honorCategory, recruitOnly, sort],
    queryFn: () =>
      workerApi.getCatalogAdvisors({
        q,
        rankTier,
        honorCategory,
        recruitOnly,
        sort,
      }),
    initialData:
      !q && rankTier === "all" && honorCategory === "all" && !recruitOnly && sort === "fit"
        ? {
            ok: true as const,
            universities: bootstrap.catalogUniversities || [],
            advisors: bootstrap.catalogAdvisors || [],
          }
        : undefined,
  });

  const adoptMutation = useMutation({
    mutationFn: async (item: CatalogAdvisor) => {
      if (item.adoptedAdvisorId) {
        await workerApi.unadoptCatalogAdvisor(item.id);
        return { action: "removed" as const, item };
      }
      await workerApi.adoptCatalogAdvisor(item.id);
      return { action: "added" as const, item };
    },
    onSuccess: async (res) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-advisors"] }),
      ]);
      toast.success(
        res.action === "added"
          ? `已将 ${res.item.name} 老师加入「我的导师」`
          : `已从「我的导师」移出 ${res.item.name} 老师`
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const directWriteMutation = useMutation({
    mutationFn: async (item: CatalogAdvisor) => {
      if (item.adoptedAdvisorId) return item.adoptedAdvisorId;
      const res = await workerApi.adoptCatalogAdvisor(item.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-advisors"] }),
      ]);
      return res.advisor.id;
    },
    onSuccess: (advisorId) => {
      openWriterFor(advisorId);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const catalogAdvisors = catalogQuery.data?.advisors || [];
  const avatarStyle = bootstrap.preferences.avatarStyle;

  function cycleSort() {
    setSort((prev) =>
      prev === "fit" ? "rank" : prev === "rank" ? "updated" : "fit"
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-7 md:px-8 pb-8 pt-4 sm:pt-5 max-w-[1140px] w-full mx-auto space-y-5">
      {/* 页头 + 单行多维过滤条 */}
      <div className="space-y-3 pt-1 relative" ref={facetRef}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#0F172A] m-0">
              高校博导数据库
            </h1>
            <p className="text-[12.5px] text-[#64748B] m-0 mt-1">
              按软科综合/学科排名持续沉淀结构化科研画像 · 四档字号级差与真实肖像预览
            </p>
          </div>
          <span className="text-[12px] text-[#64748B] cue-mono">
            当前匹配 {catalogAdvisors.length} 位导师（覆盖 {bootstrap.catalogUniversities?.length || 0} 所高校）
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-56">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                type="text"
                placeholder="搜索高校、导师或方向..."
                className="h-9 w-full pl-9 pr-3.5 rounded-full bg-white hairline text-[12.5px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none theme-focus transition-all"
              />
              <Search className="w-3.5 h-3.5 text-[#94A3B8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={() => setFacetOpen((v) => !v)}
              className={cn(
                "h-9 px-3.5 rounded-full text-[12px] font-medium cursor-pointer inline-flex items-center gap-1.5 transition-all",
                rankTier !== "all" || honorCategory !== "all"
                  ? "theme-soft-pill font-semibold"
                  : "bg-white hairline text-[#334155] theme-hover-border"
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                软科梯度 / 人才帽子
                {rankTier !== "all" || honorCategory !== "all" ? " (已筛选)" : ""}
              </span>
              <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
            </button>

            <button
              type="button"
              onClick={() => setRecruitOnly((v) => !v)}
              className={cn(
                "h-9 px-3.5 rounded-full text-[12px] font-medium cursor-pointer inline-flex items-center gap-1.5 transition-all",
                recruitOnly
                  ? "theme-soft-pill font-semibold"
                  : "bg-white hairline text-[#334155] theme-hover-border"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span>仅看明确招博</span>
            </button>
          </div>

          <button
            type="button"
            onClick={cycleSort}
            className="h-9 px-3.5 rounded-full bg-white hairline text-[12px] font-medium text-[#475569] cursor-pointer hover:text-[#0F172A] inline-flex items-center gap-1.5 transition-all"
          >
            <span>排序：{SORT_LABELS[sort]}</span>
            <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
          </button>
        </div>

        {/* 多维筛选浮层 */}
        {facetOpen && (
          <div className="absolute left-0 md:left-56 top-full mt-2 w-full sm:w-[380px] max-w-[calc(100vw-2rem)] glass-popover rounded-[24px] p-5 z-40 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#0F172A]">
                多维度结构化筛选
              </span>
              <button
                type="button"
                onClick={() => setFacetOpen(false)}
                className="text-xs text-[#64748B] hover:text-[#0F172A] cursor-pointer border-0 bg-transparent"
              >
                关闭
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[12px] font-medium text-[#64748B]">软科梯度</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "all", label: "全部高校" },
                  { key: "top20", label: "软科 Top 20" },
                  { key: "double", label: "双一流 / 特色重点" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setRankTier(opt.key as "all" | "top20" | "double")}
                    className={cn(
                      "px-3 py-1 rounded-full text-[12px] cursor-pointer border-0 transition-all",
                      rankTier === opt.key
                        ? "bg-[#141417] text-white font-semibold"
                        : "neutral-pill font-medium"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12px] font-medium text-[#64748B]">人才帽子</div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "all", label: "不限" },
                  { key: "national", label: "国家级（杰青 / 优青）" },
                  { key: "provincial", label: "省部领军 / 高峰人才" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() =>
                      setHonorCategory(opt.key as "all" | "national" | "provincial")
                    }
                    className={cn(
                      "px-3 py-1 rounded-full text-[12px] cursor-pointer border-0 transition-all",
                      honorCategory === opt.key
                        ? "bg-[#141417] text-white font-semibold"
                        : "neutral-pill font-medium"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 严格 4 槽位宽幅导师档案卡列表 */}
      {catalogAdvisors.length === 0 ? (
        <div className="card-surface rounded-[24px] p-12 text-center text-[13px] text-[#64748B]">
          {catalogQuery.isFetching
            ? "正在检索公共导师档案..."
            : "没有匹配当前筛选条件的导师，可放宽搜索关键词或帽子条件重试。"}
        </div>
      ) : (
        <div className="space-y-4">
          {catalogAdvisors.map((a) => {
            const rankBadge = [
              a.softScienceRank ? `软科 #${a.softScienceRank}` : "",
              a.disciplineRankNote,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <article
                key={a.id}
                className="card-surface card-hover rounded-[24px] p-4 sm:p-[26px] space-y-4 relative hover:z-30 focus-within:z-30"
              >
                {/* 槽位 1：56px 宽松头像 + 4 档字号级差 + AI 契合度 + 收录切换 */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3.5 sm:gap-4">
                  <div className="flex items-start gap-3.5 sm:gap-[22px] min-w-0 flex-1 w-full">
                    <AdvisorPhotoAvatar
                      name={a.name}
                      school={a.universityName}
                      dept={a.dept}
                      title={a.title}
                      seed={`${a.universityName}::${a.name}`}
                      styleMode={avatarStyle}
                      photoUrl={a.photoUrl}
                      photoSource={a.photoSource}
                      homepageUrl={a.homepageUrl}
                      onOpenPhoto={() =>
                        setPhotoModalData({
                          name: a.name,
                          school: a.universityName,
                          dept: a.dept,
                          title: a.title,
                          homepageUrl: a.homepageUrl,
                          photoUrl: a.photoUrl,
                          photoSource: a.photoSource,
                          catalogId: a.id,
                          advisorId: a.adoptedAdvisorId ?? undefined,
                        })
                      }
                    />

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[20px] font-bold tracking-[-0.02em] text-[#0F172A] leading-tight">
                          {a.name}
                        </span>
                        {a.title && (
                          <span className="text-[13px] font-medium text-[#64748B]">
                            {a.title}
                          </span>
                        )}
                        {a.honorBadge && (
                          <span className="px-2.5 py-0.5 rounded-full text-[12px] font-medium honor-stone whitespace-nowrap">
                            {a.honorBadge}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">
                        <span className="text-[14px] font-bold text-[#0F172A]">
                          {a.universityName}
                        </span>
                        {a.dept && (
                          <>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[#475569]">{a.dept}</span>
                          </>
                        )}
                        {rankBadge && (
                          <>
                            <span className="text-[#94A3B8]">·</span>
                            <span className="text-[12.5px] font-medium text-[#64748B]">
                              {rankBadge}
                            </span>
                          </>
                        )}
                      </div>

                      {a.bio && (
                        <p className="text-[12px] text-[#94A3B8] m-0">{a.bio}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 w-full sm:w-auto pl-[70px] sm:pl-0">
                    <div className="text-right">
                      <div className="text-[18px] font-bold cue-mono theme-text leading-tight">
                        {a.defaultFitScore}%
                      </div>
                      <div className="text-[12px] text-[#94A3B8]">AI 契合</div>
                    </div>

                    <button
                      type="button"
                      disabled={adoptMutation.isPending}
                      onClick={() => adoptMutation.mutate(a)}
                      className={cn(
                        "px-4 py-2 rounded-full text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5 transition-all",
                        a.adoptedAdvisorId
                          ? "neutral-pill hairline text-[#0F172A]"
                          : "theme-cta border-0"
                      )}
                    >
                      {a.adoptedAdvisorId ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>已加入</span>
                        </>
                      ) : (
                        <span>+ 加入套磁</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* 槽位 2：无边框研究方向词条 + 等宽邮箱 */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.researchTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 rounded-full neutral-pill text-[12px] font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  {a.email && (
                    <span className="text-[12px] text-[#64748B] cue-mono inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                      {a.email}
                    </span>
                  )}
                </div>

                {/* 槽位 3：3 列 Hero KPI 矩阵 */}
                <div className="grid grid-cols-1 md:grid-cols-3 rounded-2xl card-well divide-y md:divide-y-0 md:divide-x divide-slate-200/70">
                  <div className="px-[18px] py-[14px] space-y-0.5">
                    <div className="text-[12px] text-[#94A3B8]">科研产出</div>
                    <div className="text-[15.5px] font-bold text-[#0F172A] tracking-[-0.01em]">
                      {a.kpiOutputsHero || "待补充"}
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      {a.kpiOutputsNote || "公开主页检索"}
                    </div>
                  </div>
                  <div className="px-[18px] py-[14px] space-y-0.5">
                    <div className="text-[12px] text-[#94A3B8]">课题与荣誉</div>
                    <div className="text-[15.5px] font-bold text-[#0F172A] tracking-[-0.01em]">
                      {a.kpiGrantsHero || "待补充"}
                    </div>
                    <div className="text-[12px] text-[#64748B]">
                      {a.kpiGrantsNote || "公开资助与奖项"}
                    </div>
                  </div>
                  <div className="px-[18px] py-[14px] space-y-0.5">
                    <div className="text-[12px] text-[#94A3B8]">博士招生</div>
                    <div className="text-[15.5px] font-bold text-[#0F172A] tracking-[-0.01em]">
                      {a.kpiQuotaHero || "待核实"}
                    </div>
                    <div
                      className={cn(
                        "inline-flex items-center gap-1.5 text-[12px]",
                        a.recruitOpen ? "text-[#0F172A] font-medium" : "text-[#64748B]"
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          a.recruitOpen ? "bg-[#10B981]" : "bg-slate-300"
                        )}
                      />
                      <span>{a.kpiQuotaNote || "以导师当季回信为准"}</span>
                    </div>
                  </div>
                </div>

                {/* 槽位 4：细线底栏 */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 hairline-t text-[12px]">
                  <span className="text-[#64748B]">{a.footerNote}</span>
                  <div className="flex items-center gap-3.5">
                    {a.sourceUpdatedAt && (
                      <span className="text-[#94A3B8]">
                        更新于 {a.sourceUpdatedAt}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={directWriteMutation.isPending}
                      onClick={() => directWriteMutation.mutate(a)}
                      className="theme-text text-[12.5px] font-semibold hover:underline cursor-pointer bg-transparent border-0 p-0 inline-flex items-center gap-1"
                    >
                      <span>直接去写信</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
