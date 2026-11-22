import { create } from "zustand";
import type { AdvisorStage, MatchTier } from "@app/shared";

export type MainViewMode = "workspace" | "table";
export type RightPanelTab = "copilot" | "profile" | "thread";
export type SettingsTabKey = "profile" | "mailbox" | "ai" | "data";

interface AppUiState {
  viewMode: MainViewMode;
  selectedAdvisorId: string | null;
  selectedInstitutionId: string;
  filterMatch: "all" | MatchTier;
  filterStage: "all" | AdvisorStage;
  filterUnreadOnly: boolean;
  searchQuery: string;
  rightTab: RightPanelTab;

  // 弹窗与抽屉显隐状态
  settingsOpen: boolean;
  settingsTab: SettingsTabKey;
  dispatchOpen: boolean;
  adminPromptOpen: boolean;
  aiImportOpen: boolean;
  quickAddOpen: boolean;
  quickComposeOpen: boolean;
  replyAlertOpen: boolean;
  csvImportOpen: boolean;
  commandOpen: boolean;
  selfTestOpen: boolean;

  // 单封回复引用上下文（用于从“往来回信”一键回复）
  replyQuote: {
    inReplyTo: string;
    references: string;
    subjectHint: string;
  } | null;

  // 触发发件成功庆贺动效
  celebratingText: string | null;

  setViewMode: (mode: MainViewMode) => void;
  setSelectedAdvisorId: (id: string | null) => void;
  setSelectedInstitutionId: (id: string) => void;
  setFilterMatch: (tier: "all" | MatchTier) => void;
  setFilterStage: (stage: "all" | AdvisorStage) => void;
  setFilterUnreadOnly: (val: boolean) => void;
  setSearchQuery: (q: string) => void;
  setRightTab: (tab: RightPanelTab) => void;

  openSettings: (tab?: SettingsTabKey) => void;
  setSettingsOpen: (open: boolean) => void;
  setDispatchOpen: (open: boolean) => void;
  setAdminPromptOpen: (open: boolean) => void;
  setAiImportOpen: (open: boolean) => void;
  setQuickAddOpen: (open: boolean) => void;
  setQuickComposeOpen: (open: boolean) => void;
  setReplyAlertOpen: (open: boolean) => void;
  setCsvImportOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setSelfTestOpen: (open: boolean) => void;
  setReplyQuote: (quote: AppUiState["replyQuote"]) => void;
  triggerCelebration: (text: string) => void;
}

/**
 * 全局轻量 UI 状态仓库（业务实体统一由 TanStack Query 管理，避免双份状态漂移）。
 */
export const useAppStore = create<AppUiState>((set) => ({
  viewMode: "workspace",
  selectedAdvisorId: null,
  selectedInstitutionId: "all",
  filterMatch: "all",
  filterStage: "all",
  filterUnreadOnly: false,
  searchQuery: "",
  rightTab: "copilot",

  settingsOpen: false,
  settingsTab: "profile",
  dispatchOpen: false,
  adminPromptOpen: false,
  aiImportOpen: false,
  quickAddOpen: false,
  quickComposeOpen: false,
  replyAlertOpen: false,
  csvImportOpen: false,
  commandOpen: false,
  selfTestOpen: false,

  replyQuote: null,
  celebratingText: null,

  setViewMode: (viewMode) => set({ viewMode }),
  setSelectedAdvisorId: (selectedAdvisorId) =>
    set({ selectedAdvisorId, replyQuote: null }),
  setSelectedInstitutionId: (selectedInstitutionId) => set({ selectedInstitutionId }),
  setFilterMatch: (filterMatch) => set({ filterMatch }),
  setFilterStage: (filterStage) => set({ filterStage }),
  setFilterUnreadOnly: (filterUnreadOnly) => set({ filterUnreadOnly }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setRightTab: (rightTab) => set({ rightTab }),

  openSettings: (tab = "profile") =>
    set({ settingsOpen: true, settingsTab: tab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setDispatchOpen: (dispatchOpen) => set({ dispatchOpen }),
  setAdminPromptOpen: (adminPromptOpen) => set({ adminPromptOpen }),
  setAiImportOpen: (aiImportOpen) => set({ aiImportOpen }),
  setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
  setQuickComposeOpen: (quickComposeOpen) => set({ quickComposeOpen }),
  setReplyAlertOpen: (replyAlertOpen) => set({ replyAlertOpen }),
  setCsvImportOpen: (csvImportOpen) => set({ csvImportOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSelfTestOpen: (selfTestOpen) => set({ selfTestOpen }),
  setReplyQuote: (replyQuote) => set({ replyQuote }),
  triggerCelebration: (text) => {
    set({ celebratingText: text });
    window.setTimeout(() => {
      set((curr) => (curr.celebratingText === text ? { celebratingText: null } : curr));
    }, 2400);
  },
}));
