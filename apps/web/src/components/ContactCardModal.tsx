import { Dialog } from "@base-ui/react/dialog";
import { Copy, Phone, X } from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData } from "@app/shared";
import { useAppStore } from "@/store/useAppStore.js";

export interface ContactCardModalProps {
  bootstrap: BootstrapData;
}

/**
 * HTML 互动联系名片预览弹窗：实时联动个人履历姓名、方向、手机、微信号与上传的微信二维码图片。
 */
export function ContactCardModal({ bootstrap }: ContactCardModalProps) {
  const open = useAppStore((s) => s.contactCardOpen);
  const setOpen = useAppStore((s) => s.setContactCardOpen);

  const profile = bootstrap.profile;
  const qrAttachment = bootstrap.resumes.find((r) => r.category === "wechat_qr");
  const qrImgUrl = profile.wechatQrPath || (qrAttachment ? `/api/resumes/${qrAttachment.id}/view` : "");

  const displayName = [
    profile.name || "未填姓名",
    [profile.affiliation, profile.degreeInfo].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(" · ");
  const dirsText =
    profile.targetDirections.length > 0
      ? `研究方向：${profile.targetDirections.join("、")}`
      : "请在「我的履历」完善拟申博研究方向";
  const initialChar = (profile.name.trim()[0] || "C").toUpperCase();
  const cleanTel = (profile.phone || "").replace(/[^0-9+]/g, "");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[80] bg-slate-950/25 backdrop-blur-[4px]" />
        <Dialog.Viewport className="fixed inset-0 z-[85] flex items-center justify-center p-4">
          <Dialog.Popup className="base-dialog-popup w-full max-w-[380px] glass-popover rounded-[26px] p-6 space-y-5 text-center outline-none">
            <div className="flex justify-between items-center text-left">
              <Dialog.Title className="text-[12px] font-semibold theme-text">
                HTML 互动联系卡预览
              </Dialog.Title>
              <Dialog.Close
                aria-label="关闭"
                className="w-7 h-7 rounded-full neutral-pill inline-flex items-center justify-center border-0 cursor-pointer hover:brightness-95"
              >
                <X className="w-3.5 h-3.5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              套磁信结尾互动名片在手机或电脑端打开后的联系卡落地页预览
            </Dialog.Description>

            <div className="space-y-1.5">
              <div className="w-12 h-12 rounded-2xl theme-avatar text-white text-[16px] font-bold inline-flex items-center justify-center mx-auto">
                {initialChar}
              </div>
              <div className="text-[16px] font-bold text-[#0F172A]">{displayName}</div>
              <div className="text-[12px] text-[#64748B]">{dirsText}</div>
            </div>

            <div className="p-4 rounded-2xl card-well space-y-3">
              <div className="mx-auto w-28 h-28 rounded-xl bg-white hairline flex items-center justify-center overflow-hidden">
                {qrImgUrl ? (
                  <img
                    src={qrImgUrl}
                    alt="微信二维码"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
                    <rect x="6" y="6" width="24" height="24" rx="4" stroke="#0F172A" strokeWidth="4" />
                    <rect x="13" y="13" width="10" height="10" fill="#0F172A" />
                    <rect x="58" y="6" width="24" height="24" rx="4" stroke="#0F172A" strokeWidth="4" />
                    <rect x="65" y="13" width="10" height="10" fill="#0F172A" />
                    <rect x="6" y="58" width="24" height="24" rx="4" stroke="#0F172A" strokeWidth="4" />
                    <rect x="13" y="65" width="10" height="10" fill="#0F172A" />
                    <rect x="38" y="38" width="12" height="12" rx="2" fill="var(--accent)" />
                    <rect x="58" y="58" width="10" height="10" fill="#0F172A" />
                    <rect x="72" y="72" width="10" height="10" fill="#0F172A" />
                  </svg>
                )}
              </div>
              <div className="text-[12px] text-[#475569] cue-mono">
                {profile.wechat ? `微信号：${profile.wechat}` : "尚未填写微信号（可在我的履历补充）"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={cleanTel ? `tel:${cleanTel}` : "#"}
                onClick={(e) => {
                  e.preventDefault();
                  if (!profile.phone.trim()) {
                    toast.info("请先在「我的履历」填写联系电话");
                    return;
                  }
                  toast.success(`手机端将通过 tel:${cleanTel} 直接拉起系统拨号盘`);
                }}
                className="theme-cta py-2.5 rounded-full text-[12.5px] font-semibold no-underline inline-flex items-center justify-center gap-1.5"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>一键拨打电话</span>
              </a>
              <button
                type="button"
                onClick={async () => {
                  if (!profile.wechat.trim()) {
                    toast.info("请先在「我的履历」填写微信号");
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(profile.wechat.trim());
                  } catch {
                    // 忽略剪贴板权限限制
                  }
                  toast.success(`已复制微信号：${profile.wechat.trim()}`);
                }}
                className="py-2.5 rounded-full bg-white hairline text-[12.5px] font-semibold text-[#0F172A] cursor-pointer theme-hover-border transition-all inline-flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>复制微信号</span>
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
