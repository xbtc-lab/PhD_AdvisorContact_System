import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import type {
  AiExtractMode,
  AiInsights,
  AttachmentCategory,
  CmsFingerprint,
  CompetitionItem,
  EducationItem,
  FacultyStrategy,
  HealthStatus,
  HonorCategory,
  HonorItem,
  MailAccountTestResult,
  NoticeStrategy,
  OpsRuleConfig,
  PortalBucket,
  ProjectItem,
  PromptCategory,
  PublicationItem,
  RankTier,
  RecruitmentStatus,
  SourceScope,
  TrackingLinkKind,
} from "@app/shared";

// ============================================================
// 基础账户与个人履历表
// ============================================================

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const applicantProfiles = pgTable("applicant_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  affiliation: text("affiliation").notNull().default(""),
  degreeInfo: text("degree_info").notNull().default(""),
  researchSummary: text("research_summary").notNull().default(""),
  phone: text("phone").notNull().default(""),
  wechat: text("wechat").notNull().default(""),
  homepageUrl: text("homepage_url").notNull().default(""),
  publications: jsonb("publications").$type<PublicationItem[]>().notNull().default([]),
  projects: jsonb("projects").$type<ProjectItem[]>().notNull().default([]),
  methodsSkills: jsonb("methods_skills").$type<string[]>().notNull().default([]),
  targetDirections: jsonb("target_directions").$type<string[]>().notNull().default([]),
  cvParsedText: text("cv_parsed_text").notNull().default(""),
  // V3.2 履历扩展：教育经历/GPA、外语成绩、学科竞赛、荣誉奖项、互动卡二维码路径
  educationHistory: jsonb("education_history").$type<EducationItem[]>().notNull().default([]),
  languageScores: text("language_scores").notNull().default(""),
  competitions: jsonb("competitions").$type<CompetitionItem[]>().notNull().default([]),
  honors: jsonb("honors").$type<HonorItem[]>().notNull().default([]),
  wechatQrPath: text("wechat_qr_path").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

// ============================================================
// 公共软科高校与导师发现目录（全用户共享底层知识库）
// ============================================================

export const catalogUniversities = pgTable("catalog_universities", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  shortName: text("short_name").notNull().default(""),
  softScienceRank: integer("soft_science_rank"),
  rankTier: text("rank_tier").$type<RankTier>().notNull().default("other"),
  disciplineRankNote: text("discipline_rank_note").notNull().default(""),
  facultyPortalUrl: text("faculty_portal_url").notNull().default(""),
  admissionUrl: text("admission_url").notNull().default(""),
  sourceScope: text("source_scope").$type<SourceScope>().notNull().default("top100"),
  officialDomain: text("official_domain").notNull().default(""),
  portalBucket: text("portal_bucket").$type<PortalBucket>().notNull().default("decentralized"),
  adapterKey: text("adapter_key").notNull().default(""),
  healthStatus: text("health_status").$type<HealthStatus>().notNull().default("unprobed"),
  enabled: boolean("enabled").notNull().default(true),
  customTags: jsonb("custom_tags").$type<string[]>().notNull().default([]),
  manualLockedFields: jsonb("manual_locked_fields").$type<string[]>().notNull().default([]),
  lastProbedAt: text("last_probed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const catalogColleges = pgTable(
  "catalog_colleges",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => catalogUniversities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    disciplineCategory: text("discipline_category").notNull().default(""),
    collegeUrl: text("college_url").notNull().default(""),
    facultyListUrl: text("faculty_list_url").notNull().default(""),
    noticeListUrl: text("notice_list_url").notNull().default(""),
    phdAdmissionUrl: text("phd_admission_url").notNull().default(""),
    cmsFingerprint: text("cms_fingerprint").$type<CmsFingerprint>().notNull().default("unknown"),
    facultyStrategy: text("faculty_strategy").$type<FacultyStrategy>().notNull().default("http"),
    noticeStrategy: text("notice_strategy").$type<NoticeStrategy>().notNull().default("date_anchor"),
    facultyRuleJson: jsonb("faculty_rule_json").$type<OpsRuleConfig | null>(),
    noticeRuleJson: jsonb("notice_rule_json").$type<OpsRuleConfig | null>(),
    charsetHint: text("charset_hint").notNull().default(""),
    consecutiveEmptyRuns: integer("consecutive_empty_runs").notNull().default(0),
    healthStatus: text("health_status").$type<HealthStatus>().notNull().default("unprobed"),
    lastFacultyCrawlAt: text("last_faculty_crawl_at"),
    lastNoticeCrawlAt: text("last_notice_crawl_at"),
    manualLockedFields: jsonb("manual_locked_fields").$type<string[]>().notNull().default([]),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_catalog_colleges_uni").on(table.universityId)]
);

export const catalogAdvisors = pgTable(
  "catalog_advisors",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => catalogUniversities.id, { onDelete: "cascade" }),
    collegeId: text("college_id").references(() => catalogColleges.id, { onDelete: "set null" }),
    sourceKey: text("source_key"),
    name: text("name").notNull(),
    dept: text("dept").notNull().default(""),
    title: text("title").notNull().default(""),
    honorBadge: text("honor_badge").notNull().default(""),
    honorCategory: text("honor_category").$type<HonorCategory>().notNull().default("regular"),
    bio: text("bio").notNull().default(""),
    researchTags: jsonb("research_tags").$type<string[]>().notNull().default([]),
    email: text("email").notNull().default(""),
    homepageUrl: text("homepage_url").notNull().default(""),
    photoUrl: text("photo_url").notNull().default(""),
    photoSource: text("photo_source").notNull().default(""),
    kpiOutputsHero: text("kpi_outputs_hero").notNull().default(""),
    kpiOutputsNote: text("kpi_outputs_note").notNull().default(""),
    kpiGrantsHero: text("kpi_grants_hero").notNull().default(""),
    kpiGrantsNote: text("kpi_grants_note").notNull().default(""),
    kpiQuotaHero: text("kpi_quota_hero").notNull().default(""),
    kpiQuotaNote: text("kpi_quota_note").notNull().default(""),
    recruitOpen: boolean("recruit_open").notNull().default(false),
    isPhdSupervisor: boolean("is_phd_supervisor").notNull().default(true),
    recruitmentStatus: text("recruitment_status")
      .$type<RecruitmentStatus>()
      .notNull()
      .default("phd_default_open"),
    recruitmentSignalNote: text("recruitment_signal_note").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    contentHash: text("content_hash").notNull().default(""),
    extractModeUsed: text("extract_mode_used").notNull().default("rule"),
    needsAi: boolean("needs_ai").notNull().default(false),
    qualityScore: integer("quality_score").notNull().default(80),
    reviewStatus: text("review_status").notNull().default("auto_published"),
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),
    photoStorageKey: text("photo_storage_key").notNull().default(""),
    manualLockedFields: jsonb("manual_locked_fields").$type<string[]>().notNull().default([]),
    footerNote: text("footer_note").notNull().default(""),
    defaultFitScore: integer("default_fit_score").notNull().default(80),
    sourceUpdatedAt: text("source_updated_at").notNull().default(""),
    crawledAt: text("crawled_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_catalog_advisors_uni").on(table.universityId),
    index("idx_catalog_advisors_college").on(table.collegeId),
    index("idx_catalog_advisors_review").on(table.reviewStatus),
  ]
);

// ============================================================
// 用户私有高校、导师台账与简历/成绩单附件库
// ============================================================

export const institutions = pgTable("institutions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortName: text("short_name").notNull().default(""),
  department: text("department").notNull().default(""),
  facultyListUrl: text("faculty_list_url").notNull().default(""),
  admissionUrl: text("admission_url").notNull().default(""),
  deadlineAt: text("deadline_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const advisors = pgTable(
  "advisors",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institutionId: text("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    // 若由公共软科导师库一键收录，记录关联主键以便防重与联动展示
    catalogAdvisorId: text("catalog_advisor_id").references(() => catalogAdvisors.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    dept: text("dept").notNull().default(""),
    title: text("title").notNull().default(""),
    honorBadge: text("honor_badge").notNull().default(""),
    email: text("email").notNull().default(""),
    homepageUrl: text("homepage_url").notNull().default(""),
    scholarUrl: text("scholar_url").notNull().default(""),
    avatarSeed: text("avatar_seed").notNull(),
    photoUrl: text("photo_url").notNull().default(""),
    photoSource: text("photo_source").notNull().default(""),
    researchTags: jsonb("research_tags").$type<string[]>().notNull().default([]),
    researchSummary: text("research_summary").notNull().default(""),
    representativeWorks: jsonb("representative_works")
      .$type<Array<{ title: string; venue?: string; year?: string; url?: string }>>()
      .notNull()
      .default([]),
    recruitmentSignal: jsonb("recruitment_signal").$type<{
      status?: string;
      year?: string;
      sourceUrl?: string;
      note?: string;
    } | null>(),
    matchTier: text("match_tier").notNull().default("high"),
    matchScore: integer("match_score"),
    stage: text("stage").notNull().default("drafting"),
    inBatch: boolean("in_batch").notNull().default(true),
    assignedAccountId: text("assigned_account_id").notNull().default("auto"),
    hookNote: text("hook_note").notNull().default(""),
    userNotes: text("user_notes").notNull().default(""),
    replyNote: text("reply_note").notNull().default(""),
    trackSummary: text("track_summary").notNull().default(""),
    aiInsights: jsonb("ai_insights").$type<AiInsights | null>(),
    researchEmbedding: text("research_embedding"),
    lastSentAt: text("last_sent_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_advisors_institution").on(table.institutionId),
    index("idx_advisors_stage").on(table.stage),
    index("idx_advisors_email").on(table.email),
    index("idx_advisors_catalog").on(table.catalogAdvisorId),
  ]
);

export const resumes = pgTable("resumes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  parsedText: text("parsed_text").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  // 区分主简历、成绩单、微信二维码与获奖证书
  category: text("category").$type<AttachmentCategory>().notNull().default("resume"),
  tagNote: text("tag_note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// 套磁信草稿、修订版本与多会话 AI 助手
// ============================================================

export const outreachDrafts = pgTable("outreach_drafts", {
  id: text("id").primaryKey(),
  advisorId: text("advisor_id")
    .notNull()
    .unique()
    .references(() => advisors.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  selectedHook: text("selected_hook").notNull().default(""),
  resumeId: text("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  preferredAccountId: text("preferred_account_id").notNull().default("auto"),
  // HTML 学术版式选择与底部互动联系卡开关
  templateStyle: text("template_style").$type<"editorial" | "classic">().notNull().default("editorial"),
  embedContactCard: boolean("embed_contact_card").notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const draftRevisions = pgTable("draft_revisions", {
  id: text("id").primaryKey(),
  draftId: text("draft_id")
    .notNull()
    .references(() => outreachDrafts.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  source: text("source").notNull().default("manual"),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const aiSessions = pgTable(
  "ai_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("默认写作会话"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_ai_sessions_advisor").on(table.advisorId)]
);

export const aiConversations = pgTable(
  "ai_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => aiSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    suggestedSubject: text("suggested_subject").notNull().default(""),
    suggestedBody: text("suggested_body").notNull().default(""),
    suggestedHook: text("suggested_hook").notNull().default(""),
    model: text("model").notNull().default(""),
    tokensUsed: integer("tokens_used").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_ai_conv_advisor").on(table.advisorId),
    index("idx_ai_conv_session").on(table.sessionId),
  ]
);

// ============================================================
// 发件箱、往来消息、双轨追踪与错峰队列
// ============================================================

export const mailAccounts = pgTable("mail_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull().default(""),
  providerType: text("provider_type").notNull().default("imap_smtp"),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(465),
  smtpSecurity: text("smtp_security").notNull().default("SSL"),
  imapHost: text("imap_host").notNull().default(""),
  imapPort: integer("imap_port").notNull().default(993),
  draftsFolder: text("drafts_folder").notNull().default("Drafts"),
  encryptedCredential: text("encrypted_credential").notNull().default(""),
  dailyLimit: integer("daily_limit").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  note: text("note").notNull().default(""),
  lastTestResult: jsonb("last_test_result").$type<MailAccountTestResult | null>(),
  lastSyncUid: integer("last_sync_uid").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mailMessages = pgTable(
  "mail_messages",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id").references(() => advisors.id, { onDelete: "set null" }),
    mailAccountId: text("mail_account_id").references(() => mailAccounts.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // outbound | inbound
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    messageId: text("message_id").notNull().default(""),
    inReplyTo: text("in_reply_to").notNull().default(""),
    referencesHeader: text("references_header").notNull().default(""),
    isUnread: boolean("is_unread").notNull().default(false),
    replyIntent: text("reply_intent"),
    extractedTodos: jsonb("extracted_todos").$type<string[]>().notNull().default([]),
    sentOrReceivedAt: text("sent_or_received_at").notNull(),
  },
  (table) => [
    index("idx_mail_messages_advisor").on(table.advisorId),
    index("idx_mail_messages_mid").on(table.messageId),
  ]
);

export const trackingLinks = pgTable(
  "tracking_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    advisorId: text("advisor_id")
      .notNull()
      .references(() => advisors.id, { onDelete: "cascade" }),
    mailMessageId: text("mail_message_id").references(() => mailMessages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<TrackingLinkKind>().notNull(),
    targetResumeId: text("target_resume_id").references(() => resumes.id, {
      onDelete: "set null",
    }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_tracking_links_advisor").on(table.advisorId)]
);

export const trackingEvents = pgTable(
  "tracking_events",
  {
    id: text("id").primaryKey(),
    linkId: text("link_id")
      .notNull()
      .references(() => trackingLinks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // click | heartbeat | pixel_open
    durationSec: integer("duration_sec").notNull().default(0),
    isSuspectedBot: boolean("is_suspected_bot").notNull().default(false),
    userAgent: text("user_agent").notNull().default(""),
    ipHash: text("ip_hash").notNull().default(""),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_tracking_events_link").on(table.linkId)]
);

export const dispatchJobs = pgTable("dispatch_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("send"), // send | draft
  status: text("status").notNull().default("running"),
  stopRequested: boolean("stop_requested").notNull().default(false),
  scheduledStartAt: text("scheduled_start_at"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  total: integer("total").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  succeeded: integer("succeeded").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  logs: jsonb("logs").$type<string[]>().notNull().default([]),
});

export const dispatchJobItems = pgTable("dispatch_job_items", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => dispatchJobs.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id").notNull(),
  advisorName: text("advisor_name").notNull(),
  institutionName: text("institution_name").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  bodySnapshot: text("body_snapshot").notNull(),
  resumePathSnapshot: text("resume_path_snapshot").notNull().default(""),
  resumeNameSnapshot: text("resume_name_snapshot").notNull().default(""),
  accountId: text("account_id").notNull(),
  accountLabel: text("account_label").notNull(),
  seqIndex: integer("seq_index").notNull(),
  status: text("status").notNull().default("pending"),
  message: text("message").notNull().default(""),
  processedAt: text("processed_at"),
});

// ============================================================
// 系统配置、网页巡检与商业化预留表
// ============================================================

export const appSettings = pgTable("app_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  policyConfig: jsonb("policy_config")
    .$type<{
      minDelaySec: number;
      maxDelaySec: number;
      avoidConsecutiveSameDomain: boolean;
      maxAttachmentMb: number;
    }>()
    .notNull(),
  aiProvider: text("ai_provider").notNull().default("deepseek"),
  aiBaseUrl: text("ai_base_url").notNull().default("https://api.deepseek.com"),
  aiModel: text("ai_model").notNull().default("deepseek-chat"),
  encryptedAiApiKey: text("encrypted_ai_api_key").notNull().default(""),
  preferences: jsonb("preferences")
    .$type<{
      avatarStyle: "facehash" | "initials";
      defaultResumeId: string | null;
      quotaResetAfter: string;
    }>()
    .notNull(),
  lastMailSyncAt: text("last_mail_sync_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const watchTargets = pgTable("watch_targets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  institutionId: text("institution_id").references(() => institutions.id, {
    onDelete: "cascade",
  }),
  advisorId: text("advisor_id").references(() => advisors.id, { onDelete: "cascade" }),
  targetUrl: text("target_url").notNull(),
  strategy: text("strategy").notNull().default("cheerio"),
  cronExpr: text("cron_expr").notNull().default("0 9 * * *"),
  lastContentHash: text("last_content_hash").notNull().default(""),
  lastMarkdown: text("last_markdown").notNull().default(""),
  lastCheckedAt: text("last_checked_at"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const watchEvents = pgTable("watch_events", {
  id: text("id").primaryKey(),
  watchTargetId: text("watch_target_id")
    .notNull()
    .references(() => watchTargets.id, { onDelete: "cascade" }),
  diffSummary: text("diff_summary").notNull().default(""),
  aiSignificance: text("ai_significance").notNull().default(""),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const licenses = pgTable("licenses", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  keyHash: text("key_hash").notNull().unique(),
  tier: text("tier").notNull().default("pro"),
  maxDevices: integer("max_devices").notNull().default(2),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});

export const deviceSessions = pgTable("device_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceFingerprint: text("device_fingerprint").notNull(),
  deviceName: text("device_name").notNull().default(""),
  revoked: boolean("revoked").notNull().default(false),
  lastActiveAt: text("last_active_at").notNull(),
});

export const creditAccounts = pgTable("credit_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: doublePrecision("balance").notNull().default(999999),
  updatedAt: text("updated_at").notNull(),
});

export const creditLedger = pgTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delta: doublePrecision("delta").notNull(),
  reason: text("reason").notNull(),
  requestId: text("request_id").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// 管理员 Prompt 模板与修订版本表（商业化后防止核心 Prompt 泄漏）
// ============================================================

export const promptTemplates = pgTable("prompt_templates", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").$type<PromptCategory>().notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  temperature: doublePrecision("temperature").notNull().default(0.6),
  maxOutputTokens: integer("max_output_tokens").notNull().default(2048),
  activeVersion: integer("active_version").notNull().default(1),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull(),
});

export const promptRevisions = pgTable(
  "prompt_revisions",
  {
    id: text("id").primaryKey(),
    promptId: text("prompt_id")
      .notNull()
      .references(() => promptTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    temperature: doublePrecision("temperature").notNull().default(0.6),
    maxOutputTokens: integer("max_output_tokens").notNull().default(2048),
    changeNote: text("change_note").notNull().default(""),
    createdBy: text("created_by").notNull().default("system"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_prompt_revisions_prompt").on(table.promptId)]
);

// ============================================================
// 独立管理端与采集内核表（0002_ops_crawler.sql）
// ============================================================

export const catalogNotices = pgTable(
  "catalog_notices",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => catalogUniversities.id, { onDelete: "cascade" }),
    collegeId: text("college_id").references(() => catalogColleges.id, { onDelete: "set null" }),
    sourceUrl: text("source_url").notNull().unique(),
    title: text("title").notNull(),
    publishedAt: text("published_at").notNull().default(""),
    matchedKeywords: jsonb("matched_keywords").$type<string[]>().notNull().default([]),
    rawMarkdown: text("raw_markdown").notNull().default(""),
    summary: text("summary").notNull().default(""),
    deadlineAt: text("deadline_at").notNull().default(""),
    admissionType: text("admission_type").notNull().default(""),
    englishReq: text("english_req").notNull().default(""),
    extractedAdvisorNames: jsonb("extracted_advisor_names").$type<string[]>().notNull().default([]),
    attachmentUrls: jsonb("attachment_urls").$type<string[]>().notNull().default([]),
    attachmentStorageKeys: jsonb("attachment_storage_keys").$type<string[]>().notNull().default([]),
    reviewStatus: text("review_status").notNull().default("pending"),
    linkedAdvisorCount: integer("linked_advisor_count").notNull().default(0),
    crawledAt: text("crawled_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_catalog_notices_uni").on(table.universityId),
    index("idx_catalog_notices_college").on(table.collegeId),
    index("idx_catalog_notices_review").on(table.reviewStatus),
  ]
);

export const crawlSnapshots = pgTable(
  "crawl_snapshots",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull().unique(),
    entityType: text("entity_type").notNull(),
    universityId: text("university_id").references(() => catalogUniversities.id, {
      onDelete: "cascade",
    }),
    collegeId: text("college_id").references(() => catalogColleges.id, { onDelete: "set null" }),
    httpStatus: integer("http_status").notNull().default(0),
    etag: text("etag").notNull().default(""),
    lastModified: text("last_modified").notNull().default(""),
    contentHash: text("content_hash").notNull().default(""),
    cleanedMarkdown: text("cleaned_markdown").notNull().default(""),
    prunedMarkdown: text("pruned_markdown").notNull().default(""),
    extractedJson: jsonb("extracted_json").$type<Record<string, unknown> | null>(),
    status: text("status").notNull().default("pending"),
    errorCategory: text("error_category").notNull().default(""),
    errorMessage: text("error_message").notNull().default(""),
    retryCount: integer("retry_count").notNull().default(0),
    fetchedAt: text("fetched_at"),
    parsedAt: text("parsed_at"),
  },
  (table) => [
    index("idx_crawl_snapshots_uni").on(table.universityId),
    index("idx_crawl_snapshots_status").on(table.status),
  ]
);

export const crawlSchedules = pgTable("crawl_schedules", {
  id: text("id").primaryKey(),
  pipelineKey: text("pipeline_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  cronExpr: text("cron_expr").notNull(),
  seasonMode: text("season_mode").notNull().default("off_peak"),
  offPeakLlmOnly: boolean("off_peak_llm_only").notNull().default(true),
  aiMode: text("ai_mode").$type<AiExtractMode>().notNull().default("rule_only"),
  enabled: boolean("enabled").notNull().default(false),
  nextRunAt: text("next_run_at"),
  lastRunAt: text("last_run_at"),
  updatedAt: text("updated_at").notNull(),
});

export const crawlRuns = pgTable("crawl_runs", {
  id: text("id").primaryKey(),
  scheduleId: text("schedule_id").references(() => crawlSchedules.id, { onDelete: "set null" }),
  runKind: text("run_kind").notNull().default("college_crawl"),
  scope: text("scope").notNull().default("selected_entities"),
  aiMode: text("ai_mode").$type<AiExtractMode>().notNull().default("rule_only"),
  replaySnapshotsOnly: boolean("replay_snapshots_only").notNull().default(false),
  status: text("status").notNull().default("running"),
  totalPages: integer("total_pages").notNull().default(0),
  hashSkipped: integer("hash_skipped").notNull().default(0),
  ruleParsed: integer("rule_parsed").notNull().default(0),
  aiCalls: integer("ai_calls").notNull().default(0),
  noticesFound: integer("notices_found").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  estimatedCostCny: doublePrecision("estimated_cost_cny").notNull().default(0),
  actualCostCny: doublePrecision("actual_cost_cny").notNull().default(0),
  summary: text("summary").notNull().default(""),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
});

export const crawlRunLogs = pgTable(
  "crawl_run_logs",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => crawlRuns.id, { onDelete: "cascade" }),
    level: text("level").notNull().default("info"),
    errorCategory: text("error_category").notNull().default(""),
    universityId: text("university_id"),
    collegeId: text("college_id"),
    url: text("url").notNull().default(""),
    message: text("message").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_crawl_run_logs_run").on(table.runId),
    index("idx_crawl_run_logs_cat").on(table.errorCategory),
  ]
);

export const opsLlmKeys = pgTable("ops_llm_keys", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  provider: text("provider").notNull().default("deepseek"),
  baseUrl: text("base_url").notNull().default("https://api.deepseek.com"),
  model: text("model").notNull().default("deepseek-chat"),
  encryptedApiKey: text("encrypted_api_key").notNull(),
  maskedKey: text("masked_key").notNull().default(""),
  dailyBudgetCny: doublePrecision("daily_budget_cny").notNull().default(5.0),
  monthlyBudgetCny: doublePrecision("monthly_budget_cny").notNull().default(100.0),
  usedTodayCny: doublePrecision("used_today_cny").notNull().default(0),
  usedMonthCny: doublePrecision("used_month_cny").notNull().default(0),
  rpmLimit: integer("rpm_limit").notNull().default(30),
  offPeakOnly: boolean("off_peak_only").notNull().default(false),
  priority: integer("priority").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  exhaustedUntil: text("exhausted_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const llmUsageLedger = pgTable("llm_usage_ledger", {
  id: text("id").primaryKey(),
  keyId: text("key_id").references(() => opsLlmKeys.id, { onDelete: "set null" }),
  runId: text("run_id").references(() => crawlRuns.id, { onDelete: "set null" }),
  purpose: text("purpose").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0),
  costCny: doublePrecision("cost_cny").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const opsRuleDictionaries = pgTable("ops_rule_dictionaries", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().unique(),
  name: text("name").notNull(),
  entries: jsonb("entries").$type<string[]>().notNull().default([]),
  updatedAt: text("updated_at").notNull(),
});

export const opsGuardrailsConfig = pgTable("ops_guardrails_config", {
  id: text("id").primaryKey(),
  defaultAiMode: text("default_ai_mode").$type<AiExtractMode>().notNull().default("rule_only"),
  monthlyBudgetCny: doublePrecision("monthly_budget_cny").notNull().default(200.0),
  domainConcurrency: integer("domain_concurrency").notNull().default(1),
  domainRps: doublePrecision("domain_rps").notNull().default(1.0),
  circuitBreakerThreshold: integer("circuit_breaker_threshold").notNull().default(5),
  circuitCooldownMin: integer("circuit_cooldown_min").notNull().default(30),
  avatarStorageMode: text("avatar_storage_mode").notNull().default("official_url"),
  updatedAt: text("updated_at").notNull(),
});

export const opsAuditLogs = pgTable("ops_audit_logs", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull().default("admin"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull().default(""),
  entityId: text("entity_id").notNull().default(""),
  detailJson: jsonb("detail_json").$type<Record<string, unknown> | null>(),
  createdAt: text("created_at").notNull(),
});
