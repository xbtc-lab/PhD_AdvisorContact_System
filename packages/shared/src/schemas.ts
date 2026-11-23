import { z } from "zod";

export const MatchTierSchema = z.enum(["perfect", "high", "try", "unknown"]);
export const AdvisorStageSchema = z.enum([
  "drafting",
  "ready",
  "sent",
  "replied",
  "interviewing",
  "paused",
]);
export const ReplyIntentSchema = z.enum([
  "positive_interview",
  "welcome_apply",
  "need_materials",
  "no_quota",
  "other",
]);

export const PublicationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  venue: z.string().default(""),
  year: z.string().default(""),
  authorOrder: z.string().default(""),
  status: z.string().default("已发表"),
  // V3.2 扩展：支持标注论文/专利类别、一句话贡献摘要，以及是否重点注入 AI 写信上下文
  injectToAi: z.boolean().optional(),
  summary: z.string().optional(),
  kind: z.enum(["paper", "patent"]).optional(),
});
export type PublicationItem = z.infer<typeof PublicationItemSchema>;

export const ProjectItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().default(""),
  period: z.string().default(""),
  summary: z.string().default(""),
});
export type ProjectItem = z.infer<typeof ProjectItemSchema>;

// V3.2 新增：教育经历 / 学科竞赛 / 荣誉奖项结构化档案
export const EducationItemSchema = z.object({
  id: z.string(),
  school: z.string().default(""),
  degree: z.string().default(""),
  major: z.string().default(""),
  period: z.string().default(""),
  gpa: z.string().default(""),
  rankNote: z.string().default(""),
  isPrimary: z.boolean().default(false),
});
export type EducationItem = z.infer<typeof EducationItemSchema>;

export const CompetitionItemSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  award: z.string().default(""),
  year: z.string().default(""),
  role: z.string().default(""),
  note: z.string().default(""),
});
export type CompetitionItem = z.infer<typeof CompetitionItemSchema>;

export const HonorItemSchema = z.object({
  id: z.string(),
  title: z.string().default(""),
  issuer: z.string().default(""),
  year: z.string().default(""),
  level: z.string().default(""),
});
export type HonorItem = z.infer<typeof HonorItemSchema>;

export const AttachmentCategorySchema = z.enum([
  "resume",
  "transcript_master",
  "transcript_bachelor",
  "wechat_qr",
  "certificate",
]);
export type AttachmentCategory = z.infer<typeof AttachmentCategorySchema>;

export const ApplicantProfileSchema = z.object({
  name: z.string().default(""),
  affiliation: z.string().default(""),
  degreeInfo: z.string().default(""),
  researchSummary: z.string().default(""),
  phone: z.string().default(""),
  wechat: z.string().default(""),
  homepageUrl: z.string().default(""),
  publications: z.array(PublicationItemSchema).default([]),
  projects: z.array(ProjectItemSchema).default([]),
  methodsSkills: z.array(z.string()).default([]),
  targetDirections: z.array(z.string()).default([]),
  cvParsedText: z.string().default(""),
  // V3.2 履历扩充字段
  educationHistory: z.array(EducationItemSchema).default([]),
  languageScores: z.string().default(""),
  competitions: z.array(CompetitionItemSchema).default([]),
  honors: z.array(HonorItemSchema).default([]),
  wechatQrPath: z.string().default(""),
});
export type ApplicantProfile = z.infer<typeof ApplicantProfileSchema>;

export const InstitutionSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().default(""),
  department: z.string().default(""),
  facultyListUrl: z.string().default(""),
  admissionUrl: z.string().default(""),
  deadlineAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Institution = z.infer<typeof InstitutionSchema>;

export const CreateInstitutionInputSchema = z.object({
  name: z.string().trim().min(1, "请填写高校名称"),
  shortName: z.string().trim().optional(),
  department: z.string().trim().optional(),
  facultyListUrl: z.string().trim().optional(),
  admissionUrl: z.string().trim().optional(),
  deadlineAt: z.string().nullable().optional(),
});

export const RepresentativeWorkSchema = z.object({
  title: z.string(),
  venue: z.string().optional(),
  year: z.string().optional(),
  url: z.string().optional(),
});

export const RecruitmentSignalSchema = z.object({
  status: z.string().optional(),
  year: z.string().optional(),
  sourceUrl: z.string().optional(),
  note: z.string().optional(),
});

export const AiInsightsSchema = z.object({
  summary: z.string().default(""),
  directionFit: z.string().default(""),
  methodFit: z.string().default(""),
  recommendedHooks: z.array(z.string()).default([]),
  riskFlags: z.array(z.string()).default([]),
  updatedAt: z.string().default(""),
});
export type AiInsights = z.infer<typeof AiInsightsSchema>;

export const AdvisorSchema = z.object({
  id: z.string(),
  institutionId: z.string(),
  institutionName: z.string(),
  name: z.string(),
  dept: z.string().default(""),
  title: z.string().default(""),
  email: z.string().default(""),
  homepageUrl: z.string().default(""),
  scholarUrl: z.string().default(""),
  avatarSeed: z.string(),
  researchTags: z.array(z.string()).default([]),
  researchSummary: z.string().default(""),
  representativeWorks: z.array(RepresentativeWorkSchema).default([]),
  recruitmentSignal: RecruitmentSignalSchema.nullable().default(null),
  matchTier: MatchTierSchema.default("high"),
  matchScore: z.number().int().min(0).max(100).nullable().default(null),
  stage: AdvisorStageSchema.default("drafting"),
  inBatch: z.boolean().default(true),
  assignedAccountId: z.string().default("auto"),
  hookNote: z.string().default(""),
  userNotes: z.string().default(""),
  replyNote: z.string().default(""),
  aiInsights: AiInsightsSchema.nullable().default(null),
  lastSentAt: z.string().nullable().default(null),
  // V3.2 导师档案扩充字段（关联公共导师库、荣誉帽檐、真实照片缓存、跟进摘要）
  catalogAdvisorId: z.string().nullable().optional(),
  honorBadge: z.string().optional(),
  photoUrl: z.string().optional(),
  photoSource: z.string().optional(),
  trackSummary: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Advisor = z.infer<typeof AdvisorSchema>;

export const CreateAdvisorInputSchema = z.object({
  institutionId: z.string().optional(),
  institutionName: z.string().trim().optional(),
  name: z.string().trim().min(1, "请填写导师姓名"),
  dept: z.string().trim().default(""),
  title: z.string().trim().default(""),
  email: z.string().trim().default(""),
  homepageUrl: z.string().trim().default(""),
  scholarUrl: z.string().trim().default(""),
  researchTags: z.array(z.string()).default([]),
  researchSummary: z.string().trim().default(""),
  matchTier: MatchTierSchema.default("high"),
  stage: AdvisorStageSchema.default("drafting"),
  inBatch: z.boolean().default(true),
  hookNote: z.string().trim().default(""),
  userNotes: z.string().trim().default(""),
});

export const UpdateAdvisorInputSchema = z.object({
  institutionId: z.string().optional(),
  institutionName: z.string().trim().optional(),
  name: z.string().trim().min(1).optional(),
  dept: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  homepageUrl: z.string().optional(),
  scholarUrl: z.string().optional(),
  researchTags: z.array(z.string()).optional(),
  researchSummary: z.string().optional(),
  matchTier: MatchTierSchema.optional(),
  matchScore: z.number().int().min(0).max(100).nullable().optional(),
  stage: AdvisorStageSchema.optional(),
  inBatch: z.boolean().optional(),
  assignedAccountId: z.string().optional(),
  hookNote: z.string().optional(),
  userNotes: z.string().optional(),
  replyNote: z.string().optional(),
});

export const BatchImportAdvisorItemSchema = z.object({
  name: z.string().trim().min(1),
  dept: z.string().default(""),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  research: z.string().default(""),
  email: z.string().default(""),
  homepageUrl: z.string().default(""),
  matchTier: MatchTierSchema.default("high"),
  note: z.string().default(""),
  hookNote: z.string().default(""),
});

export const BatchImportAdvisorsInputSchema = z.object({
  institutionName: z.string().trim().min(1, "请填写高校名称"),
  advisors: z.array(BatchImportAdvisorItemSchema).min(1, "请至少选择一条导师记录"),
});

export const ResumeSchema = z.object({
  id: z.string(),
  filename: z.string(),
  sizeBytes: z.number().int(),
  sizeMb: z.number(),
  sha256: z.string(),
  parsedText: z.string().default(""),
  isDefault: z.boolean(),
  // V3.2 附件分类与备注（区分主简历/成绩单/微信二维码/获奖证明）
  category: AttachmentCategorySchema.optional(),
  tagNote: z.string().optional(),
  createdAt: z.string(),
});
export type ResumeItem = z.infer<typeof ResumeSchema>;

export const DraftSchema = z.object({
  id: z.string(),
  advisorId: z.string(),
  subject: z.string(),
  body: z.string(),
  selectedHook: z.string().default(""),
  resumeId: z.string().nullable().default(null),
  preferredAccountId: z.string().default("auto"),
  // V3.2 HTML 学术版式与互动联系卡开关
  templateStyle: z.enum(["editorial", "classic"]).optional(),
  embedContactCard: z.boolean().optional(),
  updatedAt: z.string(),
});
export type OutreachDraft = z.infer<typeof DraftSchema>;

export const DraftRevisionSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  subject: z.string(),
  body: z.string(),
  source: z.enum(["manual", "template", "ai", "restore"]),
  note: z.string().default(""),
  createdAt: z.string(),
});
export type DraftRevision = z.infer<typeof DraftRevisionSchema>;

export const SaveDraftInputSchema = z.object({
  subject: z.string().default(""),
  body: z.string().default(""),
  selectedHook: z.string().optional(),
  resumeId: z.string().nullable().optional(),
  preferredAccountId: z.string().optional(),
  templateStyle: z.enum(["editorial", "classic"]).optional(),
  embedContactCard: z.boolean().optional(),
  createRevision: z.boolean().default(false),
  revisionSource: z.enum(["manual", "template", "ai", "restore"]).default("manual"),
  revisionNote: z.string().default(""),
});

export const MailAccountTestResultSchema = z.object({
  smtpOk: z.boolean(),
  smtpMsg: z.string(),
  imapOk: z.boolean(),
  imapMsg: z.string(),
  testedAt: z.string(),
});
export type MailAccountTestResult = z.infer<typeof MailAccountTestResultSchema>;

export const MailAccountPublicSchema = z.object({
  id: z.string(),
  label: z.string(),
  email: z.string(),
  displayName: z.string(),
  providerType: z.enum(["imap_smtp", "ms_graph", "gmail_api"]),
  smtpHost: z.string(),
  smtpPort: z.number().int(),
  smtpSecurity: z.enum(["SSL", "STARTTLS", "NONE"]),
  imapHost: z.string(),
  imapPort: z.number().int(),
  draftsFolder: z.string(),
  hasCredential: z.boolean(),
  credentialLen: z.number().int(),
  dailyLimit: z.number().int(),
  enabled: z.boolean(),
  note: z.string(),
  lastTest: MailAccountTestResultSchema.nullable(),
  createdAt: z.string(),
});
export type MailAccountPublic = z.infer<typeof MailAccountPublicSchema>;

export const SaveMailAccountInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, "请填写发件箱名称"),
  email: z.string().trim().email("请填写有效的邮箱地址"),
  displayName: z.string().trim().default(""),
  providerType: z.enum(["imap_smtp", "ms_graph", "gmail_api"]).default("imap_smtp"),
  smtpHost: z.string().trim().default(""),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSecurity: z.enum(["SSL", "STARTTLS", "NONE"]).default("SSL"),
  imapHost: z.string().trim().default(""),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  draftsFolder: z.string().trim().default("Drafts"),
  credential: z.string().optional(),
  credentialDirty: z.boolean().default(false),
  dailyLimit: z.coerce.number().int().min(1).max(200).default(5),
  enabled: z.boolean().default(true),
  note: z.string().default(""),
});

export const TestMailAccountInputSchema = SaveMailAccountInputSchema.extend({
  autoSaveOnSuccess: z.boolean().default(true),
});

export const DiscoverMailAccountInputSchema = z.object({
  email: z.string().trim().email("请输入有效的邮箱地址"),
});

export const DiscoverMailAccountResultSchema = z.object({
  presetKey: z.string(),
  providerLabel: z.string(),
  mxHosts: z.array(z.string()),
  smtpHost: z.string(),
  smtpPort: z.number(),
  smtpSecurity: z.enum(["SSL", "STARTTLS", "NONE"]),
  imapHost: z.string(),
  imapPort: z.number(),
  draftsFolder: z.string(),
  authGuideUrl: z.string(),
  guideSteps: z.array(z.string()),
  note: z.string(),
  detectedVia: z.enum(["domain", "mx", "edu_heuristic", "fallback"]),
});
export type DiscoverMailAccountResult = z.infer<typeof DiscoverMailAccountResultSchema>;

export const MailMessageSchema = z.object({
  id: z.string(),
  advisorId: z.string().nullable(),
  mailAccountId: z.string().nullable(),
  direction: z.enum(["outbound", "inbound"]),
  fromName: z.string(),
  fromEmail: z.string(),
  toEmail: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.string()),
  messageId: z.string(),
  inReplyTo: z.string(),
  isUnread: z.boolean(),
  replyIntent: ReplyIntentSchema.nullable(),
  extractedTodos: z.array(z.string()),
  sentOrReceivedAt: z.string(),
});
export type MailMessage = z.infer<typeof MailMessageSchema>;

export const SendSingleMailInputSchema = z.object({
  advisorId: z.string().optional(),
  toEmail: z.string().trim().email("请填写有效的收件邮箱"),
  subject: z.string().trim().min(1, "请填写邮件主题"),
  body: z.string().trim().min(1, "邮件正文不能为空"),
  accountId: z.string().default("auto"),
  inReplyTo: z.string().default(""),
  references: z.string().default(""),
  includeAttachment: z.boolean().default(true),
  resumeId: z.string().nullable().optional(),
  customAttachmentName: z.string().optional(),
  customAttachmentBase64: z.string().optional(),
  autoAddContact: z.boolean().default(true),
  contactName: z.string().optional(),
  institutionName: z.string().optional(),
});

export const SaveSingleDraftInputSchema = z.object({
  toEmail: z.string().trim().email("请填写有效的收件邮箱"),
  subject: z.string().trim().min(1, "请填写邮件主题"),
  body: z.string().default(""),
  accountId: z.string().default("auto"),
  resumeId: z.string().nullable().optional(),
});

export const SelfTestMailInputSchema = z.object({
  testTo: z.string().trim().email("请填写有效的测试收件邮箱"),
  accountId: z.string().min(1, "请选择发件邮箱"),
  subject: z.string().default(""),
  body: z.string().default(""),
  resumeId: z.string().nullable().optional(),
});

export const PolicyConfigSchema = z.object({
  minDelaySec: z.coerce.number().int().min(5).max(3600).default(180),
  maxDelaySec: z.coerce.number().int().min(5).max(7200).default(420),
  avoidConsecutiveSameDomain: z.boolean().default(true),
  maxAttachmentMb: z.coerce.number().min(0.5).max(25).default(2.5),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export const AiConfigPublicSchema = z.object({
  provider: z.string().default("deepseek"),
  baseUrl: z.string().default("https://api.deepseek.com"),
  model: z.string().default("deepseek-chat"),
  hasApiKey: z.boolean().default(false),
  apiKeyLen: z.number().int().default(0),
});
export type AiConfigPublic = z.infer<typeof AiConfigPublicSchema>;

export const UiPreferencesSchema = z.object({
  avatarStyle: z.enum(["facehash", "initials"]).default("facehash"),
  defaultResumeId: z.string().nullable().default(null),
  quotaResetAfter: z.string().default(""),
});
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;

export const UpdateSettingsInputSchema = z.object({
  policy: PolicyConfigSchema.optional(),
  aiConfig: z
    .object({
      provider: z.string().default("deepseek"),
      baseUrl: z.string().trim().default("https://api.deepseek.com"),
      model: z.string().trim().default("deepseek-chat"),
      apiKey: z.string().optional(),
      apiKeyDirty: z.boolean().default(false),
      clearApiKey: z.boolean().default(false),
    })
    .optional(),
  preferences: UiPreferencesSchema.partial().optional(),
});

export const DispatchPlanItemSchema = z.object({
  advisorId: z.string(),
  advisorName: z.string(),
  institutionName: z.string(),
  dept: z.string(),
  matchTier: MatchTierSchema,
  toEmail: z.string(),
  domain: z.string(),
  subject: z.string(),
  resumeId: z.string().nullable(),
  resumeName: z.string(),
  resumeSizeMb: z.number(),
  accountId: z.string(),
  accountLabel: z.string(),
  fromEmail: z.string(),
  ready: z.boolean(),
  issues: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type DispatchPlanItem = z.infer<typeof DispatchPlanItemSchema>;

export const DispatchAccountSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  email: z.string(),
  enabled: z.boolean(),
  configured: z.boolean(),
  dailyLimit: z.number().int(),
  usedToday: z.number().int(),
  planned: z.number().int(),
  remainingAfter: z.number().int(),
});
export type DispatchAccountSummary = z.infer<typeof DispatchAccountSummarySchema>;

export const DispatchPlanSchema = z.object({
  mode: z.enum(["send", "draft"]),
  total: z.number().int(),
  readyCount: z.number().int(),
  blockedCount: z.number().int(),
  items: z.array(DispatchPlanItemSchema),
  accounts: z.array(DispatchAccountSummarySchema),
  ignoreQuota: z.boolean(),
  targetDate: z.string(),
  isFutureDate: z.boolean(),
});
export type DispatchPlan = z.infer<typeof DispatchPlanSchema>;

export const StartDispatchInputSchema = z.object({
  mode: z.enum(["send", "draft"]).default("send"),
  advisorIds: z.array(z.string()).optional(),
  ignoreQuota: z.boolean().default(false),
  scheduledStartAt: z.string().default(""),
});

export const DispatchJobItemStatusSchema = z.object({
  id: z.string(),
  advisorId: z.string(),
  advisorName: z.string(),
  institutionName: z.string(),
  toEmail: z.string(),
  subject: z.string(),
  accountId: z.string(),
  accountLabel: z.string(),
  status: z.enum(["pending", "processing", "ok", "error", "cancelled"]),
  message: z.string(),
  processedAt: z.string().nullable(),
});
export type DispatchJobItemStatus = z.infer<typeof DispatchJobItemStatusSchema>;

export const DispatchJobSchema = z.object({
  id: z.string(),
  mode: z.enum(["send", "draft"]),
  status: z.enum(["running", "waiting_schedule", "completed", "stopped"]),
  stopRequested: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  scheduledStartAt: z.string().nullable(),
  scheduleWaitSeconds: z.number().int(),
  waitingSeconds: z.number().int(),
  total: z.number().int(),
  completed: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
  currentItem: DispatchJobItemStatusSchema.nullable(),
  nextItem: DispatchJobItemStatusSchema.nullable(),
  items: z.array(DispatchJobItemStatusSchema),
  logs: z.array(z.string()),
});
export type DispatchJob = z.infer<typeof DispatchJobSchema>;

export const AiActionModeSchema = z.enum([
  "chat",
  "generate",
  "polish",
  "shorten",
  "translate_en",
  "hooks",
  "reply_followup",
]);
export type AiActionMode = z.infer<typeof AiActionModeSchema>;

export const AiChatRequestSchema = z.object({
  advisorId: z.string().min(1),
  sessionId: z.string().optional(),
  actionMode: AiActionModeSchema.default("chat"),
  userMessage: z.string().default(""),
  currentSubject: z.string().default(""),
  currentBody: z.string().default(""),
  currentHook: z.string().default(""),
  latestReply: z.string().default(""),
});

export const AiChatMessageRecordSchema = z.object({
  id: z.string(),
  advisorId: z.string(),
  sessionId: z.string().nullable().optional(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  suggestedSubject: z.string().default(""),
  suggestedBody: z.string().default(""),
  suggestedHook: z.string().default(""),
  model: z.string().default(""),
  createdAt: z.string(),
});
export type AiChatMessageRecord = z.infer<typeof AiChatMessageRecordSchema>;

export const AiSessionSchema = z.object({
  id: z.string(),
  advisorId: z.string(),
  title: z.string(),
  messageCount: z.number().int().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AiSession = z.infer<typeof AiSessionSchema>;

export const AiExtractRequestSchema = z.object({
  institutionName: z.string().trim().default(""),
  rawText: z.string().default(""),
  pageUrl: z.string().trim().default(""),
});

export const AiExtractProfessorItemSchema = z.object({
  name: z.string(),
  dept: z.string().default(""),
  title: z.string().default(""),
  tags: z.array(z.string()).default([]),
  research: z.string().default(""),
  email: z.string().default(""),
  homepageUrl: z.string().default(""),
  matchTier: MatchTierSchema.default("high"),
  note: z.string().default(""),
});
export type AiExtractProfessorItem = z.infer<typeof AiExtractProfessorItemSchema>;

export const UnreadReplyItemSchema = z.object({
  msgId: z.string(),
  advisorId: z.string(),
  advisorName: z.string(),
  institutionName: z.string(),
  fromEmail: z.string(),
  subject: z.string(),
  snippet: z.string(),
  timestamp: z.string(),
});
export type UnreadReplyItem = z.infer<typeof UnreadReplyItemSchema>;

// ============================================================
// V3.2 公共软科导师库与双轨邮件追踪类型
// ============================================================

export const RankTierSchema = z.enum(["top20", "double", "other"]);
export type RankTier = z.infer<typeof RankTierSchema>;

export const HonorCategorySchema = z.enum(["national", "provincial", "regular"]);
export type HonorCategory = z.infer<typeof HonorCategorySchema>;

export const SourceScopeSchema = z.enum(["top100", "custom_manual"]);
export type SourceScope = z.infer<typeof SourceScopeSchema>;

export const PortalBucketSchema = z.enum([
  "unified_api",
  "boda_cms",
  "chaoxing_cms",
  "decentralized",
  "custom",
]);
export type PortalBucket = z.infer<typeof PortalBucketSchema>;

export const HealthStatusSchema = z.enum(["unprobed", "healthy", "degraded", "broken"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const CmsFingerprintSchema = z.enum([
  "boda_vsb",
  "sudi_webplus",
  "unified_portal",
  "custom_static",
  "ruishu_waf",
  "unknown",
]);
export type CmsFingerprint = z.infer<typeof CmsFingerprintSchema>;

export const FacultyStrategySchema = z.enum(["adapter", "http", "playwright", "paused"]);
export type FacultyStrategy = z.infer<typeof FacultyStrategySchema>;

export const NoticeStrategySchema = z.enum([
  "date_anchor",
  "rss_feed",
  "css_rule",
  "playwright",
  "paused",
]);
export type NoticeStrategy = z.infer<typeof NoticeStrategySchema>;

export const RecruitmentStatusSchema = z.enum([
  "confirmed_open",
  "phd_default_open",
  "explicitly_closed",
  "unknown",
]);
export type RecruitmentStatus = z.infer<typeof RecruitmentStatusSchema>;

export const AiExtractModeSchema = z.enum(["rule_only", "manual", "auto_fallback"]);
export type AiExtractMode = z.infer<typeof AiExtractModeSchema>;

export const CatalogUniversitySchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string().default(""),
  softScienceRank: z.number().int().nullable().default(null),
  rankTier: RankTierSchema.default("other"),
  disciplineRankNote: z.string().default(""),
  facultyPortalUrl: z.string().default(""),
  admissionUrl: z.string().default(""),
  sourceScope: SourceScopeSchema.optional(),
  officialDomain: z.string().optional(),
  portalBucket: PortalBucketSchema.optional(),
  healthStatus: HealthStatusSchema.optional(),
  enabled: z.boolean().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CatalogUniversity = z.infer<typeof CatalogUniversitySchema>;

export const CatalogAdvisorSchema = z.object({
  id: z.string(),
  universityId: z.string(),
  universityName: z.string(),
  universityShortName: z.string().default(""),
  softScienceRank: z.number().int().nullable().default(null),
  rankTier: RankTierSchema.default("other"),
  disciplineRankNote: z.string().default(""),
  name: z.string(),
  dept: z.string().default(""),
  title: z.string().default(""),
  honorBadge: z.string().default(""),
  honorCategory: HonorCategorySchema.default("regular"),
  bio: z.string().default(""),
  researchTags: z.array(z.string()).default([]),
  email: z.string().default(""),
  homepageUrl: z.string().default(""),
  photoUrl: z.string().default(""),
  photoSource: z.string().default(""),
  kpiOutputsHero: z.string().default(""),
  kpiOutputsNote: z.string().default(""),
  kpiGrantsHero: z.string().default(""),
  kpiGrantsNote: z.string().default(""),
  kpiQuotaHero: z.string().default(""),
  kpiQuotaNote: z.string().default(""),
  recruitOpen: z.boolean().default(false),
  isPhdSupervisor: z.boolean().optional(),
  recruitmentStatus: RecruitmentStatusSchema.optional(),
  recruitmentSignalNote: z.string().optional(),
  footerNote: z.string().default(""),
  defaultFitScore: z.number().int().min(0).max(100).default(80),
  sourceUpdatedAt: z.string().default(""),
  crawledAt: z.string(),
  adoptedAdvisorId: z.string().nullable().default(null),
});
export type CatalogAdvisor = z.infer<typeof CatalogAdvisorSchema>;

export const TrackingLinkKindSchema = z.enum(["resume_pdf", "contact_card", "pixel"]);
export type TrackingLinkKind = z.infer<typeof TrackingLinkKindSchema>;

export const TrackingSummarySchema = z.object({
  advisorId: z.string(),
  resumeClicks: z.number().int().default(0),
  resumeReadSec: z.number().int().default(0),
  cardClicks: z.number().int().default(0),
  pixelOpens: z.number().int().default(0),
  suspectedBotOpens: z.number().int().default(0),
  lastActivityAt: z.string().nullable().default(null),
});
export type TrackingSummary = z.infer<typeof TrackingSummarySchema>;

export interface BootstrapData {
  profile: ApplicantProfile;
  institutions: Institution[];
  advisors: Advisor[];
  resumes: ResumeItem[];
  mailAccounts: MailAccountPublic[];
  policy: PolicyConfig;
  aiConfig: AiConfigPublic;
  preferences: UiPreferences;
  quotaToday: Record<string, number>;
  unreadReplies: UnreadReplyItem[];
  replyCounts: Record<string, number>;
  job: DispatchJob | null;
  lastSyncAt: string;
  // V3.2 增量数据块：公共导师库与邮件点击停留追踪汇总
  catalogUniversities?: CatalogUniversity[];
  catalogAdvisors?: CatalogAdvisor[];
  trackingSummaries?: Record<string, TrackingSummary>;
}

// ============================================================
// 管理员 Prompt 调优与版本管理模块（仅 cloud-core Admin 接口访问）
// ============================================================

export const PromptCategorySchema = z.enum(["copilot", "action", "extractor", "analyzer"]);
export type PromptCategory = z.infer<typeof PromptCategorySchema>;

export const PromptTemplateSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  category: PromptCategorySchema,
  description: z.string().default(""),
  content: z.string(),
  variables: z.array(z.string()).default([]),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(64).max(16384),
  activeVersion: z.number().int().min(1),
  isEnabled: z.boolean(),
  updatedBy: z.string().default("system"),
  updatedAt: z.string(),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const PromptRevisionSchema = z.object({
  id: z.string(),
  promptId: z.string(),
  version: z.number().int().min(1),
  content: z.string(),
  temperature: z.number(),
  maxOutputTokens: z.number().int(),
  changeNote: z.string().default(""),
  createdBy: z.string().default("system"),
  createdAt: z.string(),
});
export type PromptRevision = z.infer<typeof PromptRevisionSchema>;

export const UpdatePromptInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  content: z.string().min(1, "Prompt 内容不能为空"),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(64).max(16384).optional(),
  isEnabled: z.boolean().optional(),
  changeNote: z.string().max(300).optional().default(""),
});
export type UpdatePromptInput = z.infer<typeof UpdatePromptInputSchema>;

export const RollbackPromptInputSchema = z.object({
  version: z.number().int().min(1),
});
export type RollbackPromptInput = z.infer<typeof RollbackPromptInputSchema>;

// ============================================================
// 独立运营管理端 & Rule-First 采集引擎契约（apps/ops-api & apps/admin-web）
// ============================================================

export const OpsRuleConfigSchema = z.object({
  listItemSelector: z.string().optional(),
  detailLinkSelector: z.string().optional(),
  nameSelector: z.string().optional(),
  emailSelector: z.string().optional(),
  titleSelector: z.string().optional(),
  isPhdListContext: z.boolean().optional(),
  noticeItemSelector: z.string().optional(),
});
export type OpsRuleConfig = z.infer<typeof OpsRuleConfigSchema>;

export const ProbeUniversityInputSchema = z.object({
  universityId: z.string().optional(),
  name: z.string().trim().min(1, "请填写高校名称"),
  officialDomain: z.string().trim().default(""),
  collegeUrl: z.string().trim().default(""),
  facultyListUrl: z.string().trim().default(""),
  noticeListUrl: z.string().trim().default(""),
  skipSubdomainProbe: z.boolean().default(false),
});
export type ProbeUniversityInput = z.infer<typeof ProbeUniversityInputSchema>;

export const OnboardCollegeDraftSchema = z.object({
  name: z.string().trim().min(1, "学院名称不能为空"),
  disciplineCategory: z.string().trim().default(""),
  collegeUrl: z.string().trim().default(""),
  facultyListUrl: z.string().trim().default(""),
  noticeListUrl: z.string().trim().default(""),
  phdAdmissionUrl: z.string().trim().default(""),
  cmsFingerprint: CmsFingerprintSchema.default("unknown"),
  facultyStrategy: FacultyStrategySchema.default("http"),
  noticeStrategy: NoticeStrategySchema.default("date_anchor"),
});
export type OnboardCollegeDraft = z.infer<typeof OnboardCollegeDraftSchema>;

export const OnboardUniversityInputSchema = z.object({
  universityId: z.string().optional(),
  name: z.string().trim().min(1, "请填写高校或科研院所名称"),
  shortName: z.string().trim().default(""),
  officialDomain: z.string().trim().default(""),
  sourceScope: SourceScopeSchema.default("custom_manual"),
  softScienceRank: z.number().int().positive().nullable().optional(),
  rankTier: RankTierSchema.default("other"),
  disciplineRankNote: z.string().trim().default(""),
  facultyPortalUrl: z.string().trim().default(""),
  admissionUrl: z.string().trim().default(""),
  portalBucket: PortalBucketSchema.default("custom"),
  customTags: z.array(z.string()).default([]),
  colleges: z.array(OnboardCollegeDraftSchema).default([]),
});
export type OnboardUniversityInput = z.infer<typeof OnboardUniversityInputSchema>;

export const UpdateUniversityOpsInputSchema = z.object({
  shortName: z.string().trim().optional(),
  officialDomain: z.string().trim().optional(),
  facultyPortalUrl: z.string().trim().optional(),
  admissionUrl: z.string().trim().optional(),
  portalBucket: PortalBucketSchema.optional(),
  healthStatus: HealthStatusSchema.optional(),
  enabled: z.boolean().optional(),
  customTags: z.array(z.string()).optional(),
  manualLockedFields: z.array(z.string()).optional(),
});
export type UpdateUniversityOpsInput = z.infer<typeof UpdateUniversityOpsInputSchema>;

export const CreateCollegeInputSchema = z.object({
  universityId: z.string().min(1),
  name: z.string().trim().min(1, "请填写学院名称"),
  disciplineCategory: z.string().trim().default(""),
  collegeUrl: z.string().trim().default(""),
  facultyListUrl: z.string().trim().default(""),
  noticeListUrl: z.string().trim().default(""),
  phdAdmissionUrl: z.string().trim().default(""),
  cmsFingerprint: CmsFingerprintSchema.default("unknown"),
  facultyStrategy: FacultyStrategySchema.default("http"),
  noticeStrategy: NoticeStrategySchema.default("date_anchor"),
});
export type CreateCollegeInput = z.infer<typeof CreateCollegeInputSchema>;

export const UpdateCollegeInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  disciplineCategory: z.string().trim().optional(),
  collegeUrl: z.string().trim().optional(),
  facultyListUrl: z.string().trim().optional(),
  noticeListUrl: z.string().trim().optional(),
  phdAdmissionUrl: z.string().trim().optional(),
  cmsFingerprint: CmsFingerprintSchema.optional(),
  facultyStrategy: FacultyStrategySchema.optional(),
  noticeStrategy: NoticeStrategySchema.optional(),
  facultyRuleJson: OpsRuleConfigSchema.nullable().optional(),
  noticeRuleJson: OpsRuleConfigSchema.nullable().optional(),
  healthStatus: HealthStatusSchema.optional(),
  manualLockedFields: z.array(z.string()).optional(),
});
export type UpdateCollegeInput = z.infer<typeof UpdateCollegeInputSchema>;

export const SandboxTestInputSchema = z.object({
  url: z.string().trim().min(1, "请填写测试网页 URL"),
  mode: z.enum(["advisor_list", "advisor_detail", "notice_list"]),
  customSelector: z.string().trim().optional(),
  isPhdListContext: z.boolean().default(false),
  collegeId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});
export type SandboxTestInput = z.infer<typeof SandboxTestInputSchema>;

export const CrawlCollegeInputSchema = z.object({
  maxAdvisors: z.number().int().min(1).max(200).default(25),
  crawlNotices: z.boolean().default(true),
  validatePhotos: z.boolean().default(true),
});
export type CrawlCollegeInput = z.infer<typeof CrawlCollegeInputSchema>;

export const UpdateCatalogAdvisorOpsInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  dept: z.string().trim().optional(),
  title: z.string().trim().optional(),
  honorBadge: z.string().trim().optional(),
  honorCategory: HonorCategorySchema.optional(),
  email: z.string().trim().optional(),
  homepageUrl: z.string().trim().optional(),
  photoUrl: z.string().trim().optional(),
  bio: z.string().optional(),
  researchTags: z.array(z.string()).optional(),
  isPhdSupervisor: z.boolean().optional(),
  recruitmentStatus: RecruitmentStatusSchema.optional(),
  recruitmentSignalNote: z.string().trim().optional(),
  recruitOpen: z.boolean().optional(),
  kpiQuotaHero: z.string().trim().optional(),
  footerNote: z.string().trim().optional(),
  reviewStatus: z.enum(["auto_published", "needs_review", "verified", "hidden"]).optional(),
  manualLockedFields: z.array(z.string()).optional(),
});
export type UpdateCatalogAdvisorOpsInput = z.infer<typeof UpdateCatalogAdvisorOpsInputSchema>;

export const ReviewNoticeInputSchema = z.object({
  action: z.enum(["approve", "false_positive"]),
  note: z.string().trim().optional(),
});
export type ReviewNoticeInput = z.infer<typeof ReviewNoticeInputSchema>;

export const UpdateScheduleInputSchema = z.object({
  cronExpr: z.string().trim().min(1).optional(),
  seasonMode: z.enum(["peak", "off_peak"]).optional(),
  offPeakLlmOnly: z.boolean().optional(),
  aiMode: AiExtractModeSchema.optional(),
  enabled: z.boolean().optional(),
});
export type UpdateScheduleInput = z.infer<typeof UpdateScheduleInputSchema>;

export const UpdateGuardrailsInputSchema = z.object({
  defaultAiMode: AiExtractModeSchema.optional(),
  monthlyBudgetCny: z.number().min(0).max(100000).optional(),
  domainConcurrency: z.number().int().min(1).max(5).optional(),
  domainRps: z.number().min(0.2).max(5).optional(),
  circuitBreakerThreshold: z.number().int().min(1).max(50).optional(),
  circuitCooldownMin: z.number().int().min(1).max(240).optional(),
  avatarStorageMode: z.enum(["official_url", "s3_mirror"]).optional(),
});
export type UpdateGuardrailsInput = z.infer<typeof UpdateGuardrailsInputSchema>;

export const CreateLlmKeyInputSchema = z.object({
  label: z.string().trim().min(1, "请填写名称"),
  provider: z.string().trim().default("deepseek"),
  baseUrl: z.string().trim().default("https://api.deepseek.com"),
  model: z.string().trim().default("deepseek-chat"),
  apiKey: z.string().trim().min(6, "API Key 过短"),
  dailyBudgetCny: z.number().min(0).max(10000).default(5),
  monthlyBudgetCny: z.number().min(0).max(50000).default(100),
  rpmLimit: z.number().int().min(1).max(1000).default(30),
  offPeakOnly: z.boolean().default(false),
  priority: z.number().int().min(1).max(99).default(1),
});
export type CreateLlmKeyInput = z.infer<typeof CreateLlmKeyInputSchema>;

export const UpdateLlmKeyInputSchema = z.object({
  label: z.string().trim().min(1).optional(),
  dailyBudgetCny: z.number().min(0).max(10000).optional(),
  monthlyBudgetCny: z.number().min(0).max(50000).optional(),
  rpmLimit: z.number().int().min(1).max(1000).optional(),
  offPeakOnly: z.boolean().optional(),
  priority: z.number().int().min(1).max(99).optional(),
  enabled: z.boolean().optional(),
});
export type UpdateLlmKeyInput = z.infer<typeof UpdateLlmKeyInputSchema>;


