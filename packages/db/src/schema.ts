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
  AiInsights,
  AttachmentCategory,
  CompetitionItem,
  EducationItem,
  HonorCategory,
  HonorItem,
  MailAccountTestResult,
  ProjectItem,
  PromptCategory,
  PublicationItem,
  RankTier,
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
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const catalogAdvisors = pgTable(
  "catalog_advisors",
  {
    id: text("id").primaryKey(),
    universityId: text("university_id")
      .notNull()
      .references(() => catalogUniversities.id, { onDelete: "cascade" }),
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
    footerNote: text("footer_note").notNull().default(""),
    defaultFitScore: integer("default_fit_score").notNull().default(80),
    sourceUpdatedAt: text("source_updated_at").notNull().default(""),
    crawledAt: text("crawled_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_catalog_advisors_uni").on(table.universityId)]
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
