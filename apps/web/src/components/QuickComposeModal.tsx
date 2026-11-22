import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import type { BootstrapData } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { fileToBase64 } from "@/lib/cn.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { BaseSwitch } from "./ui/BaseSwitch.js";
import { Button } from "./ui/Button.js";

export interface QuickComposeModalProps {
  bootstrap: BootstrapData;
}

/**
 * 独立自由写信弹窗：无需事先建档即可直接向新邮箱发出带附件邮件，可选自动收录联系人。
 */
export function QuickComposeModal({ bootstrap }: QuickComposeModalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const open = useAppStore((s) => s.quickComposeOpen);
  const setOpen = useAppStore((s) => s.setQuickComposeOpen);
  const triggerCelebration = useAppStore((s) => s.triggerCelebration);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);

  const [toEmail, setToEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState("auto");
  const [autoAddContact, setAutoAddContact] = useState(true);
  const [includeAttachment, setIncludeAttachment] = useState(true);
  const [customFile, setCustomFile] = useState<{
    name: string;
    base64: string;
  } | null>(null);

  const sendMutation = useMutation({
    mutationFn: () =>
      workerApi.sendSingleMail({
        toEmail: toEmail.trim(),
        contactName: contactName.trim() || undefined,
        institutionName: institutionName.trim() || undefined,
        subject: subject.trim(),
        body,
        accountId,
        includeAttachment,
        customAttachmentName: customFile?.name,
        customAttachmentBase64: customFile?.base64,
        autoAddContact,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      if (res.advisorId) {
        setSelectedAdvisorId(res.advisorId);
      }
      setOpen(false);
      triggerCelebration(`独立邮件已发出至 ${toEmail.trim()}`);
      setToEmail("");
      setContactName("");
      setSubject("");
      setBody("");
      setCustomFile(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <MailPlus className="w-4 h-4 theme-text" />
          <span>写新邮件（快速单发）</span>
        </span>
      }
      maxWidthClass="max-w-xl"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={sendMutation.isPending}
            disabled={!toEmail.trim() || !subject.trim() || !body.trim()}
            icon={<Send className="w-3.5 h-3.5" />}
            onClick={() => sendMutation.mutate()}
          >
            立即发送
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[12px]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div>
            <label className="text-slate-600 font-medium">收件人邮箱 *</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="advisor@univ.edu.cn"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
            />
          </div>
          <div>
            <label className="text-slate-500">导师称呼</label>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="选填，自动建档用"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <label className="text-slate-500">高校名称</label>
            <input
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="默认归入自由联系"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="text-slate-600 font-medium">邮件主题 *</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="博士申请咨询..."
            className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
          />
        </div>

        <div>
          <label className="text-slate-600 font-medium">邮件正文 *</label>
          <textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="输入正文内容..."
            className="mt-1 w-full p-3 rounded-xl border border-slate-200 bg-white leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">发件箱</span>
            <BaseSelect
              size="xs"
              value={accountId}
              onValueChange={setAccountId}
              options={[
                { value: "auto", label: "自动分配发件箱" },
                ...bootstrap.mailAccounts.map((a) => ({
                  value: a.id,
                  label: a.label,
                })),
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <BaseSwitch
              checked={includeAttachment}
              label={customFile ? customFile.name : "携带默认简历"}
              onCheckedChange={setIncludeAttachment}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const base64 = await fileToBase64(file);
                setCustomFile({ name: file.name, base64 });
                setIncludeAttachment(true);
              }}
            />
            <Button
              variant="ghost"
              size="xs"
              icon={<Paperclip className="w-3 h-3" />}
              onClick={() => fileInputRef.current?.click()}
            >
              自选 PDF
            </Button>
          </div>
        </div>

        <BaseSwitch
          checked={autoAddContact}
          label="发送后自动将该联系人收录进导师库并记录通信线程"
          onCheckedChange={setAutoAddContact}
        />
      </div>
    </ModalDialog>
  );
}
