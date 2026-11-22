import { create } from "zustand";

export type ActiveTab = "discover" | "mine" | "write" | "inbox" | "profile" | "settings";
export type ThemeKey = "coral" | "jade" | "iris" | "sky";
export type SettingsSectionKey = "appearance" | "mailbox" | "ai" | "data";

export interface PhotoModalData {
  name: string;
  school: string;
  dept: string;
  title: string;
  homepageUrl: string;
  photoUrl: string;
  photoSource: string;
  catalogId?: string;
  advisorId?: string;
}

const THEME_STORAGE_KEY = "phdcue_theme";

function loadInitialTheme(): ThemeKey {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "coral" || raw === "jade" || raw === "iris" || raw === "sky") {
      document.documentElement.dataset.theme = raw;
      return raw;
    }
  } catch {
    // 忽略本地存储不可用场景
  }
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = "coral";
  }
  return "coral";
}

interface AppUiState {
  activeTab: ActiveTab;
  theme: ThemeKey;
  settingsSection: SettingsSectionKey;
  selectedAdvisorId: string | null;
  activeSessionId: string | null;
  batchSelectedIds: string[];

  // 全局弹窗显隐控制
  dispatchOpen: boolean;
  adminPromptOpen: boolean;
  aiImportOpen: boolean;
  quickAddOpen: boolean;
  quickComposeOpen: boolean;
  replyAlertOpen: boolean;
  csvImportOpen: boolean;
  commandOpen: boolean;
  selfTestOpen: boolean;
  contactCardOpen: boolean;
  photoModalData: PhotoModalData | null;

  // 单封回复引用上下文（用于从“往来动态”一键回复）
  replyQuote: {
    inReplyTo: string;
    references: string;
    subjectHint: string;
  } | null;

  // 发信成功轻快庆贺提示
  celebratingText: string | null;

  // 导航与主题方法
  setActiveTab: (tab: ActiveTab) => void;
  setTheme: (theme: ThemeKey) => void;
  setSettingsSection: (section: SettingsSectionKey) => void;
  setSelectedAdvisorId: (id: string | null) => void;
  setActiveSessionId: (id: string | null) => void;
  openWriterFor: (advisorId: string) => void;
  openInboxFor: (advisorId: string) => void;

  // 兼容旧调用签名，避免共享弹窗级联报错
  setViewMode: (mode: "workspace" | "table") => void;
  setRightTab: (tab: "copilot" | "profile" | "thread") => void;
  openSettings: (tab?: "profile" | SettingsSectionKey) => void;

  // 批量选择控制
  toggleBatchSelected: (advisorId: string) => void;
  setBatchSelectedIds: (ids: string[]) => void;
  clearBatchSelected: () => void;

  // 弹窗状态 setter
  setDispatchOpen: (open: boolean) => void;
  setAdminPromptOpen: (open: boolean) => void;
  setAiImportOpen: (open: boolean) => void;
  setQuickAddOpen: (open: boolean) => void;
  setQuickComposeOpen: (open: boolean) => void;
  setReplyAlertOpen: (open: boolean) => void;
  setCsvImportOpen: (open: boolean) => void;
  setCommandOpen: (open: boolean) => void;
  setSelfTestOpen: (open: boolean) => void;
  setContactCardOpen: (open: boolean) => void;
  setPhotoModalData: (data: PhotoModalData | null) => void;
  setReplyQuote: (quote: AppUiState["replyQuote"]) => void;
  triggerCelebration: (text: string) => void;
}

/**
 * PhD Cue V3.2 全局轻量 UI 状态仓库（服务端业务实体统一由 TanStack Query 管理）。
 */
export const useAppStore = create<AppUiState>((set) => ({
  activeTab: "discover",
  theme: loadInitialTheme(),
  settingsSection: "appearance",
  selectedAdvisorId: null,
  activeSessionId: null,
  batchSelectedIds: [],

  dispatchOpen: false,
  adminPromptOpen: false,
  aiImportOpen: false,
  quickAddOpen: false,
  quickComposeOpen: false,
  replyAlertOpen: false,
  csvImportOpen: false,
  commandOpen: false,
  selfTestOpen: false,
  contactCardOpen: false,
  photoModalData: null,

  replyQuote: null,
  celebratingText: null,

  setActiveTab: (activeTab) => set({ activeTab }),
  setTheme: (theme) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // 忽略存储错误
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
    }
    set({ theme });
  },
  setSettingsSection: (settingsSection) =>
    set({ activeTab: "settings", settingsSection }),
  setSelectedAdvisorId: (selectedAdvisorId) =>
    set({ selectedAdvisorId, activeSessionId: null, replyQuote: null }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),

  openWriterFor: (advisorId) =>
    set({
      selectedAdvisorId: advisorId,
      activeSessionId: null,
      replyQuote: null,
      activeTab: "write",
    }),
  openInboxFor: (advisorId) =>
    set({
      selectedAdvisorId: advisorId,
      activeTab: "inbox",
    }),

  setViewMode: (mode) =>
    set({ activeTab: mode === "workspace" ? "write" : "mine" }),
  setRightTab: (tab) => {
    if (tab === "thread") set({ activeTab: "inbox" });
    else if (tab === "profile") set({ activeTab: "mine" });
    else set({ activeTab: "write" });
  },
  openSettings: (tab = "appearance") => {
    if (tab === "profile") {
      set({ activeTab: "profile" });
      return;
    }
    set({ activeTab: "settings", settingsSection: tab });
  },

  toggleBatchSelected: (advisorId) =>
    set((s) => ({
      batchSelectedIds: s.batchSelectedIds.includes(advisorId)
        ? s.batchSelectedIds.filter((id) => id !== advisorId)
        : [...s.batchSelectedIds, advisorId],
    })),
  setBatchSelectedIds: (batchSelectedIds) => set({ batchSelectedIds }),
  clearBatchSelected: () => set({ batchSelectedIds: [] }),

  setDispatchOpen: (dispatchOpen) => set({ dispatchOpen }),
  setAdminPromptOpen: (adminPromptOpen) => set({ adminPromptOpen }),
  setAiImportOpen: (aiImportOpen) => set({ aiImportOpen }),
  setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
  setQuickComposeOpen: (quickComposeOpen) => set({ quickComposeOpen }),
  setReplyAlertOpen: (replyAlertOpen) => set({ replyAlertOpen }),
  setCsvImportOpen: (csvImportOpen) => set({ csvImportOpen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setSelfTestOpen: (selfTestOpen) => set({ selfTestOpen }),
  setContactCardOpen: (contactCardOpen) => set({ contactCardOpen }),
  setPhotoModalData: (photoModalData) => set({ photoModalData }),
  setReplyQuote: (replyQuote) => set({ replyQuote }),
  triggerCelebration: (text) => {
    set({ celebratingText: text });
    window.setTimeout(() => {
      set((curr) => (curr.celebratingText === text ? { celebratingText: null } : curr));
    }, 2400);
  },
}));
