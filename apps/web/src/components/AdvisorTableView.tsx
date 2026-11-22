import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpDown,
  Download,
  ExternalLink,
  FileJson,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  ADVISOR_STAGE_OPTIONS,
  MATCH_TIER_OPTIONS,
  type Advisor,
  type AdvisorStage,
  type BootstrapData,
  type MatchTier,
} from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn, formatShortTime } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "./ui/AdvisorAvatar.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { Button } from "./ui/Button.js";

export interface AdvisorTableViewProps {
  bootstrap: BootstrapData;
}

const columnHelper = createColumnHelper<Advisor>();

/**
 * 导师多维数据台账（替代 V1 实时 .xlsx 绑定）：
 * 基于 TanStack Table + TanStack Virtual，支持 60fps 滚动、排序、行内修改与 CSV/JSON 导入导出。
 */
export function AdvisorTableView({ bootstrap }: AdvisorTableViewProps) {
  const queryClient = useQueryClient();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [instFilter, setInstFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState<"all" | AdvisorStage>("all");

  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setCsvImportOpen = useAppStore((s) => s.setCsvImportOpen);

  const patchMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      workerApi.updateAdvisor(id, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filteredData = useMemo(() => {
    return bootstrap.advisors.filter((a) => {
      if (instFilter !== "all" && a.institutionId !== instFilter) return false;
      if (stageFilter !== "all" && a.stage !== stageFilter) return false;
      return true;
    });
  }, [bootstrap.advisors, instFilter, stageFilter]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "导师 / 高校",
        size: 230,
        cell: (info) => {
          const adv = info.row.original;
          const unread = bootstrap.unreadReplies.some(
            (r) => r.advisorId === adv.id
          );
          return (
            <div className="flex items-center gap-2.5 min-w-0">
              <AdvisorAvatar
                name={adv.name}
                seed={adv.avatarSeed}
                styleMode={bootstrap.preferences.avatarStyle}
                size={32}
                unread={unread}
              />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#111827] truncate">
                  {adv.name}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {adv.institutionName}
                  {adv.dept ? ` · ${adv.dept}` : ""}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor("matchTier", {
        header: "匹配梯度",
        size: 155,
        cell: (info) => {
          const adv = info.row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <BaseSelect<MatchTier>
                size="xs"
                value={adv.matchTier}
                options={MATCH_TIER_OPTIONS.map((m) => ({
                  value: m.value,
                  label: m.short,
                }))}
                onValueChange={(matchTier) =>
                  patchMutation.mutate({ id: adv.id, patch: { matchTier } })
                }
              />
            </div>
          );
        },
      }),
      columnHelper.accessor("stage", {
        header: "推进阶段",
        size: 135,
        cell: (info) => {
          const adv = info.row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <BaseSelect<AdvisorStage>
                size="xs"
                value={adv.stage}
                options={ADVISOR_STAGE_OPTIONS}
                onValueChange={(stage) =>
                  patchMutation.mutate({ id: adv.id, patch: { stage } })
                }
              />
            </div>
          );
        },
      }),
      columnHelper.accessor("email", {
        header: "联系邮箱",
        size: 205,
        cell: (info) => {
          const val = info.getValue();
          return val ? (
            <span className="font-mono text-[11px] text-slate-700 truncate block">
              {val}
            </span>
          ) : (
            <span className="text-[11px] text-amber-600">待补充邮箱</span>
          );
        },
      }),
      columnHelper.accessor("researchTags", {
        header: "研究方向标签",
        size: 210,
        enableSorting: false,
        cell: (info) => {
          const tags = info.getValue();
          return (
            <div className="flex items-center gap-1 overflow-hidden">
              {tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-[10px] truncate max-w-[90px]"
                >
                  {t}
                </span>
              ))}
              {tags.length === 0 && (
                <span className="text-[11px] text-slate-400">—</span>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor("inBatch", {
        header: "群发队列",
        size: 95,
        cell: (info) => {
          const adv = info.row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <BaseSwitch
                checked={adv.inBatch}
                onCheckedChange={(inBatch) =>
                  patchMutation.mutate({ id: adv.id, patch: { inBatch } })
                }
              />
            </div>
          );
        },
      }),
      columnHelper.accessor("lastSentAt", {
        header: "最近联系",
        size: 120,
        cell: (info) => (
          <span className="text-[11px] font-mono text-slate-500">
            {formatShortTime(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "操作",
        size: 100,
        cell: (info) => {
          const adv = info.row.original;
          return (
            <Button
              variant="glass"
              size="xs"
              icon={<ExternalLink className="w-3 h-3" />}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedAdvisorId(adv.id);
                setViewMode("workspace");
              }}
            >
              写信
            </Button>
          );
        },
      }),
    ],
    [bootstrap.preferences.avatarStyle, bootstrap.unreadReplies, patchMutation, setSelectedAdvisorId, setViewMode]
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue || "").toLowerCase();
      if (!q) return true;
      const a = row.original;
      return [a.name, a.institutionName, a.dept, a.email, ...a.researchTags]
        .join(" ")
        .toLowerCase()
        .includes(q);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 56,
    overscan: 8,
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="tactile-card rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder="全局搜索姓名、院系、标签、邮箱..."
              className="w-full h-8 pl-8 pr-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-[12px] focus:outline-none focus:bg-white focus:border-[#2563EB]/45"
            />
          </div>

          <BaseSelect
            size="xs"
            value={instFilter}
            onValueChange={setInstFilter}
            options={[
              { value: "all", label: "全部高校" },
              ...bootstrap.institutions.map((i) => ({
                value: i.id,
                label: i.name,
              })),
            ]}
          />

          <BaseSelect<"all" | AdvisorStage>
            size="xs"
            value={stageFilter}
            onValueChange={setStageFilter}
            options={[
              { value: "all", label: "全部阶段" },
              ...ADVISOR_STAGE_OPTIONS,
            ]}
          />

          <span className="text-[12px] text-slate-500">
            显示 <strong className="text-[#111827]">{rows.length}</strong> 条记录
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="xs"
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => setCsvImportOpen(true)}
          >
            导入 CSV
          </Button>
          <Button
            variant="secondary"
            size="xs"
            icon={<Download className="w-3.5 h-3.5" />}
            onClick={() => window.open("/api/data/export/csv", "_blank")}
          >
            导出 CSV
          </Button>
          <Button
            variant="ghost"
            size="xs"
            icon={<FileJson className="w-3.5 h-3.5" />}
            onClick={() => window.open("/api/data/export/json", "_blank")}
          >
            JSON 备份
          </Button>
        </div>
      </div>

      {/* 虚拟化数据表格主体 */}
      <div
        ref={tableContainerRef}
        className="flex-1 min-h-0 tactile-card rounded-2xl overflow-auto"
      >
        <div className="min-w-[1140px]">
          <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/80 grid grid-cols-[230px_155px_135px_205px_1fr_95px_120px_100px] items-center px-4 h-10 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {table.getHeaderGroups().map((hg) =>
              hg.headers.map((header) => (
                <div
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={cn(
                    "flex items-center gap-1 select-none",
                    header.column.getCanSort() &&
                      "cursor-pointer hover:text-[#111827]"
                  )}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {header.column.getCanSort() && (
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  )}
                </div>
              ))
            )}
          </div>

          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = rows[vRow.index];
              return (
                <div
                  key={row.id}
                  onClick={() => {
                    setSelectedAdvisorId(row.original.id);
                    setViewMode("workspace");
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                  className="grid grid-cols-[230px_155px_135px_205px_1fr_95px_120px_100px] items-center px-4 border-b border-slate-100 hover:bg-blue-50/35 transition-colors cursor-pointer"
                >
                  {row.getVisibleCells().map((cell) => (
                    <div key={cell.id} className="pr-2 min-w-0">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
