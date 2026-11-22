import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Send } from "lucide-react";
import { toast } from "sonner";
import type { Advisor, BootstrapData, OutreachDraft } from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { Button } from "./ui/Button.js";

export interface SelfTestModalProps {
  bootstrap: BootstrapData;
  advisor: Advisor | null;
}

/**
 * 测发给自己验证弹窗：
 * 在真正投递导师前，把当前正在编辑的邮件主题、正文与 PDF 附件先发到自己的另一个邮箱核查排版。
 */
export function SelfTestModal({ bootstrap, advisor }: SelfTestModalProps) {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.selfTestOpen);
  const setOpen = useAppStore((s) => s.setSelfTestOpen);

  const [accountId, setAccountId] = useState(
    bootstrap.mailAccounts[0]?.id || ""
  );
  const [testTo, setTestTo] = useState(bootstrap.mailAccounts[0]?.email || "");

  useEffect(() => {
    if (!accountId && bootstrap.mailAccounts[0]?.id) {
      setAccountId(bootstrap.mailAccounts[0].id);
    }
    if (!testTo && bootstrap.mailAccounts[0]?.email) {
      setTestTo(bootstrap.mailAccounts[0].email);
    }
  }, [bootstrap.mailAccounts, accountId, testTo, open]);

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new Error("请先在设置中配置至少一个发件箱");
      let subject = `PhD Studio 发信排版自测 - ${new Date().toLocaleTimeString()}`;
      let body = "这是一封来自 PhD Studio 的实时排版与附件自测邮件。";
      let resumeId: string | null | undefined = undefined;

      if (advisor) {
        const cached = queryClient.getQueryData<{ draft: OutreachDraft }>([
          "draft",
          advisor.id,
        ]);
        const draftRes =
          cached || (await workerApi.getDraft(advisor.id).catch(() => null));
        if (draftRes?.draft) {
          if (draftRes.draft.subject.trim()) {
            subject = `[自测预览] ${draftRes.draft.subject}`;
          }
          if (draftRes.draft.body.trim()) {
            body = draftRes.draft.body;
          }
          resumeId = draftRes.draft.resumeId;
        }
      }

      return workerApi.testSelfMail({
        testTo: testTo.trim(),
        accountId,
        subject,
        body,
        resumeId,
      });
    },
    onSuccess: () => {
      setOpen(false);
      toast.success(`排版测试邮件已发出到 ${testTo.trim()}，不扣减导师发信状态`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-[#2563EB]" />
          <span>发送实景排版测试到个人邮箱</span>
        </span>
      }
      description="不会改变任何导师进度状态，便于在手机与网页端提前检查中文折行与简历附件打开效果"
      maxWidthClass="max-w-md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={testMutation.isPending}
            disabled={!testTo.trim() || !accountId}
            icon={<Send className="w-3.5 h-3.5" />}
            onClick={() => testMutation.mutate()}
          >
            发出测试邮件
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[12px]">
        <div>
          <label className="text-slate-600 font-medium">选择测试发件箱</label>
          <div className="mt-1">
            <BaseSelect
              size="sm"
              value={accountId}
              onValueChange={setAccountId}
              placeholder="请先配置发件箱"
              options={bootstrap.mailAccounts.map((acc) => ({
                value: acc.id,
                label: `${acc.label} (${acc.email})`,
              }))}
            />
          </div>
        </div>
        <div>
          <label className="text-slate-600 font-medium">测试收件邮箱地址</label>
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="填入你用来验收排版的个人邮箱..."
            className="mt-1 w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-mono"
          />
        </div>
      </div>
    </ModalDialog>
  );
}
