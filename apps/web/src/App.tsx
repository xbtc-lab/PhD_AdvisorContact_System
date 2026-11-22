import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdminPromptDrawer } from "./components/AdminPromptDrawer.js";
import { AdvisorRail } from "./components/AdvisorRail.js";
import { AdvisorTableView } from "./components/AdvisorTableView.js";
import { AiImportModal } from "./components/AiImportModal.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { DispatchDrawer } from "./components/DispatchDrawer.js";
import { MailStudio } from "./components/MailStudio.js";
import { QuickAddModal } from "./components/QuickAddModal.js";
import { QuickComposeModal } from "./components/QuickComposeModal.js";
import { ReplyAlertModal } from "./components/ReplyAlertModal.js";
import { RightSidePanel } from "./components/RightSidePanel.js";
import { SelfTestModal } from "./components/SelfTestModal.js";
import { SettingsDrawer } from "./components/SettingsDrawer.js";
import { Topbar } from "./components/Topbar.js";
import { CsvImportModal } from "./components/CsvImportModal.js";
import {
  CueMascot,
  SendCelebrationOverlay,
} from "./components/ui/BrandMascot.js";
import { Button } from "./components/ui/Button.js";

/**
 * PhD Studio V2 主工作台入口：
 * 串联顶部导航、导师分栏工作台、TanStack 虚拟台账以及各模块抽屉与管理员控制台。
 */
export default function App() {
  const viewMode = useAppStore((s) => s.viewMode);
  const selectedAdvisorId = useAppStore((s) => s.selectedAdvisorId);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const commandOpen = useAppStore((s) => s.commandOpen);
  const celebratingText = useAppStore((s) => s.celebratingText);

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: workerApi.bootstrap,
  });

  const bootstrap = bootstrapQuery.data;

  // 若尚未选中导师或原导师已被删除，自动落选列表第一位
  useEffect(() => {
    if (!bootstrap || bootstrap.advisors.length === 0) return;
    const stillExists = bootstrap.advisors.some(
      (a) => a.id === selectedAdvisorId
    );
    if (!stillExists) {
      setSelectedAdvisorId(bootstrap.advisors[0].id);
    }
  }, [bootstrap, selectedAdvisorId, setSelectedAdvisorId]);

  // 全局注册 Cmd+K / Ctrl+K 打开快捷命令面板
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandOpen, setCommandOpen]);

  const activeAdvisor = useMemo(() => {
    if (!bootstrap || !selectedAdvisorId) return null;
    return (
      bootstrap.advisors.find((a) => a.id === selectedAdvisorId) ||
      bootstrap.advisors[0] ||
      null
    );
  }, [bootstrap, selectedAdvisorId]);

  if (bootstrapQuery.isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-[#FAFAFC]">
        <CueMascot size={56} />
        <p className="text-[13px] font-medium text-slate-500">
          正在唤醒 PhD Studio 工作台...
        </p>
      </div>
    );
  }

  if (bootstrapQuery.isError || !bootstrap) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 bg-[#FAFAFC] p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <div className="space-y-1 max-w-md">
          <h1 className="text-[16px] font-semibold text-[#111827]">
            暂未连接到底层本地服务
          </h1>
          <p className="text-[12.5px] text-slate-500">
            请确认根目录已运行 <code className="font-mono">pnpm dev</code>
            ，确保 cloud-core (8787) 与 worker-api (8788) 正常在线。
          </p>
          <p className="text-[11px] font-mono text-rose-500">
            {bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : "连接失败"}
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => bootstrapQuery.refetch()}
        >
          重新尝试连接
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#FAFAFC] relative">
      {/* 极淡背景氛围电光云 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 left-1/4 w-[520px] h-[280px] rounded-full bg-[#3695FF]/[0.05] blur-[90px]" />
        <div className="absolute bottom-0 right-1/5 w-[440px] h-[240px] rounded-full bg-[#2563EB]/[0.04] blur-[90px]" />
      </div>

      <Topbar bootstrap={bootstrap} />

      <div className="flex-1 min-h-0 flex relative z-10 overflow-hidden">
        {viewMode === "workspace" ? (
          <>
            <AdvisorRail bootstrap={bootstrap} />
            <MailStudio bootstrap={bootstrap} advisor={activeAdvisor} />
            <RightSidePanel bootstrap={bootstrap} advisor={activeAdvisor} />
          </>
        ) : (
          <AdvisorTableView bootstrap={bootstrap} />
        )}
      </div>

      {/* 全局抽屉与模态弹窗 */}
      <SettingsDrawer bootstrap={bootstrap} />
      <DispatchDrawer bootstrap={bootstrap} />
      <AdminPromptDrawer />
      <AiImportModal bootstrap={bootstrap} />
      <QuickAddModal bootstrap={bootstrap} />
      <QuickComposeModal bootstrap={bootstrap} />
      <SelfTestModal bootstrap={bootstrap} advisor={activeAdvisor} />
      <ReplyAlertModal bootstrap={bootstrap} />
      <CsvImportModal />
      <CommandPalette bootstrap={bootstrap} />

      <SendCelebrationOverlay text={celebratingText} />
    </div>
  );
}
