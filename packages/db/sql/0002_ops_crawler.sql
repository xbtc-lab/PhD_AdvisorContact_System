-- ==============================================================================
-- PhD Cue Ops — PostgreSQL 17 Crawler & Operations Console Migration (Idempotent)
-- Executes automatically via ensureSchema() after 0001_init.sql
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. catalog_universities 增量扩展（软科 Top 100 + 手动非 Top 100）
-- ============================================================

ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS source_scope TEXT NOT NULL DEFAULT 'top100';
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS official_domain TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS portal_bucket TEXT NOT NULL DEFAULT 'decentralized';
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS adapter_key TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unprobed';
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS custom_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS manual_locked_fields JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_universities ADD COLUMN IF NOT EXISTS last_probed_at TEXT;

UPDATE catalog_universities
SET source_scope = 'custom_manual', portal_bucket = COALESCE(NULLIF(portal_bucket, ''), 'custom')
WHERE soft_science_rank IS NULL OR soft_science_rank > 100;

UPDATE catalog_universities u
SET health_status = 'healthy'
WHERE health_status = 'unprobed'
  AND EXISTS (
    SELECT 1 FROM catalog_colleges c
    WHERE c.university_id = u.id AND c.health_status = 'healthy'
  );

-- ============================================================
-- 2. catalog_colleges（二级学院与独立采集规则载体）
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_colleges (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES catalog_universities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discipline_category TEXT NOT NULL DEFAULT '',
  college_url TEXT NOT NULL DEFAULT '',
  faculty_list_url TEXT NOT NULL DEFAULT '',
  notice_list_url TEXT NOT NULL DEFAULT '',
  phd_admission_url TEXT NOT NULL DEFAULT '',
  cms_fingerprint TEXT NOT NULL DEFAULT 'unknown',
  faculty_strategy TEXT NOT NULL DEFAULT 'http',
  notice_strategy TEXT NOT NULL DEFAULT 'date_anchor',
  faculty_rule_json JSONB,
  notice_rule_json JSONB,
  charset_hint TEXT NOT NULL DEFAULT '',
  consecutive_empty_runs INTEGER NOT NULL DEFAULT 0,
  health_status TEXT NOT NULL DEFAULT 'unprobed',
  last_faculty_crawl_at TEXT,
  last_notice_crawl_at TEXT,
  manual_locked_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(university_id, name)
);

CREATE INDEX IF NOT EXISTS idx_catalog_colleges_uni ON catalog_colleges(university_id);
CREATE INDEX IF NOT EXISTS idx_catalog_colleges_health ON catalog_colleges(health_status);

-- ============================================================
-- 3. catalog_advisors 增量扩展（博导默认在招 + 质量门控 + 全文索引）
-- ============================================================

ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS college_id TEXT REFERENCES catalog_colleges(id) ON DELETE SET NULL;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS source_key TEXT;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS is_phd_supervisor BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS recruitment_status TEXT NOT NULL DEFAULT 'phd_default_open';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS recruitment_signal_note TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS extract_mode_used TEXT NOT NULL DEFAULT 'rule';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS needs_ai BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS quality_score INTEGER NOT NULL DEFAULT 80;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'auto_published';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS review_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS photo_storage_key TEXT NOT NULL DEFAULT '';
ALTER TABLE catalog_advisors ADD COLUMN IF NOT EXISTS manual_locked_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_catalog_advisors_source_key ON catalog_advisors(source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_college ON catalog_advisors(college_id);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_review ON catalog_advisors(review_status);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_recruit ON catalog_advisors(recruitment_status);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_tags_gin ON catalog_advisors USING GIN (research_tags);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_name_trgm ON catalog_advisors USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_dept_trgm ON catalog_advisors USING GIN (dept gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_advisors_bio_trgm ON catalog_advisors USING GIN (bio gin_trgm_ops);

-- ============================================================
-- 4. catalog_notices（公共博士招生与院系公告池）
-- ============================================================

CREATE TABLE IF NOT EXISTS catalog_notices (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL REFERENCES catalog_universities(id) ON DELETE CASCADE,
  college_id TEXT REFERENCES catalog_colleges(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT '',
  matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_markdown TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  deadline_at TEXT NOT NULL DEFAULT '',
  admission_type TEXT NOT NULL DEFAULT '',
  english_req TEXT NOT NULL DEFAULT '',
  extracted_advisor_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachment_storage_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending',
  linked_advisor_count INTEGER NOT NULL DEFAULT 0,
  crawled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_notices_uni ON catalog_notices(university_id);
CREATE INDEX IF NOT EXISTS idx_catalog_notices_college ON catalog_notices(college_id);
CREATE INDEX IF NOT EXISTS idx_catalog_notices_review ON catalog_notices(review_status);

-- ============================================================
-- 5. crawl_snapshots（网络抓取与规则/AI 解析解耦快照表）
-- ============================================================

CREATE TABLE IF NOT EXISTS crawl_snapshots (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL,
  university_id TEXT REFERENCES catalog_universities(id) ON DELETE CASCADE,
  college_id TEXT REFERENCES catalog_colleges(id) ON DELETE SET NULL,
  http_status INTEGER NOT NULL DEFAULT 0,
  etag TEXT NOT NULL DEFAULT '',
  last_modified TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  cleaned_markdown TEXT NOT NULL DEFAULT '',
  pruned_markdown TEXT NOT NULL DEFAULT '',
  extracted_json JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_category TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT,
  parsed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_snapshots_uni ON crawl_snapshots(university_id);
CREATE INDEX IF NOT EXISTS idx_crawl_snapshots_status ON crawl_snapshots(status);

-- ============================================================
-- 6. crawl_schedules / crawl_runs / crawl_run_logs（调度与运行日志）
-- ============================================================

CREATE TABLE IF NOT EXISTS crawl_schedules (
  id TEXT PRIMARY KEY,
  pipeline_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cron_expr TEXT NOT NULL,
  season_mode TEXT NOT NULL DEFAULT 'off_peak',
  off_peak_llm_only BOOLEAN NOT NULL DEFAULT TRUE,
  ai_mode TEXT NOT NULL DEFAULT 'rule_only',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  next_run_at TEXT,
  last_run_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT REFERENCES crawl_schedules(id) ON DELETE SET NULL,
  run_kind TEXT NOT NULL DEFAULT 'college_crawl',
  scope TEXT NOT NULL DEFAULT 'selected_entities',
  ai_mode TEXT NOT NULL DEFAULT 'rule_only',
  replay_snapshots_only BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'running',
  total_pages INTEGER NOT NULL DEFAULT 0,
  hash_skipped INTEGER NOT NULL DEFAULT 0,
  rule_parsed INTEGER NOT NULL DEFAULT 0,
  ai_calls INTEGER NOT NULL DEFAULT 0,
  notices_found INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost_cny DOUBLE PRECISION NOT NULL DEFAULT 0,
  actual_cost_cny DOUBLE PRECISION NOT NULL DEFAULT 0,
  summary TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_started ON crawl_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS crawl_run_logs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  error_category TEXT NOT NULL DEFAULT '',
  university_id TEXT,
  college_id TEXT,
  url TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_run_logs_run ON crawl_run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_crawl_run_logs_cat ON crawl_run_logs(error_category);

-- ============================================================
-- 7. ops_llm_keys / llm_usage_ledger / ops_rule_dictionaries / ops_guardrails_config / ops_audit_logs
-- ============================================================

CREATE TABLE IF NOT EXISTS ops_llm_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
  model TEXT NOT NULL DEFAULT 'deepseek-chat',
  encrypted_api_key TEXT NOT NULL,
  masked_key TEXT NOT NULL DEFAULT '',
  daily_budget_cny DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  monthly_budget_cny DOUBLE PRECISION NOT NULL DEFAULT 100.0,
  used_today_cny DOUBLE PRECISION NOT NULL DEFAULT 0,
  used_month_cny DOUBLE PRECISION NOT NULL DEFAULT 0,
  rpm_limit INTEGER NOT NULL DEFAULT 30,
  off_peak_only BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  exhausted_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_usage_ledger (
  id TEXT PRIMARY KEY,
  key_id TEXT REFERENCES ops_llm_keys(id) ON DELETE SET NULL,
  run_id TEXT REFERENCES crawl_runs(id) ON DELETE SET NULL,
  purpose TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cny DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_ledger(created_at DESC);

CREATE TABLE IF NOT EXISTS ops_rule_dictionaries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_guardrails_config (
  id TEXT PRIMARY KEY,
  default_ai_mode TEXT NOT NULL DEFAULT 'rule_only',
  monthly_budget_cny DOUBLE PRECISION NOT NULL DEFAULT 200.0,
  domain_concurrency INTEGER NOT NULL DEFAULT 1,
  domain_rps DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  circuit_breaker_threshold INTEGER NOT NULL DEFAULT 5,
  circuit_cooldown_min INTEGER NOT NULL DEFAULT 30,
  avatar_storage_mode TEXT NOT NULL DEFAULT 'official_url',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ops_audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'admin',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail_json JSONB,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_audit_created ON ops_audit_logs(created_at DESC);

-- ============================================================
-- 8. 幂等默认预置配置（Guardrails / 4 Schedules / 4 Dictionaries）
-- ============================================================

INSERT INTO ops_guardrails_config (
  id, default_ai_mode, monthly_budget_cny, domain_concurrency, domain_rps,
  circuit_breaker_threshold, circuit_cooldown_min, avatar_storage_mode, updated_at
)
VALUES (
  'default', 'rule_only', 200.0, 1, 1.0, 5, 30, 'official_url', CURRENT_TIMESTAMP::text
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO crawl_schedules (
  id, pipeline_key, name, description, cron_expr, season_mode, off_peak_llm_only, ai_mode, enabled, updated_at
)
VALUES
  ('sched-rank-sync', 'rank_sync', '软科排名与学科榜同步', '每季度同步软科中国大学排名(BCUR)与学科排名(BCSR)基线', '0 3 1 1,4,7,10 *', 'off_peak', TRUE, 'rule_only', FALSE, CURRENT_TIMESTAMP::text),
  ('sched-advisor-incr', 'advisor_incremental', '导师档案增量巡检', '按内容 SHA-256 哈希增量更新纳管学院师资信息，遵守手动字段锁', '0 2 * * 0', 'off_peak', TRUE, 'rule_only', FALSE, CURRENT_TIMESTAMP::text),
  ('sched-grad-notice', 'grad_school_notice', '研究生院招博简章监控', '监测各校研招网/研究生院发布的年度博士招生简章与专业目录', '0 7 * * 1,4', 'off_peak', TRUE, 'rule_only', FALSE, CURRENT_TIMESTAMP::text),
  ('sched-college-notice', 'college_notice', '二级学院通知公告巡检', '巡检学院通知栏，按日期锚点聚类 + 关键词词典提取博士考核/补录通知', '0 8 * * *', 'off_peak', TRUE, 'rule_only', FALSE, CURRENT_TIMESTAMP::text)
ON CONFLICT (pipeline_key) DO NOTHING;

INSERT INTO ops_rule_dictionaries (id, kind, name, entries, updated_at)
VALUES
  (
    'dict-honor-national',
    'honor_national',
    '国家级人才帽子词典',
    '["中国科学院院士","中国工程院院士","国家杰出青年","国家杰青","长江学者","国家优秀青年","国家优青","海外优青","万人计划","国家级领军人才","国家重点研发计划首席"]'::jsonb,
    CURRENT_TIMESTAMP::text
  ),
  (
    'dict-honor-provincial',
    'honor_provincial',
    '省部级 / 校级重要头衔词典',
    '["省学术和技术带头人","天府青城计划","江苏六大人才高峰","特聘教授","东方学者","珠江学者","楚天学者","泰山学者","青年拔尖人才","香江学者"]'::jsonb,
    CURRENT_TIMESTAMP::text
  ),
  (
    'dict-notice-whitelist',
    'notice_whitelist',
    '招博公告高价值白名单关键词',
    '["博士","直博","硕博连读","申请-考核","申请考核","少干","骨干计划","工程博士","补录","综合考核","招生简章","招生说明","博士研究生"]'::jsonb,
    CURRENT_TIMESTAMP::text
  ),
  (
    'dict-notice-blacklist',
    'notice_blacklist',
    '非招生杂务屏蔽词黑名单',
    '["采购","招标","中标","维修","工会","党日","党支部","党建","运动会","放假","值班","物业","后勤","食堂","报销","迎新","军训","秋游"]'::jsonb,
    CURRENT_TIMESTAMP::text
  )
ON CONFLICT (kind) DO NOTHING;
