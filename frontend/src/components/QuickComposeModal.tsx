import React, { useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button, ModalDialog, SelectBox, SwitchControl } from "./ui";
import { apiFetch, cn } from "../lib/api";
import type { AccountConfig } from "../types";

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || "");
      const idx = s.indexOf(",");
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    reader.onerror = () => reject(new Error("读取附件失败"));
    reader.readAsDataURL(file);
  });
}

const INPUT_CLS =
  "w-full h-8.5 px-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[9px] text-[12.5px] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 transition-all";

export function QuickComposeModal({
  open,
  onOpenChange,
  accounts,
  defaultResumeName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: AccountConfig[];
  defaultResumeName: string;
  onSent: (professorId?: string) => Promise<void>;
}) {
  const defaultAccId =
    accounts.find((a) => a.enabled && a.has_password)?.id || accounts[0]?.id || "自动分配";

  const [toEmail, setToEmail] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactSchool, setContactSchool] = useState("自由联系");
  const [accountId, setAccountId] = useState(defaultAccId);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [useDefaultResume, setUseDefaultResume] = useState(Boolean(defaultResumeName));
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [autoAddContact, setAutoAddContact] = useState(true);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    if (!toEmail.trim() || !toEmail.includes("@")) {
      toast.warning("请填写正确的收件邮箱地址");
      return;
    }
    if (!subject.trim()) {
      toast.warning("请填写邮件主题");
      return;
    }
    if (!body.trim()) {
      toast.warning("请填写邮件正文");
      return;
    }
    setSending(true);
    try {
      let attachment_filename = "";
      let attachment_base64 = "";
      if (customFile) {
        attachment_filename = customFile.name;
        attachment_base64 = await readAsBase64(customFile);
      }
      const res = await apiFetch<{ ok: boolean; message: string; professor_id?: string }>(
        "/api/mail/send_single",
        "POST",
        {
          to_email: toEmail.trim(),
          contact_name: contactName.trim(),
          contact_school: contactSchool.trim() || "自由联系",
          account_id: accountId,
          subject: subject.trim(),
          body,
          include_attachment: useDefaultResume,
          attachment_filename,
          attachment_base64,
          auto_add_contact: autoAddContact,
        }
      );
      toast.success(res.message || "邮件已发出");
      setToEmail("");
      setContactName("");
      setSubject("");
      setBody("");
      setCustomFile(null);
      onOpenChange(false);
      await onSent(res.professor_id);
    } catch (e: any) {
      toast.error(e.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onOpenChange={onOpenChange}
      title="写一封新邮件"
      description="随时手写发送单封学术邮件（如咨询导师、联系学院教务或补发代表作），也可顺手归档以便自动追踪回信。"
      maxWidth="max-w-[640px]"
      footer={
        <>
          <div className="flex-1 flex items-center">
            <SwitchControl
              checked={autoAddContact}
              onCheckedChange={setAutoAddContact}
              label="自动收录到联系人列表以追踪回信"
            />
          </div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="primary" loading={sending} onClick={handleSend}>
            <Send className="w-3.5 h-3.5" />
            <span>立即发送</span>
          </Button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setCustomFile(f);
          e.target.value = "";
        }}
      />

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">收件邮箱 *</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="professor@university.edu.cn"
              className={cn(INPUT_CLS, "font-mono text-[12px]")}
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">发件邮箱</label>
            <SelectBox
              variant="form"
              value={accountId}
              onValueChange={setAccountId}
              options={[
                { value: "自动分配", label: "自动选择可用发件箱" },
                ...accounts.map((a) => ({
                  value: a.id,
                  label: `${a.id} (${a.email || "未填"})`,
                })),
              ]}
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">对方姓名 / 称呼（可选）</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="例如：李教授"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">归档分组 / 高校名</label>
            <input
              type="text"
              value={contactSchool}
              onChange={(e) => setContactSchool(e.target.value)}
              placeholder="自由联系"
              className={INPUT_CLS}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">邮件主题 *</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="请输入清晰简洁的邮件标题..."
            className={cn(INPUT_CLS, "font-medium")}
          />
        </div>

        <div>
          <label className="block text-[11.5px] font-medium text-[#52525B] mb-1">邮件正文 *</label>
          <textarea
            rows={7}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="尊敬的老师：&#10;您好！..."
            className="w-full p-3 bg-white ring-1 ring-slate-900/[0.1] rounded-[11px] text-[13.5px] leading-[1.8] text-[#18181B] placeholder:text-[#9CA3AF] outline-none focus:ring-2 focus:ring-[#2563EB]/20 resize-y transition-all"
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] bg-[#F8F9FB] ring-1 ring-slate-900/[0.06] flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Paperclip className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
            {customFile ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#18181B] bg-white px-2 py-0.5 rounded-[6px] ring-1 ring-slate-900/[0.08]">
                <span className="truncate max-w-[240px]">{customFile.name}</span>
                <button
                  type="button"
                  onClick={() => setCustomFile(null)}
                  className="text-[#9CA3AF] hover:text-[#18181B] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <SwitchControl
                checked={useDefaultResume}
                onCheckedChange={setUseDefaultResume}
                label={defaultResumeName ? `附带默认简历 (${defaultResumeName})` : "未设置默认简历"}
              />
            )}
          </div>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            上传临时 PDF 附件
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
