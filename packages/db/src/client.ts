import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";
import { DEFAULT_POLICY_CONFIG } from "@app/shared";
import * as schema from "./schema.js";
import { encryptSecret } from "./crypto.js";

const { Pool } = pg;

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

// 自动加载工作区根目录 .env（Node 22+ 原生支持）
const rootEnvPath = path.join(WORKSPACE_ROOT, ".env");
if (fs.existsSync(rootEnvPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(rootEnvPath);
  } catch {
    // 已注入的环境变量或可选格式问题直接忽略
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

export function getAdvisorPhotosDir(): string {
  const dir = path.join(getStorageRoot(), "advisor-photos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const DATABASE_URL = (
  process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/phd_advisor_v2"
).trim();

// 全局共享 PostgreSQL 17 连接池（One-DB 架构唯一连接入口）
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 16,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 8_000,
});

export const db = drizzle(pool, { schema });

/**
 * 类型安全的单行查询辅助函数，统一替代 Drizzle SQLite 时代遗留的 `.get()` 调用。
 */
export async function firstOrNull<T>(query: Promise<T[]>): Promise<T | undefined> {
  const rows = await query;
  return rows[0];
}

const INIT_SQL_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../sql/0001_init.sql"
);

let initPromise: Promise<void> | null = null;

/**
 * 初始化 PostgreSQL 17 扩展、全量表结构与初始演示数据（幂等可重入）。
 */
export async function ensureSchema(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const client = await pool.connect();
      // 跨进程咨询锁：防止 worker-api 与 cloud-core 并发启动时同时执行 DDL/初始化引发死锁
      await client.query("SELECT pg_advisory_lock(98245101)");
      try {
        const initSql = fs.readFileSync(INIT_SQL_PATH, "utf8");
        await client.query(initSql);
        await seedCatalogIfEmpty();
        await seedIfEmpty();
      } finally {
        await client.query("SELECT pg_advisory_unlock(98245101)").catch(() => {});
        client.release();
      }
    })();
  }
  return initPromise;
}

/**
 * 若公共软科导师库为空，写入 3 所示范高校与 3 位高质量预置导师档案（幂等）。
 */
export async function seedCatalogIfEmpty(): Promise<{
  seuCatAdvId: string;
  swpuCatAdvId: string;
  thuCatAdvId: string;
}> {
  const existing = await db.select().from(schema.catalogUniversities);
  const existingAdvs = await db.select().from(schema.catalogAdvisors);
  if (existing.length > 0 && existingAdvs.length > 0) {
    const yang = existingAdvs.find((a) => a.name === "杨波") || existingAdvs[0];
    const wang = existingAdvs.find((a) => a.name === "王杨") || existingAdvs[1] || existingAdvs[0];
    const zhang = existingAdvs.find((a) => a.name === "张博文") || existingAdvs[2] || existingAdvs[0];
    return {
      seuCatAdvId: yang.id,
      swpuCatAdvId: wang.id,
      thuCatAdvId: zhang.id,
    };
  }

  const now = new Date().toISOString();
  const seuId = "uni-seu";
  const swpuId = "uni-swpu";
  const thuId = "uni-thu";

  if (existing.length === 0) {
    await db.insert(schema.catalogUniversities).values([
      {
        id: seuId,
        name: "东南大学",
        shortName: "东大",
        softScienceRank: 16,
        rankTier: "top20",
        disciplineRankNote: "仪器 A+",
        facultyPortalUrl: "https://automation.seu.edu.cn",
        admissionUrl: "https://yzb.seu.edu.cn",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: swpuId,
        name: "西南石油大学",
        shortName: "西南石大",
        softScienceRank: 148,
        rankTier: "double",
        disciplineRankNote: "行业特色重点 · 省工程中心",
        facultyPortalUrl: "https://www.swpu.edu.cn/scs/",
        admissionUrl: "https://www.swpu.edu.cn/gs/",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: thuId,
        name: "清华大学",
        shortName: "清华",
        softScienceRank: 1,
        rankTier: "top20",
        disciplineRankNote: "计算机 A+",
        facultyPortalUrl: "https://www.cs.tsinghua.edu.cn",
        admissionUrl: "https://yz.tsinghua.edu.cn",
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  const seuCatAdvId = "cat-adv-seu-yangbo";
  const swpuCatAdvId = "cat-adv-swpu-wangyang";
  const thuCatAdvId = "cat-adv-thu-zhangbowen";

  if (existingAdvs.length === 0) {
    await db.insert(schema.catalogAdvisors).values([
      {
        id: seuCatAdvId,
        universityId: seuId,
        name: "杨波",
        dept: "仪器科学与工程学院",
        title: "教授 · 博导",
        honorBadge: "江苏六大人才高峰",
        honorCategory: "provincial",
        bio: "东南大学博士 · 美国密歇根大学博后 · NUS 高级访问学者",
        researchTags: ["智能微系统", "脑机接口", "MEMS 传感芯片"],
        email: "yangbo20022002@163.com",
        homepageUrl: "https://automation.seu.edu.cn",
        photoUrl: "",
        photoSource: "",
        kpiOutputsHero: "论文 100+ 篇 (SCI/EI 60+)",
        kpiOutputsNote: "科研产出（公开主页 / OpenAlex）",
        kpiGrantsHero: "国自然 4 项 · 专利 40+ · 省部二等奖",
        kpiGrantsNote: "课题专利与重要荣誉",
        kpiQuotaHero: "博士 1-2 人 / 年",
        kpiQuotaNote: "博士招生名额",
        recruitOpen: true,
        footerNote: "明确招博 · 助研津贴近期涨薪 · 欢迎仪器 / 电子 / 自动化 / 物理交叉",
        defaultFitScore: 95,
        sourceUpdatedAt: "2026-05",
        crawledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: swpuCatAdvId,
        universityId: swpuId,
        name: "王杨",
        dept: "计算机与软件学院",
        title: "二级教授 · 博导",
        honorBadge: "天府青城计划教育领军人才",
        honorCategory: "provincial",
        bio: "1980 年生 · 四川省数智先锋 · 教育部高校计算与智能教指委委员",
        researchTags: ["能源人工智能", "低空大数据", "智能计算"],
        email: "wangyang@swpu.edu.cn",
        homepageUrl: "https://www.swpu.edu.cn/scs/",
        photoUrl: "",
        photoSource: "",
        kpiOutputsHero: "论文 50+ 篇 · 专著教材 4 部",
        kpiOutputsNote: "科研产出（公开主页 / OpenAlex）",
        kpiGrantsHero: "专利 28 项 · 国家教学一等奖 ×2",
        kpiGrantsNote: "课题专利与重要荣誉",
        kpiQuotaHero: "常规招博（主页未注人数）",
        kpiQuotaNote: "博士招生名额",
        recruitOpen: false,
        footerNote: "常规在招 · 建议发信附带研究设想核实明年博士指标",
        defaultFitScore: 88,
        sourceUpdatedAt: "2026-05",
        crawledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: thuCatAdvId,
        universityId: thuId,
        name: "张博文",
        dept: "计算机科学与技术系",
        title: "准聘副教授 · 博导",
        honorBadge: "国家海外优青",
        honorCategory: "national",
        bio: "清华大学博士 · MIT CSAIL 访问学者 · ACM SIGCHI 最佳论文提名",
        researchTags: ["人智协同", "具身智能", "可解释交互"],
        email: "zhangbw@example.edu.cn",
        homepageUrl: "https://www.cs.tsinghua.edu.cn",
        photoUrl: "",
        photoSource: "",
        kpiOutputsHero: "顶会 28 篇 (CHI / NeurIPS / UIST)",
        kpiOutputsNote: "科研产出（公开主页 / OpenAlex）",
        kpiGrantsHero: "国自然优青 1 项 · 重点研发子课题",
        kpiGrantsNote: "课题专利与重要荣誉",
        kpiQuotaHero: "2027 秋 拟招 2 名博士",
        kpiQuotaNote: "博士招生名额",
        recruitOpen: true,
        footerNote: "明确招博 · 偏重多模态传感器与人机系统交叉背景（预置演示）",
        defaultFitScore: 84,
        sourceUpdatedAt: "2026-06",
        crawledAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  return { seuCatAdvId, swpuCatAdvId, thuCatAdvId };
}

/**
 * 首次冷启动时写入本地默认账户、V3.2 结构化科研履历及初始预收录导师，保证各页面开箱可用。
 */
export async function seedIfEmpty(): Promise<void> {
  const existingUser = await firstOrNull(
    db.select().from(schema.users).where(eq(schema.users.id, LOCAL_USER_ID)).limit(1)
  );
  if (existingUser) return;

  const { seuCatAdvId, swpuCatAdvId } = await seedCatalogIfEmpty();
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
    name: "林致远（示例）",
    affiliation: "哈尔滨工业大学",
    degreeInfo: "2024级电子信息工程硕士在读",
    researchSummary:
      "硕士阶段聚焦多模态微型传感信号处理与低功耗边缘神经解码，具备从 MEMS 微弱信号前端采集、FPGA/嵌入式硬件联调到深度学习模型压缩的全链路研究经验。",
    phone: "138-0000-8899",
    wechat: "linzy_research",
    homepageUrl: "https://scholar.google.com/",
    publications: [
      {
        id: "pub-1",
        title: "Adaptive Drift Calibration for Flexible Piezoresistive Micro-Sensor Arrays",
        venue: "IEEE Sensors Journal (SCI Q1)",
        year: "2025",
        authorOrder: "第一作者",
        status: "已录用",
        kind: "paper",
        injectToAi: true,
        summary: "提出温度与时间漂移自适应补偿算法，将微弱压力传感零点漂移降低 64%。",
      },
      {
        id: "pub-2",
        title: "Lightweight Temporal Convolution for Portable sEMG Gesture Decoding",
        venue: "Biomedical Signal Processing and Control",
        year: "2024",
        authorOrder: "第二作者",
        status: "已发表",
        kind: "paper",
        injectToAi: true,
        summary: "在 8 通道穿戴式表面肌电硬件上实现 <12ms 低延迟端侧手势识别。",
      },
      {
        id: "pub-3",
        title: "一种面向脑机微弱信号采集的低噪声差分放大电路",
        venue: "国家发明专利 CN11820412A",
        year: "2025",
        authorOrder: "学生第一发明人",
        status: "实质审查中",
        kind: "patent",
        injectToAi: false,
        summary: "完成 ASIC 前端低噪模拟电路设计与仿真验证。",
      },
    ],
    projects: [
      {
        id: "proj-1",
        name: "穿戴式多通道微弱生理电与惯性融合采集节点研发",
        role: "课题核心骨干",
        period: "2024.09 - 至今",
        summary: "主导硬件 PCB 抗干扰叠层设计、嵌入式 DMA 采集固件及端侧神经解码部署。",
      },
    ],
    methodsSkills: ["MEMS 信号调理", "嵌入式 FPGA", "PyTorch", "多模态融合", "脑机解码"],
    targetDirections: ["智能微系统", "脑机接口", "MEMS 传感芯片", "智能计算"],
    cvParsedText: "",
    educationHistory: [
      {
        id: "edu-1",
        school: "哈尔滨工业大学",
        degree: "工学硕士",
        major: "电子信息（集成电路工程方向）",
        period: "2024.09 - 2027.06",
        gpa: "3.86 / 4.0",
        rankNote: "专业前 5%（3 / 62）",
        isPrimary: true,
      },
      {
        id: "edu-2",
        school: "南京理工大学",
        degree: "工学学士",
        major: "测控技术与仪器",
        period: "2020.09 - 2024.06",
        gpa: "3.91 / 4.0",
        rankNote: "推免保研（年级第 4）",
        isPrimary: false,
      },
    ],
    languageScores: "CET-6 588 · IELTS 7.0（R 8.0 / L 7.5）",
    competitions: [
      {
        id: "comp-1",
        name: "中国研究生电子设计竞赛（研电赛）",
        award: "全国一等奖",
        year: "2025",
        role: "队长 · 负责微系统前端与算法",
        note: "基于 MEMS 惯性阵列与轻量解码网络完成穿戴交互样机。",
      },
      {
        id: "comp-2",
        name: "全国大学生电子设计竞赛",
        award: "全国二等奖",
        year: "2023",
        role: "硬件与控制组长",
        note: "信号采样前端与 PID 闭环控制。",
      },
    ],
    honors: [
      {
        id: "honor-1",
        title: "研究生国家奖学金",
        issuer: "中华人民共和国教育部",
        year: "2025",
        level: "国家级",
      },
      {
        id: "honor-2",
        title: "黑龙江省三好学生",
        issuer: "黑龙江省教育厅",
        year: "2024",
        level: "省部级",
      },
    ],
    wechatQrPath: "",
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

  const seuInstId = crypto.randomUUID();
  const swpuInstId = crypto.randomUUID();
  await db.insert(schema.institutions).values([
    {
      id: seuInstId,
      userId: LOCAL_USER_ID,
      name: "东南大学",
      shortName: "东大",
      department: "仪器科学与工程学院",
      facultyListUrl: "https://automation.seu.edu.cn",
      admissionUrl: "https://yzb.seu.edu.cn",
      deadlineAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: swpuInstId,
      userId: LOCAL_USER_ID,
      name: "西南石油大学",
      shortName: "西南石大",
      department: "计算机与软件学院",
      facultyListUrl: "https://www.swpu.edu.cn/scs/",
      admissionUrl: "https://www.swpu.edu.cn/gs/",
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
      institutionId: seuInstId,
      catalogAdvisorId: seuCatAdvId,
      name: "杨波",
      dept: "仪器科学与工程学院",
      title: "教授 · 博导",
      honorBadge: "江苏六大人才高峰",
      email: "yangbo20022002@163.com",
      homepageUrl: "https://automation.seu.edu.cn",
      scholarUrl: "",
      avatarSeed: "东南大学::杨波",
      photoUrl: "",
      photoSource: "",
      researchTags: ["智能微系统", "脑机接口", "MEMS 传感芯片"],
      researchSummary:
        "东南大学博士、密歇根大学博后、NUS 高级访问学者。聚焦智能微系统、脑机接口信号前端调理与 MEMS 传感芯片，累计发表论文 100+ 篇，主持国自然 4 项。",
      representativeWorks: [
        {
          title: "Low-Drift MEMS Inertial & Biopotential Micro-System Integration",
          venue: "IEEE Sensors Journal",
          year: "2025",
        },
      ],
      recruitmentSignal: {
        status: "博士 1-2 人 / 年（明确招博）",
        year: "2026",
        note: "助研津贴近期涨薪 · 欢迎仪器 / 电子 / 自动化 / 物理交叉",
      },
      matchTier: "perfect",
      matchScore: 95,
      stage: "replied",
      inBatch: true,
      assignedAccountId: "auto",
      hookNote:
        "结合我在 MEMS 微弱信号漂移自适应校准和端侧生理电解码上的实验积累，重点呼应老师智能微系统与脑机前端课题。",
      userNotes: "示范收录导师档案：可直接去写信或查看往来动态与阅读停留数据。",
      replyNote: "[示例回信] 欢迎报考，可先发一份完整成绩单与研究设想，下周可约 20 分钟线上交流。",
      trackSummary: "在线简历点击 1 次 · 累计阅读 48s",
      aiInsights: {
        summary: "研究技术栈与传感器信号前端调理方向高度契合，建议列为第一志愿核心沟通对象。",
        directionFit: "申请人 MEMS 漂移补偿与微弱生理电采集经验直接覆盖课题组核心在研方向。",
        methodFit: "具备 PCB/FPGA 硬件前端 + 轻量化端侧解码闭环能力，进组即可开展实验。",
        recommendedHooks: [
          "结合 IEEE Sensors Journal 一作工作讨论高信噪比微系统温漂抑制问题",
          "附上穿戴式采集节点工程实测数据与开源测试指标",
          "咨询 2027 秋季博士生入组后的传感芯片与神经接口联合培养安排",
        ],
        riskFlags: ["首次发送外链前请先确认学校邮箱与个人简历均已更新至最新版本"],
        updatedAt: now,
      },
      lastSentAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: adv2Id,
      userId: LOCAL_USER_ID,
      institutionId: swpuInstId,
      catalogAdvisorId: swpuCatAdvId,
      name: "王杨",
      dept: "计算机与软件学院",
      title: "二级教授 · 博导",
      honorBadge: "天府青城计划教育领军人才",
      email: "wangyang@swpu.edu.cn",
      homepageUrl: "https://www.swpu.edu.cn/scs/",
      scholarUrl: "",
      avatarSeed: "西南石油大学::王杨",
      photoUrl: "",
      photoSource: "",
      researchTags: ["能源人工智能", "低空大数据", "智能计算"],
      researchSummary:
        "二级教授、四川省数智先锋、教育部高校计算与智能教指委委员。长期聚焦能源人工智能、低空大数据与智能计算架构。",
      representativeWorks: [],
      recruitmentSignal: {
        status: "常规招博（建议来信核实名额）",
        year: "2026",
        note: "建议发信附带研究设想核实明年博士指标",
      },
      matchTier: "high",
      matchScore: 88,
      stage: "drafting",
      inBatch: true,
      assignedAccountId: "auto",
      hookNote: "围绕边缘轻量化智能计算与工业物联网异常检测模型迁移展开探讨。",
      userNotes: "可在「写信工坊」打开右侧 AI 助手生成针对性套磁初稿。",
      replyNote: "",
      trackSummary: "",
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
      subject: "【博士申请自荐】— 林致远（哈尔滨工业大学 · 仪器/智能微系统方向）",
      body: `尊敬的杨波老师：\n\n您好！冒昧给您写信。我是哈尔滨工业大学 2024 级电子信息工程在读硕士林致远，此前仔细学习了您课题组在智能微系统、脑机接口前端调理及 MEMS 传感芯片方向的工作，对您在微弱信号抗干扰与系统级集成上的研究布局非常向往。\n\n硕士期间我主要围绕柔性微传感器漂移校准与便携式生理电信号端侧解码开展工作，目前已在 IEEE Sensors Journal 录用一作论文 1 篇（解决温度与时间漂移问题），并获中国研电赛全国一等奖。随信附上个人简历与简要成果汇总，不知您课题组今年是否仍有博士招生名额？若您方便，非常希望能有机会向您简要汇报近期实验进展。\n\n感谢您拨冗阅读，期待您的回复！\n\n此致\n敬礼！`,
      selectedHook:
        "结合我在 MEMS 微弱信号漂移自适应校准和端侧生理电解码上的实验积累，重点呼应老师智能微系统与脑机前端课题。",
      resumeId: null,
      preferredAccountId: "auto",
      templateStyle: "editorial",
      embedContactCard: true,
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
      templateStyle: "editorial",
      embedContactCard: true,
      updatedAt: now,
    },
  ]);

  // 为预收录导师创建初始 AI 多会话记录与演示往来动态/追踪记录
  const sess1Id = crypto.randomUUID();
  const sess2Id = crypto.randomUUID();
  await db.insert(schema.aiSessions).values([
    {
      id: sess1Id,
      userId: LOCAL_USER_ID,
      advisorId: adv1Id,
      title: "首封自荐与回信跟进",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: sess2Id,
      userId: LOCAL_USER_ID,
      advisorId: adv2Id,
      title: "默认写作会话",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const outMsgId = crypto.randomUUID();
  const inMsgId = crypto.randomUUID();
  await db.insert(schema.mailMessages).values([
    {
      id: outMsgId,
      userId: LOCAL_USER_ID,
      advisorId: adv1Id,
      mailAccountId: null,
      direction: "outbound",
      fromName: "林致远（示例）",
      fromEmail: "linzy@example.edu.cn",
      toEmail: "yangbo20022002@163.com",
      subject: "【博士申请自荐】— 林致远（哈尔滨工业大学 · 仪器/智能微系统方向）",
      body: "您好！我是哈尔滨工业大学 2024 级硕士生林致远，专注于微弱传感漂移校准与脑机信号前端调理，随信附上个人简历（示例记录）。",
      attachments: ["林致远_博士申请简历.pdf"],
      messageId: `<seed-out-${outMsgId}@phd-cue.local>`,
      inReplyTo: "",
      referencesHeader: "",
      isUnread: false,
      replyIntent: null,
      extractedTodos: [],
      sentOrReceivedAt: new Date(Date.now() - 86_400_000).toISOString(),
    },
    {
      id: inMsgId,
      userId: LOCAL_USER_ID,
      advisorId: adv1Id,
      mailAccountId: null,
      direction: "inbound",
      fromName: "杨波",
      fromEmail: "yangbo20022002@163.com",
      toEmail: "linzy@example.edu.cn",
      subject: "Re: 【博士申请自荐】— 林致远（哈尔滨工业大学 · 仪器/智能微系统方向）",
      body: "林同学你好，简历已看过，你的 MEMS 漂移校准工作与我们近期脑机微系统课题比较相关。请方便时补发一下本硕完整成绩单以及 1 页简要研究设想，下周可约个时间线上交流。",
      attachments: [],
      messageId: `<seed-in-${inMsgId}@phd-cue.local>`,
      inReplyTo: `<seed-out-${outMsgId}@phd-cue.local>`,
      referencesHeader: `<seed-out-${outMsgId}@phd-cue.local>`,
      isUnread: false,
      replyIntent: "positive_interview",
      extractedTodos: ["发送本硕完整成绩单", "补充 1 页研究设想并确认线上交流时间"],
      sentOrReceivedAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ]);

  const resumeLinkId = crypto.randomUUID();
  const pixelLinkId = crypto.randomUUID();
  await db.insert(schema.trackingLinks).values([
    {
      id: resumeLinkId,
      token: `demo_res_${crypto.randomBytes(6).toString("hex")}`,
      userId: LOCAL_USER_ID,
      advisorId: adv1Id,
      mailMessageId: outMsgId,
      kind: "resume_pdf",
      targetResumeId: null,
      createdAt: now,
    },
    {
      id: pixelLinkId,
      token: `demo_px_${crypto.randomBytes(6).toString("hex")}`,
      userId: LOCAL_USER_ID,
      advisorId: adv1Id,
      mailMessageId: outMsgId,
      kind: "pixel",
      targetResumeId: null,
      createdAt: now,
    },
  ]);

  await db.insert(schema.trackingEvents).values([
    {
      id: crypto.randomUUID(),
      linkId: resumeLinkId,
      eventType: "click",
      durationSec: 48,
      isSuspectedBot: false,
      userAgent: "Mozilla/5.0",
      ipHash: "seed-demo",
      createdAt: new Date(Date.now() - 72_000_000).toISOString(),
    },
    {
      id: crypto.randomUUID(),
      linkId: pixelLinkId,
      eventType: "pixel_open",
      durationSec: 0,
      isSuspectedBot: false,
      userAgent: "Mozilla/5.0",
      ipHash: "seed-demo",
      createdAt: new Date(Date.now() - 75_000_000).toISOString(),
    },
  ]);
}
