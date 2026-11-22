import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Layers, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ADVISOR_STAGE_OPTIONS,
  type Advisor,
  type AdvisorStage,
  type BootstrapData,
} from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn, STAGE_STYLES } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorPhotoAvatar } from "@/components/ui/AdvisorPhotoAvatar.js";
import { ConfirmDialog } from "@/components/ui/BaseDialog.js";
import { BaseSelect } from "@/components/ui/BaseSelect.js";
import { EmptyDeskIllustration } from "@/components/ui/BrandMascot.js";

export interface MyAdvisorsViewProps {
  bootstrap: BootstrapData;
}

/**
 * 视图 2：我的导师（个人联系台账 + 双轨追踪徽章 + 阶段切换 + 勾选批量错峰群发 Dock）。
 */
export function MyAdvisorsView({ bootstrap }: MyAdvisorsViewProps) {
  const queryClient = useQueryClient();
  const batchSelectedIds = useAppStore((s) => s.batchSelectedIds);
  const toggleBatchSelected = useAppStore((s) => s.toggleBatchSelected);
  const clearBatchSelected = useAppStore((s) => s.clearBatchSelected);
  const openWriterFor = useAppStore((s) => s.openWriterFor);
  const setDispatchOpen = useAppStore((s) => s.setDispatchOpen);
  const setPhotoModalData = useAppStore((s) => s.setPhotoModalData);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [stageFilter, setStageFilter] = useState<"all" | AdvisorStage>("all");
  const [confirmDeleteAdv, setConfirmDeleteAdv] = useState<Advisor | null>(null);

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: AdvisorStage }) =>
      workerApi.updateAdvisor(id, { stage }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已更新导师沟通阶段");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workerApi.deleteAdvisor(id),
    onSuccess: async (_res, id) => {
      if (batchSelectedIds.includes(id)) toggleBatchSelected(id);
      setConfirmDeleteAdv(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["catalog-advisors"] }),
      ]);
      toast.success("已从我的导师台账移除");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    if (stageFilter === "all") return bootstrap.advisors;
    return bootstrap.advisors.filter((a) => a.stage === stageFilter);
  }, [bootstrap.advisors, stageFilter]);

  const summaries = bootstrap.trackingSummaries || {};
  const avatarStyle = bootstrap.preferences.avatarStyle;

  function renderTrackBadge(adv: Advisor) {
    const tr = summaries[adv.id];
    const replyCount = bootstrap.replyCounts[adv.id] || 0;

    if (tr && (tr.resumeClicks > 0 || tr.cardClicks > 0)) {
      const durText = tr.resumeReadSec > 0 ? ` · 停留 ${tr.resumeReadSec}s` : "";
      return {
        dotColor: "bg-[#10B981]",
        text: `在线简历点击 ${tr.resumeClicks} 次${durText}`,
      };
    }
    if (replyCount > 0 || adv.stage === "replied" || adv.stage === "interviewing") {
      return {
        dotColor: "bg-[#10B981]",
        text: adv.replyNote
          ? adv.replyNote.split("\n")[0].slice(0, 32)
          : `收到导师回信 (${replyCount || 1})`,
      };
    }
    if (adv.trackSummary) {
      return { dotColor: "bg-[#10B981]", text: adv.trackSummary };
    }
    return {
      dotColor: adv.stage === "sent" ? "theme-dot" : "bg-slate-300",
      text: STAGE_STYLES[adv.stage].label,
    };
  }

  return (
    <div className="flex-1 px-4 sm:px-7 md:px-8 pb-24 pt-4 sm:pt-5 max-w-[1140px] w-full mx-auto space-y-5 relative">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-[#0F172A] m-0">
            我的套磁导师
          </h1>
          <p className="text-[12.5px] text-[#64748B] m-0 mt-1">
            实时跟踪在线简历点击与白名单回信；勾选多位导师即可一键进入错峰群发队列
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white hairline text-[12px] text-[#0F172A] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
            在线简历点击（防屏蔽实测）
          </span>
          <button
            type="button"
            onClick={() => setDispatchOpen(true)}
            className="px-3.5 py-1.5 rounded-full bg-white hairline text-[12px] font-semibold text-[#0F172A] theme-hover-border cursor-pointer inline-flex items-center gap-1.5 transition-all"
          >
            <Layers className="w-3.5 h-3.5 theme-text" />
            <span>打开错峰群发队列</span>
          </button>
        </div>
      </div>

      {/* 阶段过滤药丸 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setStageFilter("all")}
          className={cn(
            "px-3 py-1 rounded-full text-[12px] cursor-pointer transition-all",
            stageFilter === "all"
              ? "bg-[#141417] text-white font-semibold border-0"
              : "bg-white hairline text-[#475569] font-medium theme-hover-border"
          )}
        >
          全部 ({bootstrap.advisors.length})
        </button>
        {ADVISOR_STAGE_OPTIONS.map((opt) => {
          const count = bootstrap.advisors.filter((a) => a.stage === opt.value).length;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStageFilter(opt.value)}
              className={cn(
                "px-3 py-1 rounded-full text-[12px] cursor-pointer transition-all",
                stageFilter === opt.value
                  ? "bg-[#141417] text-white font-semibold border-0"
                  : "bg-white hairline text-[#475569] font-medium theme-hover-border"
              )}
            >
              {opt.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 导师台账卡片列表 */}
      {filtered.length === 0 ? (
        <div className="card-surface rounded-[24px] p-8">
          <EmptyDeskIllustration
            title="当前列表暂无导师"
            subtitle="前往「发现导师」库一键收录目标博导，或点击右上角 + 号导入自己的导师名单"
          />
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className="theme-cta px-5 py-2 rounded-full text-[12.5px] font-semibold border-0 cursor-pointer"
            >
              去发现导师库看看 →
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((a) => {
            const checked = batchSelectedIds.includes(a.id);
            const track = renderTrackBadge(a);

            return (
              <div
                key={a.id}
                onClick={() => openWriterFor(a.id)}
                className={cn(
                  "group card-surface card-hover rounded-[24px] p-5 cursor-pointer flex flex-wrap items-center justify-between gap-4 relative hover:z-30 focus-within:z-30",
                  checked && "theme-ring-active"
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`选择 ${a.name}`}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleBatchSelected(a.id)}
                    className="w-4 h-4 cursor-pointer accent-[var(--accent)] shrink-0"
                  />

                  <AdvisorPhotoAvatar
                    compact
                    name={a.name}
                    school={a.institutionName}
                    dept={a.dept}
                    title={a.title}
                    seed={a.avatarSeed}
                    styleMode={avatarStyle}
                    photoUrl={a.photoUrl}
                    photoSource={a.photoSource}
                    homepageUrl={a.homepageUrl}
                    unread={bootstrap.unreadReplies.some((r) => r.advisorId === a.id)}
                    onOpenPhoto={() =>
                      setPhotoModalData({
                        name: a.name,
                        school: a.institutionName,
                        dept: a.dept,
                        title: a.title,
                        homepageUrl: a.homepageUrl,
                        photoUrl: a.photoUrl || "",
                        photoSource: a.photoSource || "",
                        advisorId: a.id,
                      })
                    }
                  />

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-bold text-[#0F172A]">
                        {a.name}
                      </span>
                      <span className="text-[12.5px] text-[#64748B]">
                        {a.institutionName}
                        {a.dept ? ` · ${a.dept}` : ""}
                      </span>
                      {a.honorBadge && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium honor-stone">
                          {a.honorBadge}
                        </span>
                      )}
                      {a.matchScore !== null && (
                        <span className="text-[12px] font-bold cue-mono theme-text">
                          {a.matchScore}% 契合
                        </span>
                      )}
                    </div>

                    <div className="text-[12px] text-[#475569] truncate">
                      {a.email ? (
                        <span className="cue-mono text-[#64748B] mr-2">
                          {a.email}
                        </span>
                      ) : null}
                      {a.researchTags.join(" / ") || a.researchSummary.slice(0, 48)}
                    </div>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center gap-2.5 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="px-3 py-1 rounded-full card-well text-[12px] font-medium text-[#0F172A] inline-flex items-center gap-1.5 max-w-[260px] truncate">
                    <span
                      className={cn("w-1.5 h-1.5 rounded-full shrink-0", track.dotColor)}
                    />
                    <span className="truncate">{track.text}</span>
                  </span>

                  <div className="w-[104px]">
                    <BaseSelect<AdvisorStage>
                      size="xs"
                      value={a.stage}
                      onValueChange={(stage) =>
                        stageMutation.mutate({ id: a.id, stage })
                      }
                      options={ADVISOR_STAGE_OPTIONS.map((o) => ({
                        value: o.value,
                        label: o.label,
                      }))}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => openWriterFor(a.id)}
                    className="text-[12.5px] font-semibold theme-text inline-flex items-center gap-1 bg-transparent border-0 cursor-pointer px-1 hover:underline"
                  >
                    <span>写信工坊</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    title="从我的导师移出"
                    onClick={() => setConfirmDeleteAdv(a)}
                    className="w-7 h-7 rounded-full neutral-pill text-[#94A3B8] hover:text-rose-600 inline-flex items-center justify-center border-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 底部悬浮 Batch Action Dock */}
      {batchSelectedIds.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-30 glass-popover px-4 sm:px-5 py-2.5 rounded-full flex items-center gap-3 sm:gap-4 max-w-[calc(100vw-1.5rem)] whitespace-nowrap">
          <span className="text-[12.5px] font-medium text-[#0F172A]">
            已选 <strong className="theme-text cue-mono">{batchSelectedIds.length}</strong> 位导师
          </span>
          <span className="h-4 w-px bg-slate-200" />
          <button
            type="button"
            onClick={clearBatchSelected}
            className="text-[12px] text-[#64748B] hover:text-[#0F172A] cursor-pointer bg-transparent border-0"
          >
            取消选择
          </button>
          <button
            type="button"
            onClick={() => setDispatchOpen(true)}
            className="theme-cta px-4 py-1.5 rounded-full text-[12px] font-semibold border-0 cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>安排错峰群发</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteAdv)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteAdv(null);
        }}
        title="移出我的套磁导师？"
        description={
          confirmDeleteAdv
            ? `确定从个人台账中移除「${confirmDeleteAdv.name}」吗？关联草稿与对话记录将同步清理。`
            : ""
        }
        confirmLabel="确认移出"
        danger
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDeleteAdv) deleteMutation.mutate(confirmDeleteAdv.id);
        }}
      />
    </div>
  );
}
