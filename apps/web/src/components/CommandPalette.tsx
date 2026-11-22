import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import {
  LayoutGrid,
  MailPlus,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  UserPlus,
} from "lucide-react";
import type { BootstrapData } from "@app/shared";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "./ui/AdvisorAvatar.js";

export interface CommandPaletteProps {
  bootstrap: BootstrapData;
}

/**
 * 全局快捷命令面板（Ctrl/Cmd + K）：支持导师秒跳、视图切换及系统工具快速呼出。
 */
export function CommandPalette({ bootstrap }: CommandPaletteProps) {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setAiImportOpen = useAppStore((s) => s.setAiImportOpen);
  const setQuickAddOpen = useAppStore((s) => s.setQuickAddOpen);
  const setQuickComposeOpen = useAppStore((s) => s.setQuickComposeOpen);
  const setDispatchOpen = useAppStore((s) => s.setDispatchOpen);
  const openSettings = useAppStore((s) => s.openSettings);
  const setAdminPromptOpen = useAppStore((s) => s.setAdminPromptOpen);

  function runAndClose(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Backdrop className="base-dialog-backdrop fixed inset-0 z-[90] bg-slate-950/24 backdrop-blur-[4px]" />
        <Dialog.Viewport className="fixed inset-0 z-[95] flex items-start justify-center pt-[12vh] p-4">
          <Dialog.Popup className="base-dialog-popup w-full max-w-lg rounded-3xl bg-white/96 backdrop-blur-2xl border border-white/80 shadow-[0_24px_70px_-14px_rgba(15,23,42,0.26),0_0_0_1px_rgba(15,23,42,0.06)] overflow-hidden outline-none">
            <Dialog.Title className="sr-only">全局快捷命令面板</Dialog.Title>
            <Dialog.Description className="sr-only">
              搜索导师或快速呼出套磁工作台工具
            </Dialog.Description>

            <Command label="PhD Studio 全局命令" className="w-full">
              <div className="flex items-center gap-2.5 px-4 h-12 border-b border-slate-100">
                <Search className="w-4 h-4 text-[#2563EB] shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="搜索导师姓名、高校或命令（如 群发 / 设置 / Prompt）..."
                  className="w-full text-[13.5px] bg-transparent text-[#111827] placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <Command.List className="max-h-[360px] overflow-y-auto p-2 space-y-2 text-[12px]">
                <Command.Empty className="py-8 text-center text-slate-400">
                  没有匹配的导师或命令
                </Command.Empty>

                <Command.Group
                  heading="快速工作流指令"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-400"
                >
                  <Command.Item
                    value="切换到写信工作台 workspace"
                    onSelect={() => runAndClose(() => setViewMode("workspace"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <LayoutGrid className="w-4 h-4 text-[#2563EB]" />
                    <span>切换到写信工作台</span>
                  </Command.Item>
                  <Command.Item
                    value="切换到导师数据台账 table"
                    onSelect={() => runAndClose(() => setViewMode("table"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <Table2 className="w-4 h-4 text-[#2563EB]" />
                    <span>切换到导师数据台账</span>
                  </Command.Item>
                  <Command.Item
                    value="AI 采集院系师资网页"
                    onSelect={() => runAndClose(() => setAiImportOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <Sparkles className="w-4 h-4 text-[#2563EB]" />
                    <span>打开 AI 师资网页智能采集</span>
                  </Command.Item>
                  <Command.Item
                    value="手动新增导师档案"
                    onSelect={() => runAndClose(() => setQuickAddOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <UserPlus className="w-4 h-4 text-slate-600" />
                    <span>手动新增导师档案</span>
                  </Command.Item>
                  <Command.Item
                    value="写新邮件 快速单发"
                    onSelect={() => runAndClose(() => setQuickComposeOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <MailPlus className="w-4 h-4 text-slate-600" />
                    <span>写新邮件（自由单发）</span>
                  </Command.Item>
                  <Command.Item
                    value="打开错峰群发调度队列"
                    onSelect={() => runAndClose(() => setDispatchOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <Rocket className="w-4 h-4 text-[#2563EB]" />
                    <span>打开批量错峰发送调度队列</span>
                  </Command.Item>
                  <Command.Item
                    value="打开设置 名片 邮箱 AI 策略"
                    onSelect={() => runAndClose(() => openSettings("profile"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <Settings className="w-4 h-4 text-slate-600" />
                    <span>打开个人名片 / 发件箱 / AI 设置</span>
                  </Command.Item>
                  <Command.Item
                    value="管理员 Prompt 调优控制台 admin"
                    onSelect={() =>
                      runAndClose(() => setAdminPromptOpen(true))
                    }
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-600" />
                    <span>管理员 Prompt 调优控制台（需令牌）</span>
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading={`跳转到导师 (${bootstrap.advisors.length})`}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-400"
                >
                  {bootstrap.advisors.map((adv) => (
                    <Command.Item
                      key={adv.id}
                      value={`${adv.name} ${adv.institutionName} ${adv.dept} ${adv.email} ${adv.researchTags.join(" ")}`}
                      onSelect={() =>
                        runAndClose(() => {
                          setSelectedAdvisorId(adv.id);
                          setViewMode("workspace");
                        })
                      }
                      className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-blue-50/90 aria-selected:text-[#1D4ED8]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AdvisorAvatar
                          name={adv.name}
                          seed={adv.avatarSeed}
                          styleMode={bootstrap.preferences.avatarStyle}
                          size={24}
                        />
                        <span className="font-semibold text-[#111827] truncate">
                          {adv.name}
                        </span>
                        <span className="text-slate-400 truncate">
                          {adv.institutionName} · {adv.dept}
                        </span>
                      </div>
                      <span className="font-mono text-[10.5px] text-slate-400 shrink-0">
                        {adv.email || "缺邮箱"}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
