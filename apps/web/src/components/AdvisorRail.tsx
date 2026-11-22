import { useMemo, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  ADVISOR_STAGE_OPTIONS,
  MATCH_TIER_OPTIONS,
  deptShort,
  schoolShort,
  type AdvisorStage,
  type BootstrapData,
  type MatchTier,
} from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { MATCH_TIER_STYLES, STAGE_STYLES, cn } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "./ui/AdvisorAvatar.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { Button } from "./ui/Button.js";
import { EmptyDeskIllustration } from "./ui/BrandMascot.js";

export interface AdvisorRailProps {
  bootstrap: BootstrapData;
}

/**
 * 左侧虚拟化导师列表栏：支持高校/匹配度/阶段筛选、快速入队切换与未读回信高亮。
 */
export function AdvisorRail({ bootstrap }: AdvisorRailProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedAdvisorId = useAppStore((s) => s.selectedAdvisorId);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const selectedInstitutionId = useAppStore((s) => s.selectedInstitutionId);
  const setSelectedInstitutionId = useAppStore(
    (s) => s.setSelectedInstitutionId
  );
  const filterMatch = useAppStore((s) => s.filterMatch);
  const setFilterMatch = useAppStore((s) => s.setFilterMatch);
  const filterStage = useAppStore((s) => s.filterStage);
  const setFilterStage = useAppStore((s) => s.setFilterStage);
  const filterUnreadOnly = useAppStore((s) => s.filterUnreadOnly);
  const setFilterUnreadOnly = useAppStore((s) => s.setFilterUnreadOnly);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setQuickAddOpen = useAppStore((s) => s.setQuickAddOpen);

  const unreadByAdvisor = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of bootstrap.unreadReplies) {
      map.set(item.advisorId, (map.get(item.advisorId) || 0) + 1);
    }
    return map;
  }, [bootstrap.unreadReplies]);

  const filteredAdvisors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bootstrap.advisors.filter((adv) => {
      if (
        selectedInstitutionId !== "all" &&
        adv.institutionId !== selectedInstitutionId
      ) {
        return false;
      }
      if (filterMatch !== "all" && adv.matchTier !== filterMatch) {
        return false;
      }
      if (filterStage !== "all" && adv.stage !== filterStage) {
        return false;
      }
      if (filterUnreadOnly && !unreadByAdvisor.has(adv.id)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        adv.name,
        adv.institutionName,
        adv.dept,
        adv.email,
        adv.researchSummary,
        ...adv.researchTags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    bootstrap.advisors,
    selectedInstitutionId,
    filterMatch,
    filterStage,
    filterUnreadOnly,
    searchQuery,
    unreadByAdvisor,
  ]);

  const toggleBatchMutation = useMutation({
    mutationFn: ({ id, inBatch }: { id: string; inBatch: boolean }) =>
      workerApi.updateAdvisor(id, { inBatch }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const virtualizer = useVirtualizer({
    count: filteredAdvisors.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 94,
    overscan: 6,
  });

  const institutionOptions = useMemo(
    () => [
      { value: "all", label: `全部高校 (${bootstrap.advisors.length})` },
      ...bootstrap.institutions.map((inst) => ({
        value: inst.id,
        label: inst.name,
      })),
    ],
    [bootstrap.institutions, bootstrap.advisors.length]
  );

  const stageOptions = useMemo(
    () => [
      { value: "all" as const, label: "全部阶段" },
      ...ADVISOR_STAGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    ],
    []
  );

  return (
    <aside className="w-[310px] xl:w-[330px] shrink-0 h-full flex flex-col border-r border-slate-200/75 bg-white/68 backdrop-blur-xl">
      {/* 顶部筛选控制区 */}
      <div className="p-3.5 border-b border-slate-200/70 space-y-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="筛选导师、方向标签或邮箱..."
              className="w-full h-8 pl-8 pr-3 rounded-xl bg-slate-100/80 border border-slate-200/70 text-[12px] placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#2563EB]/45 focus:ring-2 focus:ring-[#2563EB]/15 transition-all"
            />
          </div>
          <Button
            variant="primary"
            size="xs"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setQuickAddOpen(true)}
          >
            添加
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <BaseSelect
            size="xs"
            value={selectedInstitutionId}
            onValueChange={setSelectedInstitutionId}
            options={institutionOptions}
          />
          <BaseSelect<"all" | AdvisorStage>
            size="xs"
            value={filterStage}
            onValueChange={setFilterStage}
            options={stageOptions}
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              { value: "all", label: "全部" },
              ...MATCH_TIER_OPTIONS.map((o) => ({ value: o.value, label: o.short })),
            ] as Array<{ value: "all" | MatchTier; label: string }>
          ).map((chip) => {
            const active = filterMatch === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                onClick={() => setFilterMatch(chip.value)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer",
                  active
                    ? "bg-[#2563EB] text-white border-[#2563EB] shadow-[0_2px_8px_rgba(37,99,235,0.28)]"
                    : "bg-white text-slate-600 border-slate-200/80 hover:border-slate-300"
                )}
              >
                {chip.label}
              </button>
            );
          })}

          {bootstrap.unreadReplies.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors cursor-pointer",
                filterUnreadOnly
                  ? "bg-[#FF6B4A] text-white border-[#FF6B4A]"
                  : "bg-orange-50 text-[#EA580C] border-orange-200/80"
              )}
            >
              未读 ({bootstrap.unreadReplies.length})
            </button>
          )}
        </div>
      </div>

      {/* 虚拟化列表区 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2.5 py-2.5">
        {filteredAdvisors.length === 0 ? (
          <EmptyDeskIllustration
            title="暂无符合条件的导师"
            subtitle="可以清空上方筛选条件，或使用顶部「AI 采集导师」从院系网页直接导入候选博导。"
          />
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const adv = filteredAdvisors[vRow.index];
              const isSelected = adv.id === selectedAdvisorId;
              const tierStyle = MATCH_TIER_STYLES[adv.matchTier];
              const stageStyle = STAGE_STYLES[adv.stage];
              const unreadNum = unreadByAdvisor.get(adv.id) || 0;

              return (
                <div
                  key={adv.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="pb-2"
                >
                  <motion.div
                    onClick={() => setSelectedAdvisorId(adv.id)}
                    whileTap={{ scale: 0.985 }}
                    className={cn(
                      "h-full rounded-2xl p-2.5 border transition-all cursor-pointer flex items-start gap-2.5 select-none",
                      isSelected
                        ? "bg-white border-[#2563EB]/45 glow-electric-soft"
                        : "bg-white/75 border-slate-200/75 hover:bg-white hover:border-slate-300"
                    )}
                  >
                    <AdvisorAvatar
                      name={adv.name}
                      seed={adv.avatarSeed}
                      styleMode={bootstrap.preferences.avatarStyle}
                      size={40}
                      unread={unreadNum > 0}
                    />

                    <div className="min-w-0 flex-1 flex flex-col justify-between h-full">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13px] font-semibold text-[#111827] truncate">
                            {adv.name}
                          </span>
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              tierStyle.dotClass
                            )}
                            title={tierStyle.label}
                          />
                        </div>
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0",
                            stageStyle.badgeClass
                          )}
                        >
                          {stageStyle.label}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 truncate">
                        {schoolShort(adv.institutionName)}
                        {adv.dept ? ` · ${deptShort(adv.dept)}` : ""}
                        {adv.title ? ` · ${adv.title}` : ""}
                      </div>

                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] text-slate-400 truncate">
                          {adv.researchTags.slice(0, 2).join(" / ") ||
                            adv.email ||
                            "待完善研究标签"}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBatchMutation.mutate({
                              id: adv.id,
                              inBatch: !adv.inBatch,
                            });
                          }}
                          className={cn(
                            "px-1.5 py-0.5 rounded-lg text-[10px] font-medium border transition-colors shrink-0 cursor-pointer",
                            adv.inBatch
                              ? "bg-blue-50 text-[#2563EB] border-blue-200/80"
                              : "bg-slate-50 text-slate-400 border-slate-200/60 hover:text-slate-600"
                          )}
                        >
                          {adv.inBatch ? "在队列中" : "+队列"}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部快速统计 */}
      <div className="px-3.5 py-2 border-t border-slate-200/70 bg-white/75 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
        <span>共 {filteredAdvisors.length} 位导师</span>
        <span className="inline-flex items-center gap-1 text-[#2563EB] font-medium">
          <Sparkles className="w-3 h-3" />
          已入群发队列 {bootstrap.advisors.filter((a) => a.inBatch).length} 位
        </span>
      </div>
    </aside>
  );
}
