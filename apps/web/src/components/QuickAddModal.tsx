import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  MATCH_TIER_OPTIONS,
  type BootstrapData,
  type MatchTier,
} from "@app/shared";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { ModalDialog } from "./ui/BaseDialog.js";
import { BaseSelect } from "./ui/BaseSelect.js";
import { Button } from "./ui/Button.js";

export interface QuickAddModalProps {
  bootstrap: BootstrapData;
}

/**
 * 手动快速新建导师档案弹窗。
 */
export function QuickAddModal({ bootstrap }: QuickAddModalProps) {
  const queryClient = useQueryClient();
  const open = useAppStore((s) => s.quickAddOpen);
  const setOpen = useAppStore((s) => s.setQuickAddOpen);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);

  const [institutionName, setInstitutionName] = useState(
    bootstrap.institutions[0]?.name || ""
  );
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [title, setTitle] = useState("教授 / 博导");
  const [email, setEmail] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [matchTier, setMatchTier] = useState<MatchTier>("high");
  const [tags, setTags] = useState("");
  const [researchSummary, setResearchSummary] = useState("");
  const [hookNote, setHookNote] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      workerApi.createAdvisor({
        institutionName: institutionName.trim() || "待补充高校",
        name: name.trim(),
        dept: dept.trim(),
        title: title.trim(),
        email: email.trim(),
        homepageUrl: homepageUrl.trim(),
        matchTier,
        researchTags: tags
          .split(/[,，、|]/)
          .map((s) => s.trim())
          .filter(Boolean),
        researchSummary: researchSummary.trim(),
        hookNote: hookNote.trim(),
        inBatch: true,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setSelectedAdvisorId(res.advisor.id);
      toast.success(`已添加 ${res.advisor.name} 导师档案`);
      setName("");
      setEmail("");
      setHomepageUrl("");
      setResearchSummary("");
      setHookNote("");
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <ModalDialog
      open={open}
      onOpenChange={setOpen}
      title={
        <span className="inline-flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#2563EB]" />
          <span>手动添加导师档案</span>
        </span>
      }
      maxWidthClass="max-w-lg"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim()}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            创建并开始写信
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[12px]">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-600 font-medium">所属高校 *</label>
            <input
              list="inst-suggestions"
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              placeholder="例如：厦门大学"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]"
            />
            <datalist id="inst-suggestions">
              {bootstrap.institutions.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="text-slate-600 font-medium">导师姓名 *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：李教授"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-[#2563EB]"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-slate-500">所在院系</label>
            <input
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              placeholder="信息学院"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <label className="text-slate-500">职称</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
          <div>
            <label className="text-slate-500">匹配梯度</label>
            <div className="mt-1">
              <BaseSelect<MatchTier>
                size="sm"
                value={matchTier}
                onValueChange={setMatchTier}
                options={MATCH_TIER_OPTIONS.map((m) => ({
                  value: m.value,
                  label: m.short,
                }))}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-500">联系邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@univ.edu.cn"
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white font-mono"
            />
          </div>
          <div>
            <label className="text-slate-500">个人主页链接</label>
            <input
              type="url"
              value={homepageUrl}
              onChange={(e) => setHomepageUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="text-slate-500">研究标签（逗号分隔）</label>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="多智能体系统、代码大模型"
            className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
          />
        </div>

        <div>
          <label className="text-slate-500">研究方向概述</label>
          <textarea
            rows={2}
            value={researchSummary}
            onChange={(e) => setResearchSummary(e.target.value)}
            className="mt-1 w-full p-2.5 rounded-xl border border-slate-200 bg-white"
          />
        </div>

        <div>
          <label className="text-slate-500">切入点笔记 Hook</label>
          <input
            value={hookNote}
            onChange={(e) => setHookNote(e.target.value)}
            placeholder="读过老师某篇最新论文后的切入想法..."
            className="mt-1 w-full h-8 px-3 rounded-xl border border-slate-200 bg-white"
          />
        </div>
      </div>
    </ModalDialog>
  );
}
