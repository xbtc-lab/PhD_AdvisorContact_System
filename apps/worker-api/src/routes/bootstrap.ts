import { Hono } from "hono";
import {
  ApplicantProfileSchema,
  UpdateSettingsInputSchema,
  type AttachmentCategory,
} from "@app/shared";
import {
  asc,
  db,
  decryptSecret,
  desc,
  encryptSecret,
  eq,
  firstOrNull,
  LOCAL_USER_ID,
  pool,
  schema,
} from "@app/db";
import {
  buildCatalogAdvisorDto,
  buildTrackingSummaries,
  getUnreadRepliesSummary,
  toAdvisorDto,
  toPublicMailAccount,
} from "../helpers/domain.js";
import { getLatestDispatchJob, getQuotaToday } from "../services/dispatch-worker.js";

/**
 * 健康检查、工作台冷启动聚合（Bootstrap）、个人科研履历与全局系统设置路由。
 */
export function createBootstrapRoutes() {
  const router = new Hono();

  router.get("/api/health", async (c) => {
    let dbConnected = false;
    try {
      await pool.query("SELECT 1");
      dbConnected = true;
    } catch {
      dbConnected = false;
    }
    return c.json({
      ok: dbConnected,
      service: "worker-api",
      dialect: "postgresql",
      dbConnected,
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/api/bootstrap", async (c) => {
    const [
      profileRow,
      instRows,
      advisorRows,
      resumeRows,
      accountRows,
      settingsRow,
      catalogUniRows,
      catalogAdvRows,
      trackingLinkRows,
      trackingEventRows,
      quotaToday,
      replySummary,
      job,
    ] = await Promise.all([
      firstOrNull(
        db
          .select()
          .from(schema.applicantProfiles)
          .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
          .limit(1)
      ),
      db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.userId, LOCAL_USER_ID))
        .orderBy(asc(schema.institutions.createdAt)),
      db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.userId, LOCAL_USER_ID))
        .orderBy(asc(schema.advisors.createdAt)),
      db
        .select()
        .from(schema.resumes)
        .where(eq(schema.resumes.userId, LOCAL_USER_ID))
        .orderBy(desc(schema.resumes.createdAt)),
      db
        .select()
        .from(schema.mailAccounts)
        .where(eq(schema.mailAccounts.userId, LOCAL_USER_ID))
        .orderBy(asc(schema.mailAccounts.createdAt)),
      firstOrNull(
        db
          .select()
          .from(schema.appSettings)
          .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
          .limit(1)
      ),
      db
        .select()
        .from(schema.catalogUniversities)
        .orderBy(asc(schema.catalogUniversities.softScienceRank)),
      db
        .select()
        .from(schema.catalogAdvisors)
        .orderBy(desc(schema.catalogAdvisors.defaultFitScore)),
      db
        .select()
        .from(schema.trackingLinks)
        .where(eq(schema.trackingLinks.userId, LOCAL_USER_ID)),
      db.select().from(schema.trackingEvents),
      getQuotaToday(),
      getUnreadRepliesSummary(),
      getLatestDispatchJob(),
    ]);

    const instMap = new Map(instRows.map((i) => [i.id, i.name]));
    const uniMap = new Map(catalogUniRows.map((u) => [u.id, u]));
    const adoptedByCatalogId = new Map(
      advisorRows
        .filter((a) => Boolean(a.catalogAdvisorId))
        .map((a) => [a.catalogAdvisorId!, a.id])
    );

    const rawKey = settingsRow?.encryptedAiApiKey
      ? decryptSecret(settingsRow.encryptedAiApiKey)
      : (process.env.DEEPSEEK_API_KEY || "").trim();

    return c.json({
      ok: true,
      data: {
        profile: {
          name: profileRow?.name || "",
          affiliation: profileRow?.affiliation || "",
          degreeInfo: profileRow?.degreeInfo || "",
          researchSummary: profileRow?.researchSummary || "",
          phone: profileRow?.phone || "",
          wechat: profileRow?.wechat || "",
          homepageUrl: profileRow?.homepageUrl || "",
          publications: profileRow?.publications || [],
          projects: profileRow?.projects || [],
          methodsSkills: profileRow?.methodsSkills || [],
          targetDirections: profileRow?.targetDirections || [],
          cvParsedText: profileRow?.cvParsedText || "",
          educationHistory: profileRow?.educationHistory || [],
          languageScores: profileRow?.languageScores || "",
          competitions: profileRow?.competitions || [],
          honors: profileRow?.honors || [],
          wechatQrPath: profileRow?.wechatQrPath || "",
        },
        institutions: instRows,
        advisors: advisorRows.map((a) => toAdvisorDto(a, instMap.get(a.institutionId) || "")),
        resumes: resumeRows.map((r) => ({
          id: r.id,
          filename: r.filename,
          sizeBytes: r.sizeBytes,
          sizeMb: Number((r.sizeBytes / (1024 * 1024)).toFixed(2)),
          sha256: r.sha256,
          parsedText: r.parsedText,
          isDefault: r.isDefault,
          category: (r.category || "resume") as AttachmentCategory,
          tagNote: r.tagNote || "",
          createdAt: r.createdAt,
        })),
        mailAccounts: accountRows.map(toPublicMailAccount),
        policy: settingsRow?.policyConfig,
        aiConfig: {
          provider: settingsRow?.aiProvider || "deepseek",
          baseUrl: settingsRow?.aiBaseUrl || "https://api.deepseek.com",
          model: settingsRow?.aiModel || "deepseek-chat",
          hasApiKey: Boolean(rawKey),
          apiKeyLen: rawKey.length,
        },
        preferences: settingsRow?.preferences,
        quotaToday,
        unreadReplies: replySummary.unreadReplies,
        replyCounts: replySummary.replyCounts,
        job,
        lastSyncAt: replySummary.lastSyncAt,
        catalogUniversities: catalogUniRows,
        catalogAdvisors: catalogAdvRows.map((ca) =>
          buildCatalogAdvisorDto(
            ca,
            uniMap.get(ca.universityId),
            adoptedByCatalogId.get(ca.id) ?? null
          )
        ),
        trackingSummaries: buildTrackingSummaries(trackingLinkRows, trackingEventRows),
      },
    });
  });

  router.put("/api/profile", async (c) => {
    try {
      const json = await c.req.json();
      const input = ApplicantProfileSchema.parse(json);
      const now = new Date().toISOString();
      await db
        .update(schema.applicantProfiles)
        .set({ ...input, updatedAt: now })
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID));
      return c.json({ ok: true, profile: input });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "保存名片失败" },
        400
      );
    }
  });

  router.put("/api/settings", async (c) => {
    try {
      const input = UpdateSettingsInputSchema.parse(await c.req.json());
      const existing = await firstOrNull(
        db
          .select()
          .from(schema.appSettings)
          .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
          .limit(1)
      );
      if (!existing) return c.json({ ok: false, error: "配置记录不存在" }, 404);

      let nextEncryptedKey = existing.encryptedAiApiKey;
      if (input.aiConfig) {
        if (input.aiConfig.clearApiKey) {
          nextEncryptedKey = "";
        } else if (input.aiConfig.apiKeyDirty) {
          nextEncryptedKey = input.aiConfig.apiKey
            ? encryptSecret(input.aiConfig.apiKey.trim())
            : "";
        }
      }

      const now = new Date().toISOString();
      await db
        .update(schema.appSettings)
        .set({
          ...(input.policy ? { policyConfig: input.policy } : {}),
          ...(input.aiConfig
            ? {
                aiProvider: input.aiConfig.provider,
                aiBaseUrl: input.aiConfig.baseUrl,
                aiModel: input.aiConfig.model,
                encryptedAiApiKey: nextEncryptedKey,
              }
            : {}),
          ...(input.preferences
            ? {
                preferences: {
                  ...existing.preferences,
                  ...input.preferences,
                },
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));

      return c.json({ ok: true });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "保存设置失败" },
        400
      );
    }
  });

  return router;
}
