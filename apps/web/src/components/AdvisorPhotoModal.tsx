import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@base-ui/react/dialog";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AcademicPortraitPlaceholder } from "./ui/AdvisorPhotoAvatar.js";

/**
 * 导师真实照片高清大图灯箱：展示实拍照片/兜底肖像、官方来源与一键前往写信。
 */
export function AdvisorPhotoModal() {
  const queryClient = useQueryClient();
  const data = useAppStore((s) => s.photoModalData);
  const setData = useAppStore((s) => s.setPhotoModalData);
  const openWriterFor = useAppStore((s) => s.openWriterFor);

  const [imgError, setImgError] = useState(false);

  const openWriteMutation = useMutation({
    mutationFn: async () => {
      if (!data) return "";
      if (data.advisorId) return data.advisorId;
      if (data.catalogId) {
        const res = await workerApi.adoptCatalogAdvisor(data.catalogId);
        await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
        await queryClient.invalidateQueries({ queryKey: ["catalog-advisors"] });
        return res.advisor.id;
      }
      return "";
    },
    onSuccess: (advisorId) => {
      setData(null);
      if (advisorId) {
        openWriterFor(advisorId);
      } else {
        toast.info("请先收录该导师到我的列表");
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const hasRealPhoto = Boolean(data?.photoUrl?.trim() && !imgError);
  const domainHint = (() => {
    if (!data) return "";
    if (data.photoSource) return data.photoSource;
    if (!data.homepageUrl) return "官方教师主页";
    try {
      return new URL(data.homepageUrl).hostname;
    } catch {
      return data.homepageUrl;
    }
  })();

  return (
    <Dialog.Root
      open={Boolean(data)}
      onOpenChange={(open) => {
        if (!open) {
          setImgError(false);
          setData(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[80] bg-slate-950/25 backdrop-blur-[4px]" />
        <Dialog.Viewport className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <Dialog.Popup className="base-dialog-popup w-full max-w-[380px] glass-popover rounded-[26px] p-5 space-y-4 outline-none">
            <div className="flex items-center justify-between">
              <Dialog.Title className="px-2.5 py-1 rounded-full theme-soft-pill text-[12px] font-semibold">
                {hasRealPhoto ? "官网实拍照片" : "官网实拍 · 待采集"}
              </Dialog.Title>
              <Dialog.Close
                aria-label="关闭"
                className="w-7 h-7 rounded-full neutral-pill inline-flex items-center justify-center border-0 cursor-pointer hover:brightness-95"
              >
                <X className="w-3.5 h-3.5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              导师照片放大预览与官网主页跳转
            </Dialog.Description>

            <div className="aspect-[220/146] rounded-[18px] overflow-hidden hairline bg-[#F4F5F7]">
              {hasRealPhoto && data ? (
                <img
                  src={data.photoUrl}
                  alt={`${data.name} 照片`}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <AcademicPortraitPlaceholder />
              )}
            </div>

            {data && (
              <div className="space-y-1 px-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[17px] font-bold text-[#0F172A]">
                    {data.name}
                  </span>
                  <span className="text-[12.5px] font-semibold text-[#334155]">
                    {data.school}
                  </span>
                </div>
                <div className="text-[12.5px] text-[#64748B]">
                  {[data.dept, data.title].filter(Boolean).join(" · ") || "博导档案"}
                </div>
                <div className="text-[12px] text-[#94A3B8] cue-mono pt-0.5">
                  来源：{domainHint}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (data?.homepageUrl && data.homepageUrl.startsWith("http")) {
                    window.open(data.homepageUrl, "_blank", "noopener,noreferrer");
                  } else {
                    toast.info("当前导师尚未填写有效官方主页链接");
                  }
                }}
                className="py-2.5 rounded-full bg-white hairline text-[12.5px] font-semibold text-[#0F172A] cursor-pointer theme-hover-border transition-all inline-flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>查看官方主页</span>
              </button>
              <button
                type="button"
                disabled={openWriteMutation.isPending}
                onClick={() => openWriteMutation.mutate()}
                className="theme-cta py-2.5 rounded-full text-[12.5px] font-semibold border-0 cursor-pointer disabled:opacity-60"
              >
                {openWriteMutation.isPending ? "准备中..." : "直接去写信 →"}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
