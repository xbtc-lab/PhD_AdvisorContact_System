-- ==============================================================================
-- PhD Cue / PhD_AdvisorContact_System V3.2 — PostgreSQL 17 Initialization DDL
-- Single source of truth for schema bootstrap (`docker-entrypoint-initdb.d` & `ensureSchema()`)
-- Safe & idempotent: uses IF NOT EXISTS throughout.
-- ==============================================================================

-- Extensions (One-DB: vector similarity + trigram fuzzy matching)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. 基础账户与个人履历表
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ============================================================
-- 2. 公共软科高校与导师发现目录（全用户共享底层知识库）
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_name TEXT NOT NULL DEFAULT '',
  soft_science_rank INTEGER,
  rank_tier TEXT NOT NULL DEFAULT 'other',
  discipline_rank_note TEXT NOT NULL DEFAULT '',
  faculty_portal_url TEXT NOT NULL DEFAULT '',
  admission_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_advisors (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES catalog_universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  dept TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  honor_badge TEXT NOT NULL DEFAULT '',
  honor_category TEXT NOT NULL DEFAULT 'regular',
  bio TEXT NOT NULL DEFAULT '',
  research_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  email TEXT NOT NULL DEFAULT '',
  homepage_url TEXT NOT NULL DEFAULT '',
  photo_url TEXT NOT NULL DEFAULT '',
  photo_source TEXT NOT NULL DEFAULT '',
  kpi_outputs_hero TEXT NOT NULL DEFAULT '',
  kpi_outputs_note TEXT NOT NULL DEFAULT '',
  kpi_grants_hero TEXT NOT NULL DEFAULT '',
  kpi_grants_note TEXT NOT NULL DEFAULT '',
  kpi_quota_hero TEXT NOT NULL DEFAULT '',
  kpi_quota_note TEXT NOT NULL DEFAULT '',
  recruit_open BOOLEAN NOT NULL DEFAULT FALSE,
  footer_note TEXT NOT NULL DEFAULT '',
  default_fit_score INTEGER NOT NULL DEFAULT 80,
  source_updated_at TEXT NOT NULL DEFAULT '',
  crawled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_advisors_uni ON catalog_advisors(university_id);

-- ============================================================
-- 3. 申请者学术履历、私有院校与导师台账
-- ============================================================

CREATE TABLE IF NOT EXISTS applicant_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  affiliation TEXT NOT NULL DEFAULT '',
  degree_info TEXT NOT NULL DEFAULT '',
  research_summary TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  wechat TEXT NOT NULL DEFAULT '',
  homepage_url TEXT NOT NULL DEFAULT '',
  publications JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects JSONB NOT NULL DEFAULT '[]'::jsonb,
  methods_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_directions JSONB NOT NULL DEFAULT '[]'::jsonb,
  cv_parsed_text TEXT NOT NULL DEFAULT '',
  education_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  language_scores TEXT NOT NULL DEFAULT '',
  competitions JSONB NOT NULL DEFAULT '[]'::jsonb,
  honors JSONB NOT NULL DEFAULT '[]'::jsonb,
  wechat_qr_path TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS institutions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  faculty_list_url TEXT NOT NULL DEFAULT '',
  admission_url TEXT NOT NULL DEFAULT '',
  deadline_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS advisors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  catalog_advisor_id TEXT REFERENCES catalog_advisors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  dept TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  honor_badge TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  homepage_url TEXT NOT NULL DEFAULT '',
  scholar_url TEXT NOT NULL DEFAULT '',
  avatar_seed TEXT NOT NULL,
  photo_url TEXT NOT NULL DEFAULT '',
  photo_source TEXT NOT NULL DEFAULT '',
  research_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  research_summary TEXT NOT NULL DEFAULT '',
  representative_works JSONB NOT NULL DEFAULT '[]'::jsonb,
  recruitment_signal JSONB,
  match_tier TEXT NOT NULL DEFAULT 'high',
  match_score INTEGER,
  stage TEXT NOT NULL DEFAULT 'drafting',
  in_batch BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_account_id TEXT NOT NULL DEFAULT 'auto',
  hook_note TEXT NOT NULL DEFAULT '',
  user_notes TEXT NOT NULL DEFAULT '',
  reply_note TEXT NOT NULL DEFAULT '',
  track_summary TEXT NOT NULL DEFAULT '',
  ai_insights JSONB,
  research_embedding TEXT,
  last_sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_advisors_institution ON advisors(institution_id);
CREATE INDEX IF NOT EXISTS idx_advisors_stage ON advisors(stage);
CREATE INDEX IF NOT EXISTS idx_advisors_email ON advisors(email);
CREATE INDEX IF NOT EXISTS idx_advisors_catalog ON advisors(catalog_advisor_id);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  parsed_text TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  category TEXT NOT NULL DEFAULT 'resume',
  tag_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- ============================================================
-- 4. 套磁信草稿、修订版本与多会话 AI 写作助手
-- ============================================================

CREATE TABLE IF NOT EXISTS outreach_drafts (
  id TEXT PRIMARY KEY,
  advisor_id TEXT NOT NULL UNIQUE REFERENCES advisors(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  selected_hook TEXT NOT NULL DEFAULT '',
  resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
  preferred_account_id TEXT NOT NULL DEFAULT 'auto',
  template_style TEXT NOT NULL DEFAULT 'editorial',
  embed_contact_card BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_revisions (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES outreach_drafts(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id TEXT NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '默认写作会话',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_advisor ON ai_sessions(advisor_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id TEXT NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES ai_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  suggested_subject TEXT NOT NULL DEFAULT '',
  suggested_body TEXT NOT NULL DEFAULT '',
  suggested_hook TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_advisor ON ai_conversations(advisor_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_session ON ai_conversations(session_id);

-- ============================================================
-- 5. 发件箱、往来消息、错峰队列与双轨追踪
-- ============================================================

CREATE TABLE IF NOT EXISTS mail_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  provider_type TEXT NOT NULL DEFAULT 'imap_smtp',
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 465,
  smtp_security TEXT NOT NULL DEFAULT 'SSL',
  imap_host TEXT NOT NULL DEFAULT '',
  imap_port INTEGER NOT NULL DEFAULT 993,
  drafts_folder TEXT NOT NULL DEFAULT 'Drafts',
  encrypted_credential TEXT NOT NULL DEFAULT '',
  daily_limit INTEGER NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  last_test_result JSONB,
  last_sync_uid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id TEXT REFERENCES advisors(id) ON DELETE SET NULL,
  mail_account_id TEXT REFERENCES mail_accounts(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_id TEXT NOT NULL DEFAULT '',
  in_reply_to TEXT NOT NULL DEFAULT '',
  references_header TEXT NOT NULL DEFAULT '',
  is_unread BOOLEAN NOT NULL DEFAULT FALSE,
  reply_intent TEXT,
  extracted_todos JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_or_received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_advisor ON mail_messages(advisor_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_mid ON mail_messages(message_id);

CREATE TABLE IF NOT EXISTS dispatch_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'send',
  status TEXT NOT NULL DEFAULT 'running',
  stop_requested BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_start_at TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS dispatch_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES dispatch_jobs(id) ON DELETE CASCADE,
  advisor_id TEXT NOT NULL,
  advisor_name TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  resume_path_snapshot TEXT NOT NULL DEFAULT '',
  resume_name_snapshot TEXT NOT NULL DEFAULT '',
  account_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  seq_index INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT NOT NULL DEFAULT '',
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS tracking_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  advisor_id TEXT NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  mail_message_id TEXT REFERENCES mail_messages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  target_resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_advisor ON tracking_links(advisor_id);

CREATE TABLE IF NOT EXISTS tracking_events (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  is_suspected_bot BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_link ON tracking_events(link_id);

-- ============================================================
-- 6. 系统配置、网页巡检与商业化预留表
-- ============================================================

CREATE TABLE IF NOT EXISTS app_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  policy_config JSONB NOT NULL,
  ai_provider TEXT NOT NULL DEFAULT 'deepseek',
  ai_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
  ai_model TEXT NOT NULL DEFAULT 'deepseek-chat',
  encrypted_ai_api_key TEXT NOT NULL DEFAULT '',
  preferences JSONB NOT NULL,
  last_mail_sync_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_targets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  advisor_id TEXT REFERENCES advisors(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'cheerio',
  cron_expr TEXT NOT NULL DEFAULT '0 9 * * *',
  last_content_hash TEXT NOT NULL DEFAULT '',
  last_markdown TEXT NOT NULL DEFAULT '',
  last_checked_at TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_events (
  id TEXT PRIMARY KEY,
  watch_target_id TEXT NOT NULL REFERENCES watch_targets(id) ON DELETE CASCADE,
  diff_summary TEXT NOT NULL DEFAULT '',
  ai_significance TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  key_hash TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'pro',
  max_devices INTEGER NOT NULL DEFAULT 2,
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT NOT NULL DEFAULT '',
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance DOUBLE PRECISION NOT NULL DEFAULT 999999,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  request_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

-- ============================================================
-- 7. 管理员 Prompt 模板与版本历史表（仅由 cloud-core 管理员接口维护）
-- ============================================================

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  temperature DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  max_output_tokens INTEGER NOT NULL DEFAULT 2048,
  active_version INTEGER NOT NULL DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT NOT NULL DEFAULT 'system',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_revisions (
  id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  temperature DOUBLE PRECISION NOT NULL DEFAULT 0.6,
  max_output_tokens INTEGER NOT NULL DEFAULT 2048,
  change_note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_revisions_prompt ON prompt_revisions(prompt_id);

-- ============================================================
-- 8. 增量字段幂等护栏（兼容历史库结构平滑演进）
-- ============================================================

ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS education_history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS language_scores TEXT NOT NULL DEFAULT '';
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS competitions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS honors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE applicant_profiles ADD COLUMN IF NOT EXISTS wechat_qr_path TEXT NOT NULL DEFAULT '';

ALTER TABLE advisors ADD COLUMN IF NOT EXISTS catalog_advisor_id TEXT REFERENCES catalog_advisors(id) ON DELETE SET NULL;
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS honor_badge TEXT NOT NULL DEFAULT '';
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS photo_source TEXT NOT NULL DEFAULT '';
ALTER TABLE advisors ADD COLUMN IF NOT EXISTS track_summary TEXT NOT NULL DEFAULT '';

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'resume';
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS tag_note TEXT NOT NULL DEFAULT '';

ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS template_style TEXT NOT NULL DEFAULT 'editorial';
ALTER TABLE outreach_drafts ADD COLUMN IF NOT EXISTS embed_contact_card BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES ai_sessions(id) ON DELETE CASCADE;
