import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { AttachmentCategory, ResumeItem } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { cn, fileToBase64 } from "@/lib/cn.js";
import { Button } from "@/components/ui/Button.js";

export interface AttachmentLibraryCardProps {
  resumes: ResumeItem[];
  sectionId?: string;
}

const CATEGORY_META: Record<
  AttachmentCategory,
  { label: string; accept: string; badgeClass: string; hint: string }
> = {
  resume: {
    label: "个人简历 PDF",
    accept: ".pdf,.doc,.docx",
    badgeClass: "theme-soft-pill",
    hint: "发送套磁信时默认附加的个人中文/英文简历",
  },
  transcript_master: {
    label: "硕博成绩单",
    accept: ".pdf,.png,.jpg,.jpeg",
    badgeClass: "honor-stone",
    hint: "硕士阶段官方成绩单或排名证明",
  },
  transcript_bachelor: {
    label: "本科成绩单",
    accept: ".pdf,.png,.jpg,.jpeg",
    badgeClass: "bg-[#F4F5F7] text-[#334155] border-slate-200/80",
    hint: "本科 GPA 成绩单与专业排名证明",
  },
  wechat_qr: {
    label: "微信联系二维码",
    accept: ".png,.jpg,.jpeg,.webp",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    hint: "自动嵌入 HTML 互动联系名片弹窗供教授扫码",
  },
  certificate: {
    label: "竞赛与荣誉证书",
    accept: ".pdf,.png,.jpg,.jpeg",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
    hint: "奖学金、竞赛获奖或英文等级扫描件",
  },
};

/**
 * 我的履历章节 6 — 分类学术附件与联系卡二维码管理库。
 */
export function AttachmentLibraryCard({
  resumes,
  sectionId,
}: AttachmentLibraryCardProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<AttachmentCategory>("resume");
  const [tagNote, setTagNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => workerApi.setDefaultResume(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已切换默认发信简历附件");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => workerApi.deleteResume(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success("已移除该附件");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      const hasDefaultResume = resumes.some((r) => r.isDefault);
      await workerApi.uploadResume({
        filename: file.name,
        contentBase64,
        category,
        tagNote: tagNote.trim() || undefined,
        setAsDefault: category === "resume" && !hasDefaultResume,
      });
      setTagNote("");
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(`已上传「${CATEGORY_META[category].label}」：${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section id={sectionId} className="card-surface p-6 space-y-4 scroll-mt-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-bold text-[#0F172A] flex items-center gap-2">
            <Paperclip className="w-4 h-4 theme-text shrink-0" />
            附件与成绩单材料库
          </h3>
          <p className="text-[11.5px] text-[#64748B] mt-0.5">
            统一管理个人简历 PDF、成绩单、获奖证明及 HTML 联系卡微信二维码
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-[#F4F5F7] text-[#475569] cue-mono shrink-0 whitespace-nowrap">
          共 {resumes.length} 份
        </span>
      </div>

      {/* 分类切换 */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(CATEGORY_META) as AttachmentCategory[]).map((key) => {
          const active = category === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={cn(
                "px-3 py-1 rounded-full text-[12px] font-medium border cursor-pointer transition-all whitespace-nowrap",
                active
                  ? "bg-[#141417] text-white border-[#141417]"
                  : "bg-[#FAFAFB] text-[#475569] border-slate-200/80 hover:border-slate-300"
              )}
            >
              {CATEGORY_META[key].label}
            </button>
          );
        })}
      </div>

      {/* 上传控制区 */}
      <div className="card-well p-4 space-y-2.5">
        <div className="text-[12px] text-[#64748B]">
          {CATEGORY_META[category].hint}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <input
            type="text"
            value={tagNote}
            onChange={(e) => setTagNote(e.target.value)}
            placeholder="备注标签（如：2026 春版 / 均分 90.4）"
            className="min-w-0 flex-1 h-9 px-3 rounded-[12px] bg-white hairline text-[12.5px] text-[#0F172A] outline-none"
          />
          <Button
            variant="primary"
            size="sm"
            loading={uploading}
            className="shrink-0 whitespace-nowrap"
            icon={<Upload className="w-3.5 h-3.5" />}
            onClick={() => fileInputRef.current?.click()}
          >
            选择文件上传
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={CATEGORY_META[category].accept}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* 已上传列表 */}
      {resumes.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[#94A3B8] border border-dashed border-slate-200 rounded-[16px]">
          暂未上传任何简历、成绩单或联系二维码
        </div>
      ) : (
        <div className="space-y-2.5">
          {resumes.map((item) => {
            const cat = (item.category || "resume") as AttachmentCategory;
            const meta = CATEGORY_META[cat] || CATEGORY_META.resume;
            const isImage = cat === "wechat_qr";

            return (
              <div
                key={item.id}
                className="p-3.5 rounded-[16px] bg-[#FAFAFB] hairline flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {isImage ? (
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 theme-text shrink-0" />
                    )}
                    <span className="text-[13px] font-semibold text-[#0F172A] truncate">
                      {item.filename}
                    </span>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10.5px] font-medium border shrink-0 whitespace-nowrap",
                        meta.badgeClass
                      )}
                    >
                      {meta.label}
                    </span>
                    {item.isDefault && (
                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3" />
                        默认发信附件
                      </span>
                    )}
                  </div>
                  <div className="text-[11.5px] text-[#64748B] flex flex-wrap items-center gap-2">
                    <span className="cue-mono">{item.sizeMb} MB</span>
                    {item.tagNote && (
                      <span className="text-[#475569]">· {item.tagNote}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`/api/resumes/${item.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    title="在线预览或下载"
                    className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#475569] hover:text-[#0F172A]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  {cat === "resume" && !item.isDefault && (
                    <button
                      type="button"
                      title="设为默认发信简历"
                      onClick={() => setDefaultMutation.mutate(item.id)}
                      className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-amber-600 cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    title="删除附件"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(item.id)}
                    className="w-7 h-7 rounded-full bg-white hairline inline-flex items-center justify-center text-[#64748B] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
