import { Download, FileSpreadsheet, FileJson, ShieldCheck, Upload } from "lucide-react";
import type { BootstrapData } from "@app/shared";
import { useAppStore } from "@/store/useAppStore.js";
import { Button } from "@/components/ui/Button.js";

export interface DataBackupSettingsPanelProps {
  bootstrap: BootstrapData;
}

/**
 * 系统设置子面板 4：导师表格 CSV/JSON 导入导出全量备份，以及管理员 Prompt 控制台入口。
 */
export function DataBackupSettingsPanel({
  bootstrap,
}: DataBackupSettingsPanelProps) {
  const setCsvImportOpen = useAppStore((s) => s.setCsvImportOpen);
  const setAdminPromptOpen = useAppStore((s) => s.setAdminPromptOpen);

  return (
    <div className="space-y-6">
      <div className="card-surface p-6 space-y-4">
        <div>
          <h2 className="text-[16px] font-bold text-[#0F172A] flex items-center gap-2">
            <Download className="w-4 h-4 theme-text" />
            个人工作台数据全量迁移与归档
          </h2>
          <p className="text-[12px] text-[#64748B] mt-1">
            当前个人台账已录入 {bootstrap.advisors.length} 位导师、
            {bootstrap.institutions.length} 所院校及 {bootstrap.resumes.length} 份附件记录，支持零损导出归档。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="card-well p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#0F172A]">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                导出 CSV 导师明细表
              </div>
              <p className="text-[11.5px] text-[#64748B] leading-[1.55]">
                带 UTF-8 BOM 头可直接用 Excel 打开，包含全部院系、邮箱、研究笔记、草稿与联系进度。
              </p>
            </div>
            <a
              href="/api/data/export/csv"
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full bg-white hairline text-[12px] font-medium text-[#0F172A] theme-hover-border"
            >
              <Download className="w-3.5 h-3.5" />
              下载 .csv 表格
            </a>
          </div>

          <div className="card-well p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#0F172A]">
                <FileJson className="w-4 h-4 theme-text" />
                导出 JSON 完整快照
              </div>
              <p className="text-[11.5px] text-[#64748B] leading-[1.55]">
                包含个人结构化科研履历、导师台账与全部套磁草稿记录，适合冷备迁移。
              </p>
            </div>
            <a
              href="/api/data/export/json"
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full bg-white hairline text-[12px] font-medium text-[#0F172A] theme-hover-border"
            >
              <Download className="w-3.5 h-3.5" />
              下载 .json 快照
            </a>
          </div>

          <div className="card-well p-4 flex flex-col justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-[#0F172A]">
                <Upload className="w-4 h-4 text-[#475569]" />
                批量导入 CSV 名单
              </div>
              <p className="text-[11.5px] text-[#64748B] leading-[1.55]">
                智能按导师姓名与邮箱去重合并，兼容导出格式与自行整理的高校教授清单。
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Upload className="w-3.5 h-3.5" />}
              onClick={() => setCsvImportOpen(true)}
            >
              打开 CSV 导入向导
            </Button>
          </div>
        </div>
      </div>

      {/* 管理员系统提示词后台入口 */}
      <div className="card-surface p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-xl">
          <h3 className="text-[15px] font-bold text-[#0F172A] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 theme-text" />
            管理员 Prompt 调优与版本回滚控制台
          </h3>
          <p className="text-[12px] text-[#64748B] leading-[1.6]">
            面向平台维护者开放：通过 `X-Admin-Token` 身份验证在线精调 AI 写信、润色与网页解析系统提示词，并支持一键版本回滚。
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          icon={<ShieldCheck className="w-4 h-4" />}
          onClick={() => setAdminPromptOpen(true)}
        >
          打开 Prompt 控制台
        </Button>
      </div>
    </div>
  );
}
