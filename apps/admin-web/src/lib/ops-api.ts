import type {
  AiExtractMode,
  CmsFingerprint,
  CreateCollegeInput,
  CreateLlmKeyInput,
  CrawlCollegeInput,
  FacultyStrategy,
  HealthStatus,
  NoticeStrategy,
  OnboardUniversityInput,
  OpsRuleConfig,
  PortalBucket,
  ProbeUniversityInput,
  RecruitmentStatus,
  ReviewNoticeInput,
  SandboxTestInput,
  SourceScope,
  UpdateCatalogAdvisorOpsInput,
  UpdateCollegeInput,
  UpdateGuardrailsInput,
  UpdateLlmKeyInput,
  UpdateScheduleInput,
  UpdateUniversityOpsInput,
} from "@app/shared";

async function opsFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data as T;
}

export interface OpsCollegeRow {
  id: string;
  universityId: string;
  name: string;
  disciplineCategory: string;
  collegeUrl: string;
  facultyListUrl: string;
  noticeListUrl: string;
  phdAdmissionUrl: string;
  cmsFingerprint: CmsFingerprint;
  facultyStrategy: FacultyStrategy;
  noticeStrategy: NoticeStrategy;
  facultyRuleJson: OpsRuleConfig | null;
  noticeRuleJson: OpsRuleConfig | null;
  healthStatus: HealthStatus;
  lastFacultyCrawlAt: string | null;
  lastNoticeCrawlAt: string | null;
  advisorCount: number;
  noticeCount: number;
}

export interface OpsUniversityRow {
  id: string;
  name: string;
  shortName: string;
  softScienceRank: number | null;
  rankTier: string;
  disciplineRankNote: string;
  facultyPortalUrl: string;
  admissionUrl: string;
  sourceScope: SourceScope;
  officialDomain: string;
  portalBucket: PortalBucket;
  healthStatus: HealthStatus;
  enabled: boolean;
  customTags: string[];
  lastProbedAt: string | null;
  advisorCount: number;
  noticeCount: number;
  colleges: OpsCollegeRow[];
}

export interface OpsRunRow {
  id: string;
  runKind: string;
  scope: string;
  aiMode: AiExtractMode;
  status: string;
  totalPages: number;
  hashSkipped: number;
  ruleParsed: number;
  aiCalls: number;
  noticesFound: number;
  errorCount: number;
  actualCostCny: number;
  summary: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface OpsOverviewResponse {
  ok: true;
  kpis: {
    top100Count: number;
    customManualCount: number;
    totalUniversities: number;
    totalColleges: number;
    totalAdvisors: number;
    phdOpenCount: number;
    confirmedOpenCount: number;
    ruleDirectRate: number;
    pendingAdvisors: number;
    pendingNotices: number;
    monthCostCny: number;
  };
  healthBreakdown: { healthy: number; unprobed: number; attention: number };
  guardrails: OpsGuardrailsRow | null;
  matrix: Array<{
    id: string;
    name: string;
    shortName: string;
    rank: number | null;
    sourceScope: SourceScope;
    portalBucket: PortalBucket;
    healthStatus: HealthStatus;
  }>;
  recentRuns: OpsRunRow[];
}

export interface OpsAdvisorRow {
  id: string;
  universityId: string;
  universityName: string;
  collegeId: string | null;
  name: string;
  dept: string;
  title: string;
  honorBadge: string;
  honorCategory: string;
  bio: string;
  researchTags: string[];
  email: string;
  homepageUrl: string;
  photoUrl: string;
  kpiOutputsHero: string;
  kpiQuotaHero: string;
  recruitOpen: boolean;
  isPhdSupervisor: boolean;
  recruitmentStatus: RecruitmentStatus;
  recruitmentSignalNote: string;
  qualityScore: number;
  reviewStatus: string;
  reviewReasons: string[];
  manualLockedFields: string[];
  updatedAt: string;
}

export interface OpsNoticeRow {
  id: string;
  universityId: string;
  universityName: string;
  sourceUrl: string;
  title: string;
  publishedAt: string;
  matchedKeywords: string[];
  summary: string;
  reviewStatus: string;
  crawledAt: string;
}

export interface OpsGuardrailsRow {
  id: string;
  defaultAiMode: AiExtractMode;
  monthlyBudgetCny: number;
  domainConcurrency: number;
  domainRps: number;
  circuitBreakerThreshold: number;
  circuitCooldownMin: number;
  avatarStorageMode: string;
  updatedAt: string;
}

export interface OpsLlmKeyRow {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  model: string;
  maskedKey: string;
  dailyBudgetCny: number;
  monthlyBudgetCny: number;
  usedTodayCny: number;
  usedMonthCny: number;
  rpmLimit: number;
  offPeakOnly: boolean;
  priority: number;
  enabled: boolean;
}

export interface OpsDictionaryRow {
  id: string;
  kind: string;
  name: string;
  entries: string[];
  updatedAt: string;
}

export interface OpsScheduleRow {
  id: string;
  pipelineKey: string;
  name: string;
  description: string;
  cronExpr: string;
  seasonMode: "peak" | "off_peak";
  offPeakLlmOnly: boolean;
  aiMode: AiExtractMode;
  enabled: boolean;
  lastRunAt: string | null;
}

export const opsApi = {
  me: () =>
    opsFetch<{
      ok: true;
      authenticated: boolean;
      tokenSource: "env" | "dev-file";
      devTokenHint?: string;
    }>("/api/ops/auth/me"),

  login: (token: string) =>
    opsFetch<{ ok: true; authenticated: boolean }>("/api/ops/auth/login", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  logout: () =>
    opsFetch<{ ok: true }>("/api/ops/auth/logout", { method: "POST" }),

  getOverview: () => opsFetch<OpsOverviewResponse>("/api/ops/overview"),

  getUniversities: (params: { q?: string; sourceScope?: string; healthStatus?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.sourceScope && params.sourceScope !== "all") qs.set("sourceScope", params.sourceScope);
    if (params.healthStatus && params.healthStatus !== "all") qs.set("healthStatus", params.healthStatus);
    const qStr = qs.toString();
    return opsFetch<{ ok: true; items: OpsUniversityRow[]; total: number }>(
      `/api/ops/sources/universities${qStr ? `?${qStr}` : ""}`
    );
  },

  updateUniversity: (id: string, body: UpdateUniversityOpsInput) =>
    opsFetch<{ ok: true; university: OpsUniversityRow }>(`/api/ops/sources/universities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  syncSoftScience: (body: { year?: number; limit?: number } = {}) =>
    opsFetch<{
      ok: true;
      runId: string;
      fetchedCount: number;
      insertedCount: number;
      updatedCount: number;
    }>("/api/ops/sources/sync-softscience", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  probeUniversityPreview: (body: ProbeUniversityInput) =>
    opsFetch<{ ok: true; probe: any }>("/api/ops/sources/probe-university", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  probeExistingUniversity: (id: string, officialDomain?: string) =>
    opsFetch<{ ok: true; university: OpsUniversityRow; probe: any }>(
      `/api/ops/sources/universities/${id}/probe`,
      {
        method: "POST",
        body: JSON.stringify({ officialDomain }),
      }
    ),

  onboardUniversity: (body: OnboardUniversityInput) =>
    opsFetch<{ ok: true; university: OpsUniversityRow; colleges: OpsCollegeRow[] }>(
      "/api/ops/sources/onboard-university",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    ),

  createCollege: (body: CreateCollegeInput) =>
    opsFetch<{ ok: true; college: OpsCollegeRow }>("/api/ops/sources/colleges", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateCollege: (id: string, body: UpdateCollegeInput) =>
    opsFetch<{ ok: true; college: OpsCollegeRow }>(`/api/ops/sources/colleges/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  sandboxTestUrl: (body: SandboxTestInput) =>
    opsFetch<{ ok: true; diagnostics: any; result: any }>("/api/ops/sandbox/test-url", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  crawlCollege: (collegeId: string, body: Partial<CrawlCollegeInput> = {}) =>
    opsFetch<{
      ok: true;
      runId: string;
      advisorsUpserted: number;
      noticesUpserted: number;
      phdNoticesMatched: number;
      summary: string;
    }>(`/api/ops/crawl/college/${collegeId}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getRuns: () => opsFetch<{ ok: true; items: OpsRunRow[] }>("/api/ops/runs"),

  getRunLogs: (runId: string, errorCategory = "all") =>
    opsFetch<{ ok: true; items: Array<any> }>(
      `/api/ops/runs/${runId}/logs?errorCategory=${encodeURIComponent(errorCategory)}`
    ),

  getSchedules: () => opsFetch<{ ok: true; items: OpsScheduleRow[] }>("/api/ops/schedules"),

  updateSchedule: (id: string, body: UpdateScheduleInput) =>
    opsFetch<{ ok: true; schedule: OpsScheduleRow }>(`/api/ops/schedules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  switchSeason: (seasonMode: "peak" | "off_peak") =>
    opsFetch<{ ok: true; seasonMode: string; items: OpsScheduleRow[] }>(
      "/api/ops/schedules/season",
      {
        method: "POST",
        body: JSON.stringify({ seasonMode }),
      }
    ),

  getHitlAdvisors: (params: {
    reviewStatus?: string;
    recruitmentStatus?: string;
    q?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.reviewStatus && params.reviewStatus !== "all") qs.set("reviewStatus", params.reviewStatus);
    if (params.recruitmentStatus && params.recruitmentStatus !== "all")
      qs.set("recruitmentStatus", params.recruitmentStatus);
    if (params.q) qs.set("q", params.q);
    return opsFetch<{ ok: true; items: OpsAdvisorRow[] }>(
      `/api/ops/hitl/advisors${qs.toString() ? `?${qs}` : ""}`
    );
  },

  updateHitlAdvisor: (id: string, body: UpdateCatalogAdvisorOpsInput) =>
    opsFetch<{ ok: true; advisor: OpsAdvisorRow }>(`/api/ops/hitl/advisors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getHitlNotices: (reviewStatus = "all") =>
    opsFetch<{ ok: true; items: OpsNoticeRow[] }>(
      `/api/ops/hitl/notices?reviewStatus=${encodeURIComponent(reviewStatus)}`
    ),

  reviewNotice: (id: string, body: ReviewNoticeInput) =>
    opsFetch<{ ok: true; notice: OpsNoticeRow }>(`/api/ops/hitl/notices/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getGuardrails: () =>
    opsFetch<{ ok: true; guardrails: OpsGuardrailsRow | null }>("/api/ops/guardrails"),

  updateGuardrails: (body: UpdateGuardrailsInput) =>
    opsFetch<{ ok: true; guardrails: OpsGuardrailsRow }>("/api/ops/guardrails", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  getLlmKeys: () => opsFetch<{ ok: true; items: OpsLlmKeyRow[] }>("/api/ops/llm-keys"),

  createLlmKey: (body: CreateLlmKeyInput) =>
    opsFetch<{ ok: true; item: OpsLlmKeyRow }>("/api/ops/llm-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateLlmKey: (id: string, body: UpdateLlmKeyInput) =>
    opsFetch<{ ok: true; item: OpsLlmKeyRow }>(`/api/ops/llm-keys/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteLlmKey: (id: string) =>
    opsFetch<{ ok: true }>(`/api/ops/llm-keys/${id}`, { method: "DELETE" }),

  getDictionaries: () =>
    opsFetch<{ ok: true; items: OpsDictionaryRow[] }>("/api/ops/dictionaries"),

  updateDictionary: (kind: string, entries: string[]) =>
    opsFetch<{ ok: true; item: OpsDictionaryRow }>(`/api/ops/dictionaries/${kind}`, {
      method: "PUT",
      body: JSON.stringify({ entries }),
    }),
};
