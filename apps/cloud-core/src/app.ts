import crypto from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  AiChatRequestSchema,
  AiExtractRequestSchema,
  MatchTierSchema,
  type ApplicantProfile,
} from "@app/shared";
import {
  and,
  asc,
  db,
  encryptSecret,
  eq,
  LOCAL_USER_ID,
  schema,
} from "@app/db";
import {
  extractJsonObject,
  formatFriendlyAiError,
  resolveAiRuntime,
} from "./ai/provider.js";
import { buildProfileContextBlock } from "./ai/prompts.js";
import { getActivePrompt, renderPrompt } from "./prompts/registry.js";
import { createAdminPromptRoutes } from "./prompts/routes.js";
import { fetchWebpageMarkdown } from "./scraper/light-fetch.js";

const CopilotOutputSchema = z.object({
  reply: z.string().describe("给用户的简短中文说明或建议（1~3句话）"),
  suggestedSubject: z
    .string()
    .describe("建议的邮件主题；若本次仅提建议不改动主题，返回空字符串"),
  suggestedBody: z
    .string()
    .describe("完整可直接发送的邮件正文；若本次不改动正文，返回空字符串"),
  suggestedHook: z
    .string()
    .describe("建议的 1 句话套磁切入点（可选，不改则返回空字符串）"),
});

const ExtractedListOutputSchema = z.object({
  professors: z.array(
    z.object({
      name: z.string(),
      dept: z.string().default(""),
      title: z.string().default(""),
      tags: z.array(z.string()).default([]),
      research: z.string().default(""),
      email: z.string().default(""),
      homepageUrl: z.string().default(""),
      matchTier: MatchTierSchema.default("high"),
      note: z.string().default(""),
    })
  ),
});

const AnalyzeAdvisorOutputSchema = z.object({
  matchTier: MatchTierSchema,
  matchScore: z.number().int().min(0).max(100),
  summary: z.string().describe("2~3句总评"),
  directionFit: z.string().describe("研究方向契合度说明"),
  methodFit: z.string().describe("研究方法与技术栈契合说明"),
  recommendedHooks: z.array(z.string()).max(4).describe("2~3条可执行套磁切入点"),
  riskFlags: z.array(z.string()).max(4).describe("需要注意或核实的风险提示"),
});

async function getApplicantProfile(): Promise<ApplicantProfile> {
  const row = await db
    .select()
    .from(schema.applicantProfiles)
    .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
    .get();
  return {
    name: row?.name || "",
    affiliation: row?.affiliation || "",
    degreeInfo: row?.degreeInfo || "",
    researchSummary: row?.researchSummary || "",
    phone: row?.phone || "",
    wechat: row?.wechat || "",
    homepageUrl: row?.homepageUrl || "",
    publications: row?.publications || [],
    projects: row?.projects || [],
    methodsSkills: row?.methodsSkills || [],
    targetDirections: row?.targetDirections || [],
    cvParsedText: row?.cvParsedText || "",
  };
}

async function runStructuredGeneration<T extends z.ZodTypeAny>(params: {
  runtime: Awaited<ReturnType<typeof resolveAiRuntime>>;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  zodSchema: T;
  temperature: number;
  maxOutputTokens: number;
}): Promise<{ data: z.infer<T>; tokensUsed: number; model: string }> {
  const { runtime, system, messages, zodSchema, temperature, maxOutputTokens } = params;
  const isReasoner = runtime.modelId.toLowerCase().includes("reasoner");

  if (!isReasoner) {
    try {
      const res = await generateText({
        model: runtime.model,
        system,
        messages,
        output: Output.object({ schema: zodSchema }),
        temperature,
        maxOutputTokens,
      });
      const tokens = res.totalUsage?.totalTokens ?? res.usage?.totalTokens ?? 0;
      return {
        data: res.output as z.infer<T>,
        tokensUsed: tokens,
        model: runtime.modelId,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // Only fall back to text+JSON parsing if provider rejected structured output format
      if (
        !msg.toLowerCase().includes("response_format") &&
        !msg.toLowerCase().includes("json_schema") &&
        !msg.toLowerCase().includes("no object generated")
      ) {
        throw err;
      }
    }
  }

  // Fallback for reasoner or third-party OpenAI-compatible proxies without json_schema
  const fallbackRes = await generateText({
    model: runtime.model,
    system: `${system}\n\n请务必仅输出合法的纯 JSON 对象，不要包含额外解释文本。`,
    messages,
    temperature: isReasoner ? undefined : temperature,
    maxOutputTokens,
  });
  const parsed = extractJsonObject(fallbackRes.text);
  const validated = zodSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("模型返回格式未能通过结构化校验，请重试。");
  }
  const tokens = fallbackRes.totalUsage?.totalTokens ?? fallbackRes.usage?.totalTokens ?? 0;
  return {
    data: validated.data,
    tokensUsed: tokens,
    model: runtime.modelId,
  };
}

export function createCloudApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
    })
  );

  // 挂载管理员专属 Prompt 调优与版本回滚路由
  app.route("/api/cloud/admin/prompts", createAdminPromptRoutes());

  app.get("/api/cloud/health", (c) => {
    return c.json({
      ok: true,
      service: "cloud-core",
      mode: "local-dev",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/cloud/entitlements", async (c) => {
    const acct = await db
      .select()
      .from(schema.creditAccounts)
      .where(eq(schema.creditAccounts.userId, LOCAL_USER_ID))
      .get();

    return c.json({
      ok: true,
      tier: "local_unlimited",
      licenseActive: true,
      creditsBalance: acct?.balance ?? 999999,
      features: {
        aiCopilot: true,
        aiExtract: true,
        aiAnalyze: true,
        cloudSync: false,
      },
    });
  });

  app.post("/api/cloud/ai/test", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as {
        baseUrl?: string;
        model?: string;
        apiKey?: string;
        apiKeyDirty?: boolean;
      };
      const overrideKey = body.apiKeyDirty ? (body.apiKey || "").trim() : (body.apiKey || "").trim();
      const runtime = await resolveAiRuntime({
        baseUrl: body.baseUrl,
        model: body.model,
        apiKey: overrideKey || undefined,
      });

      const t0 = Date.now();
      await generateText({
        model: runtime.model,
        prompt: "Reply OK",
        temperature: 0,
        maxOutputTokens: 16,
      });
      const latencyMs = Date.now() - t0;

      // Save working config automatically
      await db
        .update(schema.appSettings)
        .set({
          aiBaseUrl: runtime.baseUrl,
          aiModel: runtime.modelId,
          encryptedAiApiKey: encryptSecret(runtime.apiKey),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));

      return c.json({
        ok: true,
        latencyMs,
        model: runtime.modelId,
        message: `DeepSeek API 连接成功（${latencyMs} ms）并已加密保存`,
      });
    } catch (err) {
      return c.json({ ok: false, error: formatFriendlyAiError(err) }, 400);
    }
  });

  app.get("/api/cloud/ai/conversations/:advisorId", async (c) => {
    const advisorId = c.req.param("advisorId");
    const rows = await db
      .select()
      .from(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.userId, LOCAL_USER_ID),
          eq(schema.aiConversations.advisorId, advisorId)
        )
      )
      .orderBy(asc(schema.aiConversations.createdAt));

    return c.json({ ok: true, messages: rows });
  });

  app.delete("/api/cloud/ai/conversations/:advisorId", async (c) => {
    const advisorId = c.req.param("advisorId");
    await db
      .delete(schema.aiConversations)
      .where(
        and(
          eq(schema.aiConversations.userId, LOCAL_USER_ID),
          eq(schema.aiConversations.advisorId, advisorId)
        )
      );
    return c.json({ ok: true });
  });

  app.post("/api/cloud/ai/chat", async (c) => {
    try {
      const json = await c.req.json();
      const input = AiChatRequestSchema.parse(json);

      const advisor = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.id, input.advisorId))
        .get();
      if (!advisor) {
        return c.json({ ok: false, error: "未找到目标导师档案" }, 404);
      }

      const inst = await db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.id, advisor.institutionId))
        .get();

      const profile = await getApplicantProfile();
      const runtime = await resolveAiRuntime();

      const historyRows = await db
        .select()
        .from(schema.aiConversations)
        .where(
          and(
            eq(schema.aiConversations.userId, LOCAL_USER_ID),
            eq(schema.aiConversations.advisorId, advisor.id)
          )
        )
        .orderBy(asc(schema.aiConversations.createdAt));

      const recentHistory = historyRows.slice(-8).map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      }));

      const worksText =
        advisor.representativeWorks.length > 0
          ? advisor.representativeWorks
              .map((w) => `- ${w.title} (${w.venue || ""} ${w.year || ""})`)
              .join("\n")
          : "暂无记录";

      const contextMessage = `${buildProfileContextBlock(profile)}

【目标导师档案】
- 高校：${inst?.name || ""}
- 姓名：${advisor.name}
- 院系：${advisor.dept || "未填"}
- 职称：${advisor.title || "未填"}
- 研究标签：${advisor.researchTags.join(" | ") || "无"}
- 研究方向概述：${advisor.researchSummary || "未填"}
- 代表作：\n${worksText}
- 当前套磁切入点笔记：${input.currentHook || advisor.hookNote || "无"}

【当前邮件编辑器内容】
主题：${input.currentSubject || "（空）"}
正文：
${input.currentBody || "（当前为空）"}
${input.latestReply ? `\n【导师最新回信】\n${input.latestReply.slice(0, 2000)}` : ""}`;

      const userDisplayPrompt =
        input.userMessage.trim() ||
        {
          generate: "结合我的名片与导师研究方向，帮我起草一封真诚克制的套磁首信",
          reply_followup: "根据导师刚刚发来的回信，帮我拟一封礼貌得体的回复",
          shorten: "把当前正文精简到 400 字以内，更适合老师在手机上快速看完",
          polish: "帮我润色文字，去掉生硬套话，让学术表达更自然真诚",
          translate_en: "改写为地道得体的学术英文版本",
          hooks: "提炼 3 条我和导师研究方向的具体契合点",
          chat: "请帮我优化当前邮件",
        }[input.actionMode];

      const [systemPrompt, actionPrompt] = await Promise.all([
        getActivePrompt("copilot.system"),
        getActivePrompt(`copilot.action.${input.actionMode}`),
      ]);

      const renderedActionContent = renderPrompt(actionPrompt.content, {
        userMessage: input.userMessage.trim(),
        advisorName: advisor.name,
        institutionName: inst?.name || "",
      });

      const taskInstruction =
        input.actionMode === "chat"
          ? input.userMessage.trim() || renderedActionContent
          : renderedActionContent;

      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: `以下是本次写作任务的完整上下文：\n${contextMessage}` },
        {
          role: "assistant",
          content: JSON.stringify({
            reply: "已完整读取你的科研名片、导师档案与当前编辑器草稿。",
            suggestedSubject: "",
            suggestedBody: "",
            suggestedHook: "",
          }),
        },
        ...recentHistory,
        { role: "user", content: `请执行：${taskInstruction}` },
      ];

      // 非自由对话快捷动作允许按 action 级别单独调优温度与输出上限
      const activeTemperature =
        input.actionMode === "chat" ? systemPrompt.temperature : actionPrompt.temperature;
      const activeMaxTokens =
        input.actionMode === "chat" ? systemPrompt.maxOutputTokens : actionPrompt.maxOutputTokens;

      const { data, tokensUsed, model } = await runStructuredGeneration({
        runtime,
        system: systemPrompt.content,
        messages,
        zodSchema: CopilotOutputSchema,
        temperature: activeTemperature,
        maxOutputTokens: activeMaxTokens,
      });

      const now = new Date().toISOString();
      const userEntry = {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        advisorId: advisor.id,
        role: "user" as const,
        content: userDisplayPrompt,
        suggestedSubject: "",
        suggestedBody: "",
        suggestedHook: "",
        model: "",
        tokensUsed: 0,
        createdAt: now,
      };
      const assistantEntry = {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        advisorId: advisor.id,
        role: "assistant" as const,
        content: data.reply || "已生成建议稿件。",
        suggestedSubject: data.suggestedSubject || "",
        suggestedBody: data.suggestedBody || "",
        suggestedHook: data.suggestedHook || "",
        model,
        tokensUsed,
        createdAt: new Date(Date.now() + 2).toISOString(),
      };

      await db.insert(schema.aiConversations).values([userEntry, assistantEntry]);

      return c.json({
        ok: true,
        userMessage: userEntry,
        assistantMessage: assistantEntry,
      });
    } catch (err) {
      return c.json({ ok: false, error: formatFriendlyAiError(err) }, 400);
    }
  });

  app.post("/api/cloud/ai/analyze-advisor", async (c) => {
    try {
      const { advisorId } = (await c.req.json()) as { advisorId?: string };
      if (!advisorId) {
        return c.json({ ok: false, error: "缺少 advisorId" }, 400);
      }

      const advisor = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.id, advisorId))
        .get();
      if (!advisor) {
        return c.json({ ok: false, error: "未找到导师档案" }, 404);
      }

      const inst = await db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.id, advisor.institutionId))
        .get();

      const profile = await getApplicantProfile();
      const runtime = await resolveAiRuntime();

      const prompt = `${buildProfileContextBlock(profile)}

【目标导师档案】
- 高校：${inst?.name || ""}
- 姓名：${advisor.name}
- 院系/职称：${advisor.dept} ${advisor.title}
- 研究标签：${advisor.researchTags.join(" | ") || "无"}
- 研究方向：${advisor.researchSummary || "未填写"}
- 邮箱：${advisor.email || "未填写"}
- 招生信号：${advisor.recruitmentSignal ? JSON.stringify(advisor.recruitmentSignal) : "无"}

请输出结构化匹配分析：`;

      const analyzerPrompt = await getActivePrompt("analyzer.system");
      const { data, model } = await runStructuredGeneration({
        runtime,
        system: analyzerPrompt.content,
        messages: [{ role: "user", content: prompt }],
        zodSchema: AnalyzeAdvisorOutputSchema,
        temperature: analyzerPrompt.temperature,
        maxOutputTokens: analyzerPrompt.maxOutputTokens,
      });

      const now = new Date().toISOString();
      const aiInsights = {
        summary: data.summary,
        directionFit: data.directionFit,
        methodFit: data.methodFit,
        recommendedHooks: data.recommendedHooks,
        riskFlags: data.riskFlags,
        updatedAt: now,
      };

      await db
        .update(schema.advisors)
        .set({
          aiInsights,
          matchTier: data.matchTier,
          matchScore: data.matchScore,
          updatedAt: now,
        })
        .where(eq(schema.advisors.id, advisor.id));

      return c.json({
        ok: true,
        matchTier: data.matchTier,
        matchScore: data.matchScore,
        aiInsights,
        model,
      });
    } catch (err) {
      return c.json({ ok: false, error: formatFriendlyAiError(err) }, 400);
    }
  });

  app.post("/api/cloud/ai/extract-advisors", async (c) => {
    try {
      const json = await c.req.json();
      const input = AiExtractRequestSchema.parse(json);

      let sourceText = (input.rawText || "").trim();
      if (!sourceText && input.pageUrl) {
        sourceText = await fetchWebpageMarkdown(input.pageUrl);
      }
      if (!sourceText) {
        return c.json(
          { ok: false, error: "请粘贴学院师资页面文字内容，或填写公开师资列表网址。" },
          400
        );
      }

      const profile = await getApplicantProfile();
      const runtime = await resolveAiRuntime();

      const bgSummary =
        [
          profile.degreeInfo,
          profile.targetDirections.join("、"),
          profile.methodsSkills.join("、"),
          profile.researchSummary,
        ]
          .filter(Boolean)
          .join("；") || "未填写（请按常规相关性评为 high 或 try）";

      const prompt = `目标高校：${input.institutionName || "未指定"}
申请人背景摘要：${bgSummary}

待提取网页文本：
${sourceText.slice(0, 15000)}`;

      const extractorPrompt = await getActivePrompt("extractor.system");
      const { data, model } = await runStructuredGeneration({
        runtime,
        system: extractorPrompt.content,
        messages: [{ role: "user", content: prompt }],
        zodSchema: ExtractedListOutputSchema,
        temperature: extractorPrompt.temperature,
        maxOutputTokens: extractorPrompt.maxOutputTokens,
      });

      return c.json({
        ok: true,
        professors: data.professors || [],
        model,
      });
    } catch (err) {
      return c.json({ ok: false, error: formatFriendlyAiError(err) }, 400);
    }
  });

  return app;
}
