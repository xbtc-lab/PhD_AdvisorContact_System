import { Dialog } from "@base-ui/react/dialog";
import { Command } from "cmdk";
import {
  Compass,
  FileUser,
  Inbox,
  MailPlus,
  PenLine,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { BootstrapData } from "@app/shared";
import { useAppStore } from "@/store/useAppStore.js";
import { AdvisorAvatar } from "./ui/AdvisorAvatar.js";

export interface CommandPaletteProps {
  bootstrap: BootstrapData;
}

/**
 * 全局快捷命令面板（Ctrl/Cmd + K）：支持导师秒跳、六大主视图切换及快捷弹窗呼出。
 */
export function CommandPalette({ bootstrap }: CommandPaletteProps) {
  const open = useAppStore((s) => s.commandOpen);
  const setOpen = useAppStore((s) => s.setCommandOpen);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setSettingsSection = useAppStore((s) => s.setSettingsSection);
  const openWriterFor = useAppStore((s) => s.openWriterFor);
  const setAiImportOpen = useAppStore((s) => s.setAiImportOpen);
  const setQuickAddOpen = useAppStore((s) => s.setQuickAddOpen);
  const setQuickComposeOpen = useAppStore((s) => s.setQuickComposeOpen);
  const setDispatchOpen = useAppStore((s) => s.setDispatchOpen);
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
          <Dialog.Popup className="base-dialog-popup w-full max-w-lg rounded-3xl glass-popover overflow-hidden outline-none">
            <Dialog.Title className="sr-only">全局快捷命令面板</Dialog.Title>
            <Dialog.Description className="sr-only">
              搜索导师或快速呼出 PhD Cue 套磁工作台视图与工具
            </Dialog.Description>

            <Command label="PhD Cue 全局命令" className="w-full">
              <div className="flex items-center gap-2.5 px-4 h-12 border-b border-slate-100">
                <Search className="w-4 h-4 theme-text shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="搜索导师姓名、高校或快捷命令（如 写信 / 履历 / 设置 / Prompt）..."
                  className="w-full text-[13.5px] bg-transparent text-[#0F172A] placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <Command.List className="max-h-[360px] overflow-y-auto p-2 space-y-2 text-[12px]">
                <Command.Empty className="py-8 text-center text-slate-400">
                  没有匹配的导师或命令
                </Command.Empty>

                <Command.Group
                  heading="工作台视图与快捷工具"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-400"
                >
                  <Command.Item
                    value="发现导师 软科库 discover"
                    onSelect={() => runAndClose(() => setActiveTab("discover"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Compass className="w-4 h-4 theme-text" />
                    <span>前往「发现导师」公共库</span>
                  </Command.Item>
                  <Command.Item
                    value="我的导师 联系台账 mine"
                    onSelect={() => runAndClose(() => setActiveTab("mine"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Users className="w-4 h-4 theme-text" />
                    <span>前往「我的导师」台账</span>
                  </Command.Item>
                  <Command.Item
                    value="写信工坊 AI 撰写 write"
                    onSelect={() => runAndClose(() => setActiveTab("write"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <PenLine className="w-4 h-4 theme-text" />
                    <span>前往「写信工坊」双栏写作台</span>
                  </Command.Item>
                  <Command.Item
                    value="往来动态 回复追踪 inbox"
                    onSelect={() => runAndClose(() => setActiveTab("inbox"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Inbox className="w-4 h-4 theme-text" />
                    <span>前往「往来动态」追踪回信</span>
                  </Command.Item>
                  <Command.Item
                    value="我的履历 论文 成绩单 荣誉 profile"
                    onSelect={() => runAndClose(() => setActiveTab("profile"))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <FileUser className="w-4 h-4 theme-text" />
                    <span>前往「我的履历」学术档案库</span>
                  </Command.Item>
                  <Command.Item
                    value="外观与系统设置 邮箱 AI 主题 settings"
                    onSelect={() =>
                      runAndClose(() => setSettingsSection("appearance"))
                    }
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Settings className="w-4 h-4 text-slate-600" />
                    <span>打开「外观、发件箱与系统设置」</span>
                  </Command.Item>
                  <Command.Item
                    value="AI 采集院系师资网页"
                    onSelect={() => runAndClose(() => setAiImportOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Sparkles className="w-4 h-4 theme-text" />
                    <span>打开 AI 师资网页智能采集</span>
                  </Command.Item>
                  <Command.Item
                    value="手动新增导师档案"
                    onSelect={() => runAndClose(() => setQuickAddOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <UserPlus className="w-4 h-4 text-slate-600" />
                    <span>手动新增导师档案</span>
                  </Command.Item>
                  <Command.Item
                    value="写新邮件 快速单发"
                    onSelect={() => runAndClose(() => setQuickComposeOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <MailPlus className="w-4 h-4 text-slate-600" />
                    <span>写新邮件（自由单发）</span>
                  </Command.Item>
                  <Command.Item
                    value="打开错峰群发调度队列"
                    onSelect={() => runAndClose(() => setDispatchOpen(true))}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <Rocket className="w-4 h-4 theme-text" />
                    <span>打开批量错峰发送调度队列</span>
                  </Command.Item>
                  <Command.Item
                    value="管理员 Prompt 调优控制台 admin"
                    onSelect={() =>
                      runAndClose(() => setAdminPromptOpen(true))
                    }
                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-600" />
                    <span>管理员 Prompt 调优控制台（需令牌）</span>
                  </Command.Item>
                </Command.Group>

                <Command.Group
                  heading={`直接跳转到我的导师写信 (${bootstrap.advisors.length})`}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-slate-400"
                >
                  {bootstrap.advisors.map((adv) => (
                    <Command.Item
                      key={adv.id}
                      value={`${adv.name} ${adv.institutionName} ${adv.dept} ${adv.email} ${adv.researchTags.join(" ")}`}
                      onSelect={() =>
                        runAndClose(() => openWriterFor(adv.id))
                      }
                      className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl cursor-pointer aria-selected:bg-[#F4F5F7] aria-selected:text-[#0F172A]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <AdvisorAvatar
                          name={adv.name}
                          seed={adv.avatarSeed}
                          styleMode={bootstrap.preferences.avatarStyle}
                          size={24}
                        />
                        <span className="font-semibold text-[#0F172A] truncate">
                          {adv.name}
                        </span>
                        <span className="text-slate-400 truncate">
                          {adv.institutionName} · {adv.dept}
                        </span>
                      </div>
                      <span className="cue-mono text-[10.5px] text-slate-400 shrink-0">
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
