import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  AiInsights,
  MailAccountTestResult,
  ProjectItem,
  PromptCategory,
  PublicationItem,
} from "@app/shared";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull().default(""),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const applicantProfiles = sqliteTable("applicant_profiles", {
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
  publications: text("publications", { mode: "json" }).$type<PublicationItem[]>().notNull().default([]),
  projects: text("projects", { mode: "json" }).$type<ProjectItem[]>().notNull().default([]),
  methodsSkills: text("methods_skills", { mode: "json" }).$type<string[]>().notNull().default([]),
  targetDirections: text("target_directions", { mode: "json" }).$type<string[]>().notNull().default([]),
  cvParsedText: text("cv_parsed_text").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const institutions = sqliteTable("institutions", {
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

export const advisors = sqliteTable("advisors", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  institutionId: text("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  dept: text("dept").notNull().default(""),
  title: text("title").notNull().default(""),
  email: text("email").notNull().default(""),
  homepageUrl: text("homepage_url").notNull().default(""),
  scholarUrl: text("scholar_url").notNull().default(""),
  avatarSeed: text("avatar_seed").notNull(),
  researchTags: text("research_tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  researchSummary: text("research_summary").notNull().default(""),
  representativeWorks: text("representative_works", { mode: "json" })
    .$type<Array<{ title: string; venue?: string; year?: string; url?: string }>>()
    .notNull()
    .default([]),
  recruitmentSignal: text("recruitment_signal", { mode: "json" }).$type<{
    status?: string;
    year?: string;
    sourceUrl?: string;
    note?: string;
  } | null>(),
  matchTier: text("match_tier").notNull().default("high"),
  matchScore: integer("match_score"),
  stage: text("stage").notNull().default("drafting"),
  inBatch: integer("in_batch", { mode: "boolean" }).notNull().default(true),
  assignedAccountId: text("assigned_account_id").notNull().default("auto"),
  hookNote: text("hook_note").notNull().default(""),
  userNotes: text("user_notes").notNull().default(""),
  replyNote: text("reply_note").notNull().default(""),
  aiInsights: text("ai_insights", { mode: "json" }).$type<AiInsights | null>(),
  researchEmbedding: text("research_embedding"),
  lastSentAt: text("last_sent_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  storagePath: text("storage_path").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  parsedText: text("parsed_text").notNull().default(""),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const outreachDrafts = sqliteTable("outreach_drafts", {
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
  updatedAt: text("updated_at").notNull(),
});

export const draftRevisions = sqliteTable("draft_revisions", {
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

export const mailAccounts = sqliteTable("mail_accounts", {
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
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  note: text("note").notNull().default(""),
  lastTestResult: text("last_test_result", { mode: "json" }).$type<MailAccountTestResult | null>(),
  lastSyncUid: integer("last_sync_uid").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const mailMessages = sqliteTable("mail_messages", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id").references(() => advisors.id, { onDelete: "set null" }),
  mailAccountId: text("mail_account_id").references(() => mailAccounts.id, { onDelete: "set null" }),
  direction: text("direction").notNull(), // outbound | inbound
  fromName: text("from_name").notNull().default(""),
  fromEmail: text("from_email").notNull(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  attachments: text("attachments", { mode: "json" }).$type<string[]>().notNull().default([]),
  messageId: text("message_id").notNull().default(""),
  inReplyTo: text("in_reply_to").notNull().default(""),
  referencesHeader: text("references_header").notNull().default(""),
  isUnread: integer("is_unread", { mode: "boolean" }).notNull().default(false),
  replyIntent: text("reply_intent"),
  extractedTodos: text("extracted_todos", { mode: "json" }).$type<string[]>().notNull().default([]),
  sentOrReceivedAt: text("sent_or_received_at").notNull(),
});

export const dispatchJobs = sqliteTable("dispatch_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("send"), // send | draft
  status: text("status").notNull().default("running"),
  stopRequested: integer("stop_requested", { mode: "boolean" }).notNull().default(false),
  scheduledStartAt: text("scheduled_start_at"),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  total: integer("total").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  succeeded: integer("succeeded").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  logs: text("logs", { mode: "json" }).$type<string[]>().notNull().default([]),
});

export const dispatchJobItems = sqliteTable("dispatch_job_items", {
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
  status: text("status").notNull().default("pending"), // pending | processing | ok | error | cancelled
  message: text("message").notNull().default(""),
  processedAt: text("processed_at"),
});

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id")
    .notNull()
    .references(() => advisors.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  suggestedSubject: text("suggested_subject").notNull().default(""),
  suggestedBody: text("suggested_body").notNull().default(""),
  suggestedHook: text("suggested_hook").notNull().default(""),
  model: text("model").notNull().default(""),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  policyConfig: text("policy_config", { mode: "json" })
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
  preferences: text("preferences", { mode: "json" })
    .$type<{
      avatarStyle: "facehash" | "initials";
      defaultResumeId: string | null;
      quotaResetAfter: string;
    }>()
    .notNull(),
  lastMailSyncAt: text("last_mail_sync_at").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

// --- Phase 2 & Phase 3 Reserved Tables (Created cleanly for smooth migration) ---

export const watchTargets = sqliteTable("watch_targets", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id").references(() => advisors.id, { onDelete: "cascade" }),
  targetUrl: text("target_url").notNull(),
  strategy: text("strategy").notNull().default("cheerio"),
  cronExpr: text("cron_expr").notNull().default("0 9 * * *"),
  lastContentHash: text("last_content_hash").notNull().default(""),
  lastMarkdown: text("last_markdown").notNull().default(""),
  lastCheckedAt: text("last_checked_at"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const watchEvents = sqliteTable("watch_events", {
  id: text("id").primaryKey(),
  watchTargetId: text("watch_target_id")
    .notNull()
    .references(() => watchTargets.id, { onDelete: "cascade" }),
  diffSummary: text("diff_summary").notNull().default(""),
  aiSignificance: text("ai_significance").notNull().default(""),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const licenses = sqliteTable("licenses", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  keyHash: text("key_hash").notNull().unique(),
  tier: text("tier").notNull().default("pro"),
  maxDevices: integer("max_devices").notNull().default(2),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});

export const deviceSessions = sqliteTable("device_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceFingerprint: text("device_fingerprint").notNull(),
  deviceName: text("device_name").notNull().default(""),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
  lastActiveAt: text("last_active_at").notNull(),
});

export const creditAccounts = sqliteTable("credit_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  balance: real("balance").notNull().default(999999),
  updatedAt: text("updated_at").notNull(),
});

export const creditLedger = sqliteTable("credit_ledger", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delta: real("delta").notNull(),
  reason: text("reason").notNull(),
  requestId: text("request_id").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

// ============================================================
// 管理员 Prompt 模板与修订版本表（商业化后防止核心 Prompt 泄漏）
// ============================================================

export const promptTemplates = sqliteTable("prompt_templates", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").$type<PromptCategory>().notNull(),
  description: text("description").notNull().default(""),
  content: text("content").notNull(),
  variables: text("variables", { mode: "json" }).$type<string[]>().notNull().default([]),
  temperature: real("temperature").notNull().default(0.6),
  maxOutputTokens: integer("max_output_tokens").notNull().default(2048),
  activeVersion: integer("active_version").notNull().default(1),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull(),
});

export const promptRevisions = sqliteTable("prompt_revisions", {
  id: text("id").primaryKey(),
  promptId: text("prompt_id")
    .notNull()
    .references(() => promptTemplates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  temperature: real("temperature").notNull().default(0.6),
  maxOutputTokens: integer("max_output_tokens").notNull().default(2048),
  changeNote: text("change_note").notNull().default(""),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: text("created_at").notNull(),
});

