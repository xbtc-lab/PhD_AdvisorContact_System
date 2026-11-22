import crypto from "node:crypto";
import {
  normalizeAdvisorStage,
  normalizeMatchTier,
  type Advisor,
  type CatalogAdvisor,
  type MailAccountPublic,
  type TrackingSummary,
  type UnreadReplyItem,
} from "@app/shared";
import {
  and,
  db,
  decryptSecret,
  desc,
  eq,
  firstOrNull,
  LOCAL_USER_ID,
  schema,
} from "@app/db";

/**
 * 将邮箱账号表行脱敏为前端安全 DTO，绝不向前端下发授权码明文或密文。
 */
export function toPublicMailAccount(
  row: typeof schema.mailAccounts.$inferSelect
): MailAccountPublic {
  const rawCred = decryptSecret(row.encryptedCredential);
  return {
    id: row.id,
    label: row.label,
    email: row.email,
    displayName: row.displayName,
    providerType: row.providerType as MailAccountPublic["providerType"],
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: row.smtpSecurity as MailAccountPublic["smtpSecurity"],
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    draftsFolder: row.draftsFolder,
    hasCredential: Boolean(rawCred),
    credentialLen: rawCred.length,
    dailyLimit: row.dailyLimit,
    enabled: row.enabled,
    note: row.note,
    lastTest: row.lastTestResult ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * 将导师表行转换为包含高校名称及 V3.2 扩展字段的前端视图 DTO。
 */
export function toAdvisorDto(
  row: typeof schema.advisors.$inferSelect,
  institutionName: string
): Advisor {
  return {
    id: row.id,
    institutionId: row.institutionId,
    institutionName,
    catalogAdvisorId: row.catalogAdvisorId ?? null,
    name: row.name,
    dept: row.dept,
    title: row.title,
    honorBadge: row.honorBadge || "",
    email: row.email,
    homepageUrl: row.homepageUrl,
    scholarUrl: row.scholarUrl,
    avatarSeed: row.avatarSeed,
    photoUrl: row.photoUrl || "",
    photoSource: row.photoSource || "",
    researchTags: row.researchTags || [],
    researchSummary: row.researchSummary,
    representativeWorks: row.representativeWorks || [],
    recruitmentSignal: row.recruitmentSignal ?? null,
    matchTier: normalizeMatchTier(row.matchTier),
    matchScore: row.matchScore ?? null,
    stage: normalizeAdvisorStage(row.stage),
    inBatch: row.inBatch,
    assignedAccountId: row.assignedAccountId || "auto",
    hookNote: row.hookNote,
    userNotes: row.userNotes,
    replyNote: row.replyNote,
    trackSummary: row.trackSummary || "",
    aiInsights: row.aiInsights ?? null,
    lastSentAt: row.lastSentAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * 拼装公共软科导师视图 DTO，自动附带所属高校软科排名与“是否已加入我的导师”状态。
 */
export function buildCatalogAdvisorDto(
  row: typeof schema.catalogAdvisors.$inferSelect,
  uni: typeof schema.catalogUniversities.$inferSelect | undefined,
  adoptedAdvisorId: string | null
): CatalogAdvisor {
  return {
    id: row.id,
    universityId: row.universityId,
    universityName: uni?.name || "未知高校",
    universityShortName: uni?.shortName || uni?.name || "",
    softScienceRank: uni?.softScienceRank ?? null,
    rankTier: uni?.rankTier || "other",
    disciplineRankNote: uni?.disciplineRankNote || "",
    name: row.name,
    dept: row.dept,
    title: row.title,
    honorBadge: row.honorBadge,
    honorCategory: row.honorCategory,
    bio: row.bio,
    researchTags: row.researchTags || [],
    email: row.email,
    homepageUrl: row.homepageUrl,
    photoUrl: row.photoUrl,
    photoSource: row.photoSource,
    kpiOutputsHero: row.kpiOutputsHero,
    kpiOutputsNote: row.kpiOutputsNote,
    kpiGrantsHero: row.kpiGrantsHero,
    kpiGrantsNote: row.kpiGrantsNote,
    kpiQuotaHero: row.kpiQuotaHero,
    kpiQuotaNote: row.kpiQuotaNote,
    recruitOpen: Boolean(row.recruitOpen),
    footerNote: row.footerNote,
    defaultFitScore: row.defaultFitScore,
    sourceUpdatedAt: row.sourceUpdatedAt,
    crawledAt: row.crawledAt,
    adoptedAdvisorId,
  };
}

/**
 * 按导师聚合双轨邮件追踪汇总数据（在线简历阅读、联系卡点击、过滤预抓后的打开次数）。
 */
export function buildTrackingSummaries(
  links: Array<typeof schema.trackingLinks.$inferSelect>,
  events: Array<typeof schema.trackingEvents.$inferSelect>
): Record<string, TrackingSummary> {
  const linkById = new Map(links.map((l) => [l.id, l]));
  const result: Record<string, TrackingSummary> = {};

  const ensureSummary = (advisorId: string): TrackingSummary => {
    if (!result[advisorId]) {
      result[advisorId] = {
        advisorId,
        resumeClicks: 0,
        resumeReadSec: 0,
        cardClicks: 0,
        pixelOpens: 0,
        suspectedBotOpens: 0,
        lastActivityAt: null,
      };
    }
    return result[advisorId];
  };

  for (const ev of events) {
    const link = linkById.get(ev.linkId);
    if (!link) continue;
    const summary = ensureSummary(link.advisorId);

    if (ev.isSuspectedBot) {
      summary.suspectedBotOpens += 1;
      continue;
    }

    if (link.kind === "resume_pdf") {
      if (ev.eventType === "click") summary.resumeClicks += 1;
      if (ev.eventType === "heartbeat") {
        summary.resumeReadSec += Math.max(0, ev.durationSec || 0);
      } else if (ev.durationSec > 0) {
        summary.resumeReadSec += ev.durationSec;
      }
    } else if (link.kind === "contact_card") {
      summary.cardClicks += 1;
    } else if (link.kind === "pixel") {
      summary.pixelOpens += 1;
    }

    if (!summary.lastActivityAt || ev.createdAt > summary.lastActivityAt) {
      summary.lastActivityAt = ev.createdAt;
    }
  }

  return result;
}

/**
 * 统计当前未读导师回信摘要与每位导师的来信总数。
 */
export async function getUnreadRepliesSummary() {
  const [inboundMsgs, allAdvisors, allInsts, settings] = await Promise.all([
    db
      .select()
      .from(schema.mailMessages)
      .where(
        and(
          eq(schema.mailMessages.userId, LOCAL_USER_ID),
          eq(schema.mailMessages.direction, "inbound")
        )
      )
      .orderBy(desc(schema.mailMessages.sentOrReceivedAt)),
    db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
    db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
    firstOrNull(
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .limit(1)
    ),
  ]);

  const instMap = new Map(allInsts.map((i) => [i.id, i.name]));
  const advById = new Map(allAdvisors.map((a) => [a.id, a]));
  const advByEmail = new Map(
    allAdvisors
      .filter((a) => a.email.trim())
      .map((a) => [a.email.trim().toLowerCase(), a])
  );

  const unreadReplies: UnreadReplyItem[] = [];
  const replyCounts: Record<string, number> = {};

  for (const m of inboundMsgs) {
    const adv =
      (m.advisorId ? advById.get(m.advisorId) : undefined) ||
      advByEmail.get(m.fromEmail.trim().toLowerCase());
    const advisorId = adv?.id || m.advisorId || "";
    if (advisorId) {
      replyCounts[advisorId] = (replyCounts[advisorId] || 0) + 1;
    }
    if (m.isUnread) {
      unreadReplies.push({
        msgId: m.id,
        advisorId,
        advisorName: adv?.name || m.fromName || m.fromEmail || "导师",
        institutionName: adv ? instMap.get(adv.institutionId) || "" : "",
        fromEmail: m.fromEmail,
        subject: m.subject,
        snippet: m.body.replace(/\s+/g, " ").trim().slice(0, 110),
        timestamp: m.sentOrReceivedAt,
      });
    }
  }

  return {
    unreadReplies,
    replyCounts,
    lastSyncAt: settings?.lastMailSyncAt || "",
  };
}

/**
 * 按高校名称幂等查找或创建用户的目标高校档案。
 */
export async function findOrCreateInstitution(nameRaw: string, deptHint = "") {
  const name = nameRaw.trim() || "目标高校";
  const existing = await firstOrNull(
    db
      .select()
      .from(schema.institutions)
      .where(
        and(
          eq(schema.institutions.userId, LOCAL_USER_ID),
          eq(schema.institutions.name, name)
        )
      )
      .limit(1)
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const created = {
    id: crypto.randomUUID(),
    userId: LOCAL_USER_ID,
    name,
    shortName: name.replace(/大学$/, ""),
    department: deptHint,
    facultyListUrl: "",
    admissionUrl: "",
    deadlineAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.institutions).values(created);
  return created;
}

/**
 * 根据文件名后缀推断预览响应 Content-Type。
 */
export function inferMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/pdf";
}
