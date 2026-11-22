import type {
  Advisor,
  AdvisorStage,
  AiActionMode,
  AiChatMessageRecord,
  AiExtractProfessorItem,
  AiInsights,
  ApplicantProfile,
  BootstrapData,
  DiscoverMailAccountResult,
  DispatchJob,
  DispatchPlan,
  DraftRevision,
  Institution,
  MailAccountPublic,
  MailAccountTestResult,
  MailMessage,
  MatchTier,
  OutreachDraft,
  PolicyConfig,
  PromptRevision,
  PromptTemplate,
  ResumeItem,
  UiPreferences,
  UnreadReplyItem,
  UpdatePromptInput,
} from "@app/shared";

const ADMIN_TOKEN_STORAGE_KEY = "phd_studio_admin_token";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = (await res.json().catch(() => null)) as
    | ({ ok?: boolean; error?: string } & T)
    | null;

  if (!res.ok || (payload && payload.ok === false)) {
    throw new ApiError(
      payload?.error || `请求失败 (${res.status})`,
      res.status
    );
  }
  if (!payload) {
    throw new ApiError(`服务端未返回有效的 JSON (${res.status})`, res.status);
  }
  return payload;
}

export function getStoredAdminToken(): string {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setStoredAdminToken(token: string): void {
  try {
    if (token.trim()) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token.trim());
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // 隐私模式可能禁用 sessionStorage，忽略持久化错误
  }
}

async function adminRequestJson<T>(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<T> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new ApiError("请先输入管理员身份令牌", 401);
  }
  return requestJson<T>(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      "X-Admin-Token": cleanToken,
    },
  });
}

/**
 * worker-api（本地 SQLite / SMTP / IMAP / 调度队列）客户端
 */
export const workerApi = {
  bootstrap: async (): Promise<BootstrapData> => {
    const res = await requestJson<{ ok: true; data: BootstrapData }>("/api/bootstrap");
    return res.data;
  },

  updateProfile: (profile: ApplicantProfile) =>
    requestJson<{ ok: true; profile: ApplicantProfile }>("/api/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),

  createInstitution: (input: {
    name: string;
    shortName?: string;
    department?: string;
    facultyListUrl?: string;
    admissionUrl?: string;
    deadlineAt?: string | null;
  }) =>
    requestJson<{ ok: true; institution: Institution }>("/api/institutions", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createAdvisor: (input: {
    institutionId?: string;
    institutionName?: string;
    name: string;
    dept?: string;
    title?: string;
    email?: string;
    homepageUrl?: string;
    scholarUrl?: string;
    researchTags?: string[];
    researchSummary?: string;
    matchTier?: MatchTier;
    stage?: AdvisorStage;
    inBatch?: boolean;
    hookNote?: string;
    userNotes?: string;
  }) =>
    requestJson<{ ok: true; advisor: Advisor }>("/api/advisors", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  batchImportAdvisors: (input: {
    institutionName: string;
    advisors: Array<{
      name: string;
      dept: string;
      title: string;
      tags: string[];
      research: string;
      email: string;
      homepageUrl: string;
      matchTier: MatchTier;
      note: string;
      hookNote?: string;
    }>;
  }) =>
    requestJson<{ ok: true; added: number; skipped: number }>(
      "/api/advisors/batch-import",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),

  updateAdvisor: (
    id: string,
    patch: Partial<{
      institutionId: string;
      institutionName: string;
      name: string;
      dept: string;
      title: string;
      email: string;
      homepageUrl: string;
      scholarUrl: string;
      researchTags: string[];
      researchSummary: string;
      matchTier: MatchTier;
      matchScore: number | null;
      stage: AdvisorStage;
      inBatch: boolean;
      assignedAccountId: string;
      hookNote: string;
      userNotes: string;
      replyNote: string;
    }>
  ) =>
    requestJson<{ ok: true; advisor: Advisor }>(`/api/advisors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteAdvisor: (id: string) =>
    requestJson<{ ok: true }>(`/api/advisors/${id}`, {
      method: "DELETE",
    }),

  getDraft: (advisorId: string) =>
    requestJson<{ ok: true; draft: OutreachDraft; revisions: DraftRevision[] }>(
      `/api/advisors/${advisorId}/draft`
    ),

  saveDraft: (
    advisorId: string,
    input: {
      subject: string;
      body: string;
      selectedHook?: string;
      resumeId?: string | null;
      preferredAccountId?: string;
      createRevision?: boolean;
      revisionSource?: "manual" | "template" | "ai" | "restore";
      revisionNote?: string;
    }
  ) =>
    requestJson<{ ok: true; draft: OutreachDraft; revisions: DraftRevision[] }>(
      `/api/advisors/${advisorId}/draft`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    ),

  generateTemplateDraft: (advisorId: string, hookNote?: string) =>
    requestJson<{ ok: true; subject: string; body: string }>(
      `/api/advisors/${advisorId}/draft/generate`,
      {
        method: "POST",
        body: JSON.stringify({ hookNote }),
      }
    ),

  restoreDraftRevision: (advisorId: string, revId: string) =>
    requestJson<{ ok: true; draft: OutreachDraft; revisions: DraftRevision[] }>(
      `/api/advisors/${advisorId}/draft/revisions/${revId}/restore`,
      {
        method: "POST",
      }
    ),

  uploadResume: (input: {
    filename: string;
    contentBase64: string;
    setAsDefault?: boolean;
    advisorId?: string;
  }) =>
    requestJson<{ ok: true; resume: ResumeItem }>("/api/resumes", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  setDefaultResume: (resumeId: string) =>
    requestJson<{ ok: true; resume: ResumeItem }>(
      `/api/resumes/${resumeId}/default`,
      { method: "PATCH" }
    ),

  deleteResume: (resumeId: string) =>
    requestJson<{ ok: true }>(`/api/resumes/${resumeId}`, {
      method: "DELETE",
    }),

  discoverMailAccount: (email: string) =>
    requestJson<{ ok: true; discovery: DiscoverMailAccountResult }>(
      "/api/mail-accounts/discover",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      }
    ),

  createMailAccount: (input: Record<string, unknown>) =>
    requestJson<{ ok: true; account: MailAccountPublic }>("/api/mail-accounts", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateMailAccount: (id: string, input: Record<string, unknown>) =>
    requestJson<{ ok: true; account: MailAccountPublic }>(
      `/api/mail-accounts/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      }
    ),

  deleteMailAccount: (id: string) =>
    requestJson<{ ok: true }>(`/api/mail-accounts/${id}`, {
      method: "DELETE",
    }),

  testMailAccount: (input: Record<string, unknown>) =>
    requestJson<{
      ok: true;
      result: MailAccountTestResult;
      autoSaved: boolean;
      account: MailAccountPublic | null;
    }>("/api/mail-accounts/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getMailThread: (advisorId: string, markRead = false) =>
    requestJson<{
      ok: true;
      messages: MailMessage[];
      unreadReplies: UnreadReplyItem[];
      replyCounts: Record<string, number>;
    }>(`/api/mail/threads/${advisorId}${markRead ? "?mark_read=1" : ""}`),

  sendSingleMail: (input: {
    advisorId?: string;
    toEmail: string;
    subject: string;
    body: string;
    accountId: string;
    inReplyTo?: string;
    references?: string;
    includeAttachment: boolean;
    resumeId?: string | null;
    customAttachmentName?: string;
    customAttachmentBase64?: string;
    autoAddContact?: boolean;
    contactName?: string;
    institutionName?: string;
  }) =>
    requestJson<{ ok: true; advisorId: string | null; messageId: string }>(
      "/api/mail/send-single",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),

  saveMailDraftBox: (input: {
    toEmail: string;
    subject: string;
    body: string;
    accountId: string;
    resumeId?: string | null;
  }) =>
    requestJson<{ ok: true; accountLabel?: string }>("/api/mail/save-draft", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  testSelfMail: (input: {
    testTo: string;
    accountId: string;
    subject: string;
    body: string;
    resumeId?: string | null;
  }) =>
    requestJson<{ ok: true; messageId?: string }>("/api/mail/test-self", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  syncReplies: () =>
    requestJson<{
      ok: true;
      busy?: boolean;
      skipped?: boolean;
      reason?: string;
      newReplies: UnreadReplyItem[];
      errors: string[];
      unreadReplies: UnreadReplyItem[];
      replyCounts: Record<string, number>;
    }>("/api/mail/sync-replies", { method: "POST" }),

  markRepliesRead: (input: { advisorId?: string; all?: boolean }) =>
    requestJson<{
      ok: true;
      unreadReplies: UnreadReplyItem[];
      replyCounts: Record<string, number>;
    }>("/api/mail/mark-read", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  buildDispatchPlan: (input: {
    mode: "send" | "draft";
    advisorIds?: string[];
    ignoreQuota: boolean;
    scheduledStartAt?: string;
  }) =>
    requestJson<{ ok: true; plan: DispatchPlan }>("/api/dispatch/plan", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  startDispatch: (input: {
    mode: "send" | "draft";
    advisorIds?: string[];
    ignoreQuota: boolean;
    scheduledStartAt?: string;
  }) =>
    requestJson<{ ok: true; job: DispatchJob }>("/api/dispatch/start", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  stopDispatch: () =>
    requestJson<{ ok: true }>("/api/dispatch/stop", { method: "POST" }),

  getDispatchStatus: () =>
    requestJson<{
      ok: true;
      job: DispatchJob | null;
      quotaToday: Record<string, number>;
    }>("/api/dispatch/status"),

  resetTodayQuota: () =>
    requestJson<{ ok: true; quotaToday: Record<string, number> }>(
      "/api/dispatch/quota/reset",
      { method: "POST" }
    ),

  updateSettings: (input: {
    policy?: PolicyConfig;
    aiConfig?: {
      provider: string;
      baseUrl: string;
      model: string;
      apiKey?: string;
      apiKeyDirty: boolean;
      clearApiKey: boolean;
    };
    preferences?: Partial<UiPreferences>;
  }) =>
    requestJson<{ ok: true }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  importCsv: (input: { csvText: string; defaultInstitution?: string }) =>
    requestJson<{ ok: true; added: number; skipped: number }>(
      "/api/data/import/csv",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),
};

/**
 * cloud-core（AI Copilot、师资提取、匹配分析）客户端
 */
export const cloudApi = {
  testAi: (input: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    apiKeyDirty?: boolean;
  }) =>
    requestJson<{ ok: true; latencyMs: number; model: string; message: string }>(
      "/api/cloud/ai/test",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    ),

  getConversations: (advisorId: string) =>
    requestJson<{ ok: true; messages: AiChatMessageRecord[] }>(
      `/api/cloud/ai/conversations/${advisorId}`
    ),

  clearConversations: (advisorId: string) =>
    requestJson<{ ok: true }>(`/api/cloud/ai/conversations/${advisorId}`, {
      method: "DELETE",
    }),

  chat: (input: {
    advisorId: string;
    actionMode: AiActionMode;
    userMessage: string;
    currentSubject: string;
    currentBody: string;
    currentHook: string;
    latestReply: string;
  }) =>
    requestJson<{
      ok: true;
      userMessage: AiChatMessageRecord;
      assistantMessage: AiChatMessageRecord;
    }>("/api/cloud/ai/chat", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  analyzeAdvisor: (advisorId: string) =>
    requestJson<{
      ok: true;
      matchTier: MatchTier;
      matchScore: number;
      aiInsights: AiInsights;
      model: string;
    }>("/api/cloud/ai/analyze-advisor", {
      method: "POST",
      body: JSON.stringify({ advisorId }),
    }),

  extractAdvisors: (input: {
    institutionName: string;
    rawText: string;
    pageUrl: string;
  }) =>
    requestJson<{
      ok: true;
      professors: AiExtractProfessorItem[];
      model: string;
    }>("/api/cloud/ai/extract-advisors", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

/**
 * 管理员专属 Prompt 管理客户端（需携带 X-Admin-Token）
 */
export const adminPromptApi = {
  verify: (token: string) =>
    adminRequestJson<{ ok: true; verified: boolean; mode: "env" | "dev-file" }>(
      "/api/cloud/admin/prompts/verify",
      token,
      { method: "POST" }
    ),

  list: (token: string) =>
    adminRequestJson<{ ok: true; prompts: PromptTemplate[] }>(
      "/api/cloud/admin/prompts",
      token
    ),

  detail: (token: string, key: string) =>
    adminRequestJson<{
      ok: true;
      prompt: PromptTemplate;
      revisions: PromptRevision[];
      defaultContentAvailable: boolean;
    }>(`/api/cloud/admin/prompts/${encodeURIComponent(key)}`, token),

  update: (token: string, key: string, input: UpdatePromptInput) =>
    adminRequestJson<{
      ok: true;
      prompt: PromptTemplate;
      revisions: PromptRevision[];
    }>(`/api/cloud/admin/prompts/${encodeURIComponent(key)}`, token, {
      method: "PUT",
      body: JSON.stringify(input),
    }),

  rollback: (token: string, key: string, version: number) =>
    adminRequestJson<{
      ok: true;
      prompt: PromptTemplate;
      revisions: PromptRevision[];
      restoredFromVersion: number;
    }>(
      `/api/cloud/admin/prompts/${encodeURIComponent(key)}/rollback`,
      token,
      {
        method: "POST",
        body: JSON.stringify({ version }),
      }
    ),

  resetDefault: (token: string, key: string) =>
    adminRequestJson<{
      ok: true;
      prompt: PromptTemplate;
      revisions: PromptRevision[];
    }>(`/api/cloud/admin/prompts/${encodeURIComponent(key)}/reset`, token, {
      method: "POST",
    }),
};
