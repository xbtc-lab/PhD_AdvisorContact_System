import React, { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Button, SelectBox } from "./ui";
import {
  cn,
  MATCH_OPTIONS,
  matchesProfFilters,
  matchShort,
  matchTone,
  normalizeMatchTier,
  normalizeStatus,
  schoolShort,
  STATUS_OPTIONS,
  statusDotTone,
  statusTone,
} from "../lib/api";
import type { FilterState, Professor } from "../types";

export function SheetView({
  professors,
  sheets,
  excelPath,
  onEditProfessor,
  onBackToWorkspace,
}: {
  professors: Professor[];
  sheets: string[];
  excelPath: string;
  onEditProfessor: (pid: string) => void;
  onBackToWorkspace: () => void;
}) {
  const [filters, setFilters] = useState<FilterState>({
    school: "ALL",
    matchTier: "ALL",
    status: "ALL",
    query: "",
  });

  const rows = professors.filter((p) => matchesProfFilters(p, filters));

  const totals = {
    total: 0,
    high1: 0,
    high2: 0,
    try3: 0,
    pending: 0,
    ready: 0,
    sent: 0,
    replied: 0,
  };

  const summaryRows = sheets.map((s) => {
    const grp = professors.filter((p) => p.sheet === s);
    const st = {
      sheet: s,
      total: grp.length,
      high1: grp.filter((p) => normalizeMatchTier(p.priority) === "极高匹配").length,
      high2: grp.filter((p) => normalizeMatchTier(p.priority) === "高度匹配").length,
      try3: grp.filter((p) => normalizeMatchTier(p.priority) === "可以尝试").length,
      pending: grp.filter((p) => normalizeStatus(p.status) === "待撰写").length,
      ready: grp.filter((p) => normalizeStatus(p.status) === "待发送").length,
      sent: grp.filter((p) => normalizeStatus(p.status) === "已发送").length,
      replied: grp.filter((p) => normalizeStatus(p.status) === "已回信").length,
    };
    totals.total += st.total;
    totals.high1 += st.high1;
    totals.high2 += st.high2;
    totals.try3 += st.try3;
    totals.pending += st.pending;
    totals.ready += st.ready;
    totals.sent += st.sent;
    totals.replied += st.replied;
    return st;
  });

  return (
    <section className="flex-1 min-h-0 flex flex-col bg-[#F8F9FB] overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3.5 bg-white border-b border-slate-900/[0.07] flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div>
          <h2 className="text-[16px] font-bold tracking-[-0.015em] text-[#18181B] m-0">
            联系进度总表（自动同步本地 Excel）
          </h2>
          <p className="font-mono text-[11.5px] text-[#71717A] m-0 mt-0.5">
            {excelPath
              ? `${excelPath}（${sheets.length} 所高校 · ${professors.length} 位导师）`
              : `共 ${professors.length} 位导师`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-[220px]">
            <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
              placeholder="搜姓名、方向、邮箱..."
              className="w-full h-8 pl-8 pr-2.5 bg-white ring-1 ring-slate-900/[0.09] rounded-[9px] text-[12px] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all"
            />
          </div>

          <SelectBox
            variant="mini"
            value={filters.matchTier}
            onValueChange={(v) => setFilters({ ...filters, matchTier: v })}
            options={[
              { value: "ALL", label: "全部匹配度" },
              ...MATCH_OPTIONS.map((o) => ({ value: o.value, label: o.short })),
            ]}
            className="w-[118px] h-8"
          />

          <SelectBox
            variant="mini"
            value={filters.status}
            onValueChange={(v) => setFilters({ ...filters, status: v })}
            options={[
              { value: "ALL", label: "全部状态" },
              ...STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
            ]}
            className="w-[110px] h-8"
          />

          <Button variant="secondary" onClick={onBackToWorkspace}>
            返回写信台
          </Button>
        </div>
      </div>

      {/* School Filter Pills */}
      <div className="px-6 py-2.5 bg-white/80 border-b border-slate-900/[0.06] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={() => setFilters({ ...filters, school: "ALL" })}
          className={cn(
            "px-3 py-1 rounded-full text-[12px] inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all active:scale-[0.97]",
            filters.school === "ALL"
              ? "bg-[#18181B] text-white font-semibold"
              : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#EAECEF]"
          )}
        >
          <span>全部高校</span>
          <span className="font-mono text-[11px] opacity-80 tabular-nums">{professors.length}</span>
        </button>

        {sheets.map((s) => {
          const cnt = professors.filter((p) => p.sheet === s).length;
          const active = filters.school === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilters({ ...filters, school: s })}
              className={cn(
                "px-3 py-1 rounded-full text-[12px] inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all active:scale-[0.97]",
                active
                  ? "bg-[#18181B] text-white font-semibold"
                  : "bg-[#F4F5F7] text-[#52525B] hover:bg-[#EAECEF]"
              )}
            >
              <span>{s}</span>
              <span className="font-mono text-[11px] opacity-80 tabular-nums">{cnt}</span>
            </button>
          );
        })}
      </div>

      {/* Tables */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-paper overflow-hidden">
          <div className="px-5 py-3 bg-[#FAFAFB] border-b border-slate-900/[0.06] flex items-center justify-between">
            <h3 className="m-0 text-[13.5px] font-bold text-[#18181B]">
              各校进度一览（点击行筛选下方列表）
            </h3>
            <span className="text-[11.5px] text-[#71717A] tabular-nums">
              {sheets.length} 校 · {professors.length} 位导师
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#FAFAFB] text-[#71717A] text-[11.5px]">
                  {[
                    "高校",
                    "总数",
                    "极高匹配",
                    "高度匹配",
                    "可以尝试",
                    "待撰写",
                    "待发送",
                    "已发送",
                    "已回信",
                  ].map((h) => (
                    <th key={h} className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((st) => (
                  <tr
                    key={st.sheet}
                    onClick={() =>
                      setFilters({ ...filters, school: filters.school === st.sheet ? "ALL" : st.sheet })
                    }
                    className={cn(
                      "cursor-pointer border-b border-slate-900/[0.05] transition-colors",
                      filters.school === st.sheet ? "bg-[#EFF6FF]/75" : "hover:bg-[#F8F9FB]"
                    )}
                  >
                    <td className="px-3.5 py-2.5 font-semibold text-[#18181B]">{st.sheet}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{st.total}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[#BE123C] font-medium">{st.high1}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[#B45309]">{st.high2}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[#1D4ED8]">{st.try3}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{st.pending}</td>
                    <td className="px-3.5 py-2.5 tabular-nums">{st.ready}</td>
                    <td className="px-3.5 py-2.5 tabular-nums text-[#047857]">{st.sent}</td>
                    <td className="px-3.5 py-2.5 tabular-nums font-bold text-[#BE123C]">{st.replied}</td>
                  </tr>
                ))}
                <tr className="bg-[#FAFAFB] font-semibold text-[#18181B]">
                  <td className="px-3.5 py-2.5">合计 ({sheets.length} 校)</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.total}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.high1}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.high2}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.try3}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.pending}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.ready}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.sent}</td>
                  <td className="px-3.5 py-2.5 tabular-nums">{totals.replied}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white ring-1 ring-slate-900/[0.07] rounded-[16px] shadow-paper overflow-hidden">
          <div className="px-5 py-3 bg-[#FAFAFB] border-b border-slate-900/[0.06] flex items-center justify-between">
            <h3 className="m-0 text-[13.5px] font-bold text-[#18181B]">导师明细列表</h3>
            <span className="text-[11.5px] text-[#71717A] tabular-nums">
              显示 {rows.length} / {professors.length} 位
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#FAFAFB] text-[#71717A] text-[11.5px]">
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-24 font-medium">高校</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-24 font-medium">匹配度</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-32 font-medium whitespace-nowrap">导师</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-40 font-medium">学院</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] min-w-[240px] font-medium">研究方向</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-52 font-medium">邮箱</th>
                  <th className="text-left px-3.5 py-2.5 border-b border-slate-900/[0.06] w-36 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-9 text-[#71717A]">
                      暂无匹配的导师记录
                    </td>
                  </tr>
                ) : (
                  rows.map((p) => {
                    const st = normalizeStatus(p.status);
                    return (
                      <tr key={p.id} className="border-b border-slate-900/[0.05] last:border-b-0 hover:bg-[#F8F9FB]/80 transition-colors">
                        <td className="px-3.5 py-2.5 text-[#3F3F46]">{schoolShort(p.sheet)}</td>
                        <td className="px-3.5 py-2.5">
                          <span className={cn("inline-block px-2 py-0.5 rounded-[6px] text-[11px] font-medium whitespace-nowrap", matchTone(p.priority))}>
                            {matchShort(p.priority)}
                          </span>
                        </td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          {p.homepage ? (
                            <a
                              href={p.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#18181B] font-semibold hover:text-[#2563EB] hover:underline"
                            >
                              <span>{p.name}</span>
                              <ExternalLink className="w-3 h-3 opacity-50" />
                            </a>
                          ) : (
                            <strong className="font-semibold text-[#18181B]">{p.name}</strong>
                          )}
                        </td>
                        <td className="px-3.5 py-2.5 text-[#52525B]">{p.dept}</td>
                        <td className="px-3.5 py-2.5 text-[#52525B]">{p.research}</td>
                        <td className="px-3.5 py-2.5 font-mono text-[11.5px] text-[#3F3F46] whitespace-nowrap">{p.email || "待补充"}</td>
                        <td className="px-3.5 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap", statusTone(st))}>
                              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", statusDotTone(st))} />
                              <span>{st}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => onEditProfessor(p.id)}
                              className="text-[12px] font-medium text-[#2563EB] hover:underline cursor-pointer shrink-0"
                            >
                              打开
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
