import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import { DEFAULT_POLICY_CONFIG } from "@app/shared";
import * as schema from "./schema.js";
import { encryptSecret } from "./crypto.js";

export const LOCAL_USER_ID = "local-user";

export function findWorkspaceRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  let cur = path.dirname(thisFile);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(cur, "pnpm-workspace.yaml"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return process.cwd();
}

export const WORKSPACE_ROOT = findWorkspaceRoot();

// Load .env from workspace root if present (Node 22+ built-in loader)
const rootEnvPath = path.join(WORKSPACE_ROOT, ".env");
if (fs.existsSync(rootEnvPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(rootEnvPath);
  } catch {
    // Ignore already-set or malformed optional env lines
  }
}

export function getStorageRoot(): string {
  const dir = process.env.STORAGE_DIR
    ? path.resolve(WORKSPACE_ROOT, process.env.STORAGE_DIR)
    : path.join(WORKSPACE_ROOT, "storage");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getResumesDir(): string {
  const dir = path.join(getStorageRoot(), "resumes");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveSqliteUrl(): string {
  const raw = (process.env.SQLITE_PATH || "").trim();
  const absPath = raw
    ? path.isAbsolute(raw)
      ? raw
      : path.resolve(WORKSPACE_ROOT, raw)
    : path.join(getStorageRoot(), "dev.db");
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  return pathToFileURL(absPath).href;
}

export const client = createClient({
  url: resolveSqliteUrl(),
});

export const db = drizzle(client, { schema });

let initPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await client.executeMultiple(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;

        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL DEFAULT '',
          role TEXT NOT NULL DEFAULT 'user',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

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
          publications TEXT NOT NULL DEFAULT '[]',
          projects TEXT NOT NULL DEFAULT '[]',
          methods_skills TEXT NOT NULL DEFAULT '[]',
          target_directions TEXT NOT NULL DEFAULT '[]',
          cv_parsed_text TEXT NOT NULL DEFAULT '',
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
          name TEXT NOT NULL,
          dept TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          homepage_url TEXT NOT NULL DEFAULT '',
          scholar_url TEXT NOT NULL DEFAULT '',
          avatar_seed TEXT NOT NULL,
          research_tags TEXT NOT NULL DEFAULT '[]',
          research_summary TEXT NOT NULL DEFAULT '',
          representative_works TEXT NOT NULL DEFAULT '[]',
          recruitment_signal TEXT,
          match_tier TEXT NOT NULL DEFAULT 'high',
          match_score INTEGER,
          stage TEXT NOT NULL DEFAULT 'drafting',
          in_batch INTEGER NOT NULL DEFAULT 1,
          assigned_account_id TEXT NOT NULL DEFAULT 'auto',
          hook_note TEXT NOT NULL DEFAULT '',
          user_notes TEXT NOT NULL DEFAULT '',
          reply_note TEXT NOT NULL DEFAULT '',
          ai_insights TEXT,
          research_embedding TEXT,
          last_sent_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_advisors_institution ON advisors(institution_id);
        CREATE INDEX IF NOT EXISTS idx_advisors_stage ON advisors(stage);
        CREATE INDEX IF NOT EXISTS idx_advisors_email ON advisors(email);

        CREATE TABLE IF NOT EXISTS resumes (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          storage_path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          parsed_text TEXT NOT NULL DEFAULT '',
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS outreach_drafts (
          id TEXT PRIMARY KEY,
          advisor_id TEXT NOT NULL UNIQUE REFERENCES advisors(id) ON DELETE CASCADE,
          subject TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          selected_hook TEXT NOT NULL DEFAULT '',
          resume_id TEXT REFERENCES resumes(id) ON DELETE SET NULL,
          preferred_account_id TEXT NOT NULL DEFAULT 'auto',
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
          enabled INTEGER NOT NULL DEFAULT 1,
          note TEXT NOT NULL DEFAULT '',
          last_test_result TEXT,
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
          attachments TEXT NOT NULL DEFAULT '[]',
          message_id TEXT NOT NULL DEFAULT '',
          in_reply_to TEXT NOT NULL DEFAULT '',
          references_header TEXT NOT NULL DEFAULT '',
          is_unread INTEGER NOT NULL DEFAULT 0,
          reply_intent TEXT,
          extracted_todos TEXT NOT NULL DEFAULT '[]',
          sent_or_received_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mail_messages_advisor ON mail_messages(advisor_id);
        CREATE INDEX IF NOT EXISTS idx_mail_messages_mid ON mail_messages(message_id);

        CREATE TABLE IF NOT EXISTS dispatch_jobs (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          mode TEXT NOT NULL DEFAULT 'send',
          status TEXT NOT NULL DEFAULT 'running',
          stop_requested INTEGER NOT NULL DEFAULT 0,
          scheduled_start_at TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          total INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          succeeded INTEGER NOT NULL DEFAULT 0,
          failed INTEGER NOT NULL DEFAULT 0,
          logs TEXT NOT NULL DEFAULT '[]'
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

        CREATE TABLE IF NOT EXISTS ai_conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          advisor_id TEXT NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
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

        CREATE TABLE IF NOT EXISTS app_settings (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          policy_config TEXT NOT NULL,
          ai_provider TEXT NOT NULL DEFAULT 'deepseek',
          ai_base_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com',
          ai_model TEXT NOT NULL DEFAULT 'deepseek-chat',
          encrypted_ai_api_key TEXT NOT NULL DEFAULT '',
          preferences TEXT NOT NULL,
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
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS watch_events (
          id TEXT PRIMARY KEY,
          watch_target_id TEXT NOT NULL REFERENCES watch_targets(id) ON DELETE CASCADE,
          diff_summary TEXT NOT NULL DEFAULT '',
          ai_significance TEXT NOT NULL DEFAULT '',
          is_read INTEGER NOT NULL DEFAULT 0,
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
          revoked INTEGER NOT NULL DEFAULT 0,
          last_active_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credit_accounts (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          balance REAL NOT NULL DEFAULT 999999,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credit_ledger (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          delta REAL NOT NULL,
          reason TEXT NOT NULL,
          request_id TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        );

        -- 管理员 Prompt 模板与版本历史表（仅由 cloud-core 管理员接口维护）
        CREATE TABLE IF NOT EXISTS prompt_templates (
          id TEXT PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL,
          variables TEXT NOT NULL DEFAULT '[]',
          temperature REAL NOT NULL DEFAULT 0.6,
          max_output_tokens INTEGER NOT NULL DEFAULT 2048,
          active_version INTEGER NOT NULL DEFAULT 1,
          is_enabled INTEGER NOT NULL DEFAULT 1,
          updated_by TEXT NOT NULL DEFAULT 'system',
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS prompt_revisions (
          id TEXT PRIMARY KEY,
          prompt_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
          version INTEGER NOT NULL,
          content TEXT NOT NULL,
          temperature REAL NOT NULL DEFAULT 0.6,
          max_output_tokens INTEGER NOT NULL DEFAULT 2048,
          change_note TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL DEFAULT 'system',
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_prompt_revisions_prompt ON prompt_revisions(prompt_id);
      `);
      await seedIfEmpty();
    })();
  }
  return initPromise;
}

export async function seedIfEmpty(): Promise<void> {
  const existingUser = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, LOCAL_USER_ID))
    .get();

  if (existingUser) return;

  const now = new Date().toISOString();
  const envKey = (process.env.DEEPSEEK_API_KEY || "").trim();

  await db.insert(schema.users).values({
    id: LOCAL_USER_ID,
    email: "local@phd-workbench.dev",
    displayName: "本地申请者",
    role: "user",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(schema.applicantProfiles).values({
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    name: "",
    affiliation: "",
    degreeInfo: "",
    researchSummary: "",
    phone: "",
    wechat: "",
    homepageUrl: "",
    publications: [],
    projects: [],
    methodsSkills: [],
    targetDirections: [],
    cvParsedText: "",
    updatedAt: now,
  });

  await db.insert(schema.appSettings).values({
    userId: LOCAL_USER_ID,
    policyConfig: { ...DEFAULT_POLICY_CONFIG },
    aiProvider: (process.env.AI_PROVIDER || "deepseek").trim(),
    aiBaseUrl: (process.env.AI_BASE_URL || "https://api.deepseek.com").trim(),
    aiModel: (process.env.AI_MODEL || "deepseek-chat").trim(),
    encryptedAiApiKey: envKey ? encryptSecret(envKey) : "",
    preferences: {
      avatarStyle: "facehash",
      defaultResumeId: null,
      quotaResetAfter: "",
    },
    lastMailSyncAt: "",
    updatedAt: now,
  });

  await db.insert(schema.creditAccounts).values({
    userId: LOCAL_USER_ID,
    balance: 999999,
    updatedAt: now,
  });

  // Seed 2 polished sample institutions & advisors so the UI renders with editorial richness on first boot
  const fudanId = crypto.randomUUID();
  const zjuId = crypto.randomUUID();
  await db.insert(schema.institutions).values([
    {
      id: fudanId,
      userId: LOCAL_USER_ID,
      name: "复旦大学",
      shortName: "复旦",
      department: "计算机科学技术学院",
      facultyListUrl: "",
      admissionUrl: "",
      deadlineAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: zjuId,
      userId: LOCAL_USER_ID,
      name: "浙江大学",
      shortName: "浙大",
      department: "传媒与国际文化学院",
      facultyListUrl: "",
      admissionUrl: "",
      deadlineAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const adv1Id = crypto.randomUUID();
  const adv2Id = crypto.randomUUID();

  await db.insert(schema.advisors).values([
    {
      id: adv1Id,
      userId: LOCAL_USER_ID,
      institutionId: fudanId,
      name: "陈启明（示例）",
      dept: "计算机科学技术学院",
      title: "教授 / 博导",
      email: "qiming.chen@example.edu.cn",
      homepageUrl: "https://example.edu.cn/faculty/chen",
      scholarUrl: "",
      avatarSeed: "复旦大学::陈启明",
      researchTags: ["人机交互", "AI Agent", "科研工作流"],
      researchSummary:
        "聚焦人智协同系统（Human-AI Collaboration）、智能体交互界面及知识工作流自动化，近年来在 CHI / UIST 发表多篇论文。",
      representativeWorks: [
        {
          title: "Designing Tactile Agent Interfaces for Academic Workflows",
          venue: "CHI",
          year: "2025",
        },
      ],
      recruitmentSignal: {
        status: "2026 秋季拟招 1-2 名博士生",
        year: "2026",
        note: "演示数据：可直接在页面中修改、写信测试或删除",
      },
      matchTier: "perfect",
      matchScore: 92,
      stage: "drafting",
      inBatch: true,
      assignedAccountId: "auto",
      hookNote: "结合我在人机交互系统与 LLM 工具编排上的工作，重点呼应老师 CHI25 关于可控智能体界面的思路。",
      userNotes: "演示导师档案：右上角点击「档案与分析」可查看结构化 AI 洞察卡片。",
      replyNote: "",
      aiInsights: {
        summary: "研究方向与技术栈高度贴合，适合作为第一梯队重点套磁对象。",
        directionFit: "人机交互与智能体工作流方向完全契合，切入视角明确。",
        methodFit: "具备全栈系统原型实现与用户研究背景，具备立即进组产出能力。",
        recommendedHooks: [
          "针对老师 CHI25 论文中提出的“用户可控 AI 边界”问题，补充个人工程实现思考",
          "附上过往系统原型 Demo 链接，突出工程落地与实验验证双能力",
          "表达对课题组“以人为本的智能工作台”方向的长期学术兴趣",
        ],
        riskFlags: ["当前为内置演示邮箱（example.edu.cn），发信前请替换为真实导师邮箱"],
        updatedAt: now,
      },
      lastSentAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: adv2Id,
      userId: LOCAL_USER_ID,
      institutionId: zjuId,
      name: "林静怡（示例）",
      dept: "数字传播研究所",
      title: "研究员 / 博导",
      email: "jingyi.lin@example.edu.cn",
      homepageUrl: "",
      scholarUrl: "",
      avatarSeed: "浙江大学::林静怡",
      researchTags: ["计算传播", "生成式媒介", "数字人文"],
      researchSummary:
        "关注计算传播学、大模型内容生态治理与数字人文文本挖掘，长期招收具有跨学科背景的博士生。",
      representativeWorks: [],
      recruitmentSignal: null,
      matchTier: "high",
      matchScore: 81,
      stage: "drafting",
      inBatch: true,
      assignedAccountId: "auto",
      hookNote: "",
      userNotes: "演示导师档案：你可以尝试点击左上角「AI 导表」导入真实目标高校师资。",
      replyNote: "",
      aiInsights: null,
      lastSentAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(schema.outreachDrafts).values([
    {
      id: crypto.randomUUID(),
      advisorId: adv1Id,
      subject: "【博士申请自荐】关于人智协同工作台方向的咨询与汇报",
      body: `尊敬的陈启明老师：\n\n您好！冒昧给您写信。此前仔细拜读了您课题组在人智协同界面与知识工作流方向的近期工作，尤其对“如何让 AI Agent 保持透明可控”的探讨印象深刻。\n\n我在硕士阶段围绕交互式智能系统完成了一系列原型构建与实证研究，具备从前端交互到后端编排的独立科研工程能力。\n\n随信附上个人简历，不知您课题组今年是否有博士招生计划？若您方便，非常希望能有机会向您简要汇报近期工作。感谢您拨冗阅读！\n\n此致\n敬礼！`,
      selectedHook: "结合我在人机交互系统与 LLM 工具编排上的工作，重点呼应老师 CHI25 关于可控智能体界面的思路。",
      resumeId: null,
      preferredAccountId: "auto",
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      advisorId: adv2Id,
      subject: "",
      body: "",
      selectedHook: "",
      resumeId: null,
      preferredAccountId: "auto",
      updatedAt: now,
    },
  ]);
}
