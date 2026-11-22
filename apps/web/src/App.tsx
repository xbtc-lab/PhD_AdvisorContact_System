import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { workerApi } from "@/lib/api.js";
import { useAppStore } from "@/store/useAppStore.js";
import { AdminPromptDrawer } from "./components/AdminPromptDrawer.js";
import { AdvisorPhotoModal } from "./components/AdvisorPhotoModal.js";
import { AiImportModal } from "./components/AiImportModal.js";
import { AppHeader, MobileBottomNav } from "./components/AppHeader.js";
import { CommandPalette } from "./components/CommandPalette.js";
import { ContactCardModal } from "./components/ContactCardModal.js";
import { CsvImportModal } from "./components/CsvImportModal.js";
import { DispatchDrawer } from "./components/DispatchDrawer.js";
import { QuickAddModal } from "./components/QuickAddModal.js";
import { QuickComposeModal } from "./components/QuickComposeModal.js";
import { ReplyAlertModal } from "./components/ReplyAlertModal.js";
import { SelfTestModal } from "./components/SelfTestModal.js";
import {
  CueMascot,
  SendCelebrationOverlay,
} from "./components/ui/BrandMascot.js";
import { Button } from "./components/ui/Button.js";
import { DiscoverView } from "./views/DiscoverView.js";
import { InboxView } from "./views/InboxView.js";
import { MyAdvisorsView } from "./views/MyAdvisorsView.js";
import { ProfileView } from "./views/ProfileView.js";
import { SettingsView } from "./views/SettingsView.js";
import { WriteStudioView } from "./views/WriteStudioView.js";

/**
 * PhD Cue V3.2 主工作台入口：
 * 串联纯净高定光感顶栏、六大桌面端独立主视图，以及全局模态窗与管理员控制台。
 */
export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const theme = useAppStore((s) => s.theme);
  const selectedAdvisorId = useAppStore((s) => s.selectedAdvisorId);
  const setSelectedAdvisorId = useAppStore((s) => s.setSelectedAdvisorId);
  const commandOpen = useAppStore((s) => s.commandOpen);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const celebratingText = useAppStore((s) => s.celebratingText);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: workerApi.bootstrap,
  });

  const bootstrap = bootstrapQuery.data;

  // 若尚未选中导师或原导师已被删除，自动落选台账第一位
  useEffect(() => {
    if (!bootstrap || bootstrap.advisors.length === 0) return;
    const stillExists = bootstrap.advisors.some(
      (a) => a.id === selectedAdvisorId
    );
    if (!stillExists) {
      setSelectedAdvisorId(bootstrap.advisors[0].id);
    }
  }, [bootstrap, selectedAdvisorId, setSelectedAdvisorId]);

  // 全局快捷键 Ctrl/Cmd + K 打开命令搜索板
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
    if (!bootstrap || bootstrap.advisors.length === 0) return null;
    if (!selectedAdvisorId) return bootstrap.advisors[0];
    return (
      bootstrap.advisors.find((a) => a.id === selectedAdvisorId) ||
      bootstrap.advisors[0]
    );
  }, [bootstrap, selectedAdvisorId]);

  if (bootstrapQuery.isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 luminous-canvas">
        <CueMascot size={56} />
        <p className="text-[13.5px] font-medium text-[#64748B]">
          正在唤醒 PhD Cue 科研联络工作台...
        </p>
      </div>
    );
  }

  if (bootstrapQuery.isError || !bootstrap) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 luminous-canvas p-6 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <div className="space-y-1.5 max-w-md">
          <h1 className="text-[17px] font-bold text-[#0F172A]">
            暂未连接到底层本地服务
          </h1>
          <p className="text-[12.5px] text-[#64748B]">
            请确认后端服务已启动，保证 cloud-core (8787) 与 worker-api (8788) 正常在线。
          </p>
          <p className="text-[11.5px] cue-mono text-rose-600">
            {bootstrapQuery.error instanceof Error
              ? bootstrapQuery.error.message
              : "连接失败"}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          icon={<RefreshCw className="w-3.5 h-3.5" />}
          onClick={() => bootstrapQuery.refetch()}
        >
          重新尝试连接
        </Button>
      </div>
    );
  }

  return (
    <div
      data-theme={theme}
      className="h-screen w-screen flex flex-col overflow-hidden luminous-canvas relative"
    >
      <AppHeader bootstrap={bootstrap} />

      <main ref={mainRef} className="flex-1 overflow-y-auto min-h-0 relative z-10">
        {activeTab === "discover" && <DiscoverView bootstrap={bootstrap} />}
        {activeTab === "mine" && <MyAdvisorsView bootstrap={bootstrap} />}
        {activeTab === "write" && (
          <WriteStudioView bootstrap={bootstrap} advisor={activeAdvisor} />
        )}
        {activeTab === "inbox" && <InboxView bootstrap={bootstrap} />}
        {activeTab === "profile" && <ProfileView bootstrap={bootstrap} />}
        {activeTab === "settings" && <SettingsView bootstrap={bootstrap} />}
      </main>

      <MobileBottomNav bootstrap={bootstrap} />

      {/* 全局轻量化弹窗与控制面板 */}
      <ContactCardModal bootstrap={bootstrap} />
      <AdvisorPhotoModal />
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
