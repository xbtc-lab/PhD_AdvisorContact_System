import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { Button } from "./ui/Button.js";

/**
 * 轻量 CSV 导入弹窗：支持从 Excel 导出的 UTF-8 CSV 批量导入导师台账与既有草稿。
 */
export function CsvImportModal() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useAppStore((s) => s.csvImportOpen);
  const setOpen = useAppStore((s) => s.setCsvImportOpen);

  const [defaultInstitution, setDefaultInstitution] = useState("");
  const [csvText, setCsvText] = useState("");

  const importMutation = useMutation({
    mutationFn: () =>
      workerApi.importCsv({
        csvText,
        defaultInstitution: defaultInstitution.trim() || undefined,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(
        `CSV 导入完成：新增 ${res.added} 位，跳过重复 ${res.skipped} 位`
      );
      setCsvText("");
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleFilePick(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.onerror = () => toast.error("读取 CSV 文件失败");
    reader.readAsText(file, "utf-8");
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#2563EB]" />
          <span>从 CSV 批量导入导师台账</span>
        </span>
      }
      description="支持表头列：高校、导师姓名、院系、职称、邮箱、主页、匹配度、研究标签、研究方向、邮件主题、邮件正文"
      maxWidthClass="max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={importMutation.isPending}
            disabled={!csvText.trim()}
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => importMutation.mutate()}
          >
            确认解析并导入
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[12px]">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-slate-600 font-medium">
              默认高校（当 CSV 行缺少「高校」列时使用）
            </label>
            <input
              value={defaultInstitution}
              onChange={(e) => setDefaultInstitution(e.target.value)}
              placeholder="例如：南京大学"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleFilePick(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              选择本地 .csv 文件
            </Button>
          </div>
        </div>

        <div>
          <label className="text-slate-600 font-medium">
            CSV 文本预览（可直接编辑或粘贴）
          </label>
          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="高校,导师姓名,院系,邮箱,研究标签&#10;厦门大学,陈教授,信息学院,chen@xmu.edu.cn,大模型推理|多模态"
            className="mt-1 w-full p-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white font-mono text-[11.5px]"
          />
        </div>
      </div>
    </ModalDialog>
  );
}
