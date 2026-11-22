import crypto from "node:crypto";
import fs from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import Papa from "papaparse";
import {
  ApplicantProfileSchema,
  BatchImportAdvisorsInputSchema,
  CreateAdvisorInputSchema,
  CreateInstitutionInputSchema,
  DiscoverMailAccountInputSchema,
  normalizeAdvisorStage,
  normalizeMatchTier,
  normalizeSubjectKey,
  SaveDraftInputSchema,
  SaveMailAccountInputSchema,
  SaveSingleDraftInputSchema,
  SelfTestMailInputSchema,
  SendSingleMailInputSchema,
  StartDispatchInputSchema,
  TestMailAccountInputSchema,
  UpdateAdvisorInputSchema,
  UpdateSettingsInputSchema,
  type Advisor,
  type MailAccountPublic,
  type UnreadReplyItem,
} from "@app/shared";
import {
  and,
  asc,
  db,
  decryptSecret,
  desc,
  encryptSecret,
  eq,
  LOCAL_USER_ID,
  schema,
} from "@app/db";
import { discoverMailboxConfig } from "./services/mail-discovery.js";
import {
  defaultMailTransport,
  type SyncRepliesContext,
} from "./services/mail-transport.js";
import {
  buildDispatchPlan,
  getLatestDispatchJob,
  getQuotaToday,
  requestStopActiveJob,
  startDispatchJob,
  toTransportAccount,
} from "./services/dispatch-worker.js";
import { generateAcademicTemplateDraft } from "./services/template-draft.js";
import { saveUploadedResume } from "./services/resume-storage.js";

function toPublicMailAccount(
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

function toAdvisorDto(
  row: typeof schema.advisors.$inferSelect,
  institutionName: string
): Advisor {
  return {
    id: row.id,
    institutionId: row.institutionId,
    institutionName,
    name: row.name,
    dept: row.dept,
    title: row.title,
    email: row.email,
    homepageUrl: row.homepageUrl,
    scholarUrl: row.scholarUrl,
    avatarSeed: row.avatarSeed,
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
    aiInsights: row.aiInsights ?? null,
    lastSentAt: row.lastSentAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getUnreadRepliesSummary() {
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
    db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .get(),
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

let syncInProgress = false;

export function createWorkerApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.get("/api/health", (c) => {
    return c.json({
      ok: true,
      service: "worker-api",
      dialect: "sqlite",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/bootstrap", async (c) => {
    const [
      profileRow,
      instRows,
      advisorRows,
      resumeRows,
      accountRows,
      settingsRow,
      quotaToday,
      replySummary,
      job,
    ] = await Promise.all([
      db
        .select()
        .from(schema.applicantProfiles)
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
        .get(),
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
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .get(),
      getQuotaToday(),
      getUnreadRepliesSummary(),
      getLatestDispatchJob(),
    ]);

    const instMap = new Map(instRows.map((i) => [i.id, i.name]));
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
      },
    });
  });

  // --- Applicant Profile ---
  app.put("/api/profile", async (c) => {
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

  // --- Institutions ---
  app.get("/api/institutions", async (c) => {
    const rows = await db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.userId, LOCAL_USER_ID))
      .orderBy(asc(schema.institutions.createdAt));
    return c.json({ ok: true, institutions: rows });
  });

  app.post("/api/institutions", async (c) => {
    try {
      const input = CreateInstitutionInputSchema.parse(await c.req.json());
      const now = new Date().toISOString();
      const row = {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        name: input.name,
        shortName: input.shortName || "",
        department: input.department || "",
        facultyListUrl: input.facultyListUrl || "",
        admissionUrl: input.admissionUrl || "",
        deadlineAt: input.deadlineAt || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.institutions).values(row);
      return c.json({ ok: true, institution: row });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "创建高校失败" },
        400
      );
    }
  });

  // --- Advisors ---
  async function findOrCreateInstitution(nameRaw: string, deptHint = "") {
    const name = nameRaw.trim() || "目标高校";
    const existing = await db
      .select()
      .from(schema.institutions)
      .where(
        and(
          eq(schema.institutions.userId, LOCAL_USER_ID),
          eq(schema.institutions.name, name)
        )
      )
      .get();
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

  app.post("/api/advisors", async (c) => {
    try {
      const input = CreateAdvisorInputSchema.parse(await c.req.json());
      const inst = input.institutionId
        ? await db
            .select()
            .from(schema.institutions)
            .where(eq(schema.institutions.id, input.institutionId))
            .get()
        : await findOrCreateInstitution(input.institutionName || "目标高校", input.dept);

      if (!inst) {
        return c.json({ ok: false, error: "所选高校不存在" }, 404);
      }

      const now = new Date().toISOString();
      const advisorId = crypto.randomUUID();
      const advisorRow: typeof schema.advisors.$inferSelect = {
        id: advisorId,
        userId: LOCAL_USER_ID,
        institutionId: inst.id,
        name: input.name,
        dept: input.dept,
        title: input.title,
        email: input.email,
        homepageUrl: input.homepageUrl,
        scholarUrl: input.scholarUrl,
        avatarSeed: `${inst.name}::${input.name}`,
        researchTags: input.researchTags,
        researchSummary: input.researchSummary,
        representativeWorks: [],
        recruitmentSignal: null,
        matchTier: input.matchTier,
        matchScore: null,
        stage: input.stage,
        inBatch: input.inBatch,
        assignedAccountId: "auto",
        hookNote: input.hookNote,
        userNotes: input.userNotes,
        replyNote: "",
        aiInsights: null,
        researchEmbedding: null,
        lastSentAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.advisors).values(advisorRow);
      await db.insert(schema.outreachDrafts).values({
        id: crypto.randomUUID(),
        advisorId,
        subject: "",
        body: "",
        selectedHook: input.hookNote || "",
        resumeId: null,
        preferredAccountId: "auto",
        updatedAt: now,
      });

      return c.json({
        ok: true,
        advisor: toAdvisorDto(advisorRow, inst.name),
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "添加导师失败" },
        400
      );
    }
  });

  app.post("/api/advisors/batch-import", async (c) => {
    try {
      const input = BatchImportAdvisorsInputSchema.parse(await c.req.json());
      const inst = await findOrCreateInstitution(input.institutionName);
      const existing = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.institutionId, inst.id));

      const existingNames = new Set(existing.map((a) => a.name.trim()));
      const existingEmails = new Set(
        existing.filter((a) => a.email.trim()).map((a) => a.email.trim().toLowerCase())
      );

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      for (const item of input.advisors) {
        const cleanName = item.name.trim();
        const cleanEmail = item.email.trim();
        if (
          existingNames.has(cleanName) ||
          (cleanEmail && existingEmails.has(cleanEmail.toLowerCase()))
        ) {
          skipped += 1;
          continue;
        }
        const advisorId = crypto.randomUUID();
        await db.insert(schema.advisors).values({
          id: advisorId,
          userId: LOCAL_USER_ID,
          institutionId: inst.id,
          name: cleanName,
          dept: item.dept,
          title: item.title,
          email: cleanEmail,
          homepageUrl: item.homepageUrl,
          scholarUrl: "",
          avatarSeed: `${inst.name}::${cleanName}`,
          researchTags: item.tags,
          researchSummary: item.research,
          representativeWorks: [],
          recruitmentSignal: null,
          matchTier: normalizeMatchTier(item.matchTier),
          matchScore: null,
          stage: "drafting",
          inBatch: true,
          assignedAccountId: "auto",
          hookNote: item.hookNote || "",
          userNotes: item.note || "",
          replyNote: "",
          aiInsights: null,
          researchEmbedding: null,
          lastSentAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.outreachDrafts).values({
          id: crypto.randomUUID(),
          advisorId,
          subject: "",
          body: "",
          selectedHook: item.hookNote || "",
          resumeId: null,
          preferredAccountId: "auto",
          updatedAt: now,
        });
        existingNames.add(cleanName);
        if (cleanEmail) existingEmails.add(cleanEmail.toLowerCase());
        added += 1;
      }

      return c.json({ ok: true, added, skipped, institution: inst });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "批量导入失败" },
        400
      );
    }
  });

  app.patch("/api/advisors/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const input = UpdateAdvisorInputSchema.parse(await c.req.json());
      const cur = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.id, id))
        .get();
      if (!cur) return c.json({ ok: false, error: "导师不存在" }, 404);

      let targetInstitutionId = cur.institutionId;
      if (input.institutionName && input.institutionName.trim()) {
        const inst = await findOrCreateInstitution(input.institutionName);
        targetInstitutionId = inst.id;
      } else if (input.institutionId) {
        targetInstitutionId = input.institutionId;
      }

      const { institutionName: _ignored, ...rest } = input;
      const now = new Date().toISOString();
      await db
        .update(schema.advisors)
        .set({
          ...rest,
          institutionId: targetInstitutionId,
          updatedAt: now,
        })
        .where(eq(schema.advisors.id, id));

      const updated = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.id, id))
        .get();
      const inst = await db
        .select()
        .from(schema.institutions)
        .where(eq(schema.institutions.id, targetInstitutionId))
        .get();

      return c.json({
        ok: true,
        advisor: toAdvisorDto(updated!, inst?.name || ""),
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "更新失败" },
        400
      );
    }
  });

  app.delete("/api/advisors/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.advisors).where(eq(schema.advisors.id, id));
    return c.json({ ok: true });
  });

  // --- Drafts & Revisions ---
  app.get("/api/advisors/:id/draft", async (c) => {
    const advisorId = c.req.param("id");
    let draft = await db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.advisorId, advisorId))
      .get();
    if (!draft) {
      const now = new Date().toISOString();
      draft = {
        id: crypto.randomUUID(),
        advisorId,
        subject: "",
        body: "",
        selectedHook: "",
        resumeId: null,
        preferredAccountId: "auto",
        updatedAt: now,
      };
      await db.insert(schema.outreachDrafts).values(draft);
    }
    const revisions = await db
      .select()
      .from(schema.draftRevisions)
      .where(eq(schema.draftRevisions.draftId, draft.id))
      .orderBy(desc(schema.draftRevisions.createdAt))
      .limit(20);

    return c.json({ ok: true, draft, revisions });
  });

  app.put("/api/advisors/:id/draft", async (c) => {
    try {
      const advisorId = c.req.param("id");
      const input = SaveDraftInputSchema.parse(await c.req.json());
      const now = new Date().toISOString();

      let draft = await db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.advisorId, advisorId))
        .get();

      if (!draft) {
        draft = {
          id: crypto.randomUUID(),
          advisorId,
          subject: input.subject,
          body: input.body,
          selectedHook: input.selectedHook || "",
          resumeId: input.resumeId ?? null,
          preferredAccountId: input.preferredAccountId || "auto",
          updatedAt: now,
        };
        await db.insert(schema.outreachDrafts).values(draft);
      } else {
        if (input.createRevision && (draft.body.trim() || draft.subject.trim())) {
          await db.insert(schema.draftRevisions).values({
            id: crypto.randomUUID(),
            draftId: draft.id,
            subject: draft.subject,
            body: draft.body,
            source: input.revisionSource,
            note: input.revisionNote,
            createdAt: now,
          });
        }

        await db
          .update(schema.outreachDrafts)
          .set({
            subject: input.subject,
            body: input.body,
            ...(input.selectedHook !== undefined ? { selectedHook: input.selectedHook } : {}),
            ...(input.resumeId !== undefined ? { resumeId: input.resumeId } : {}),
            ...(input.preferredAccountId !== undefined
              ? { preferredAccountId: input.preferredAccountId }
              : {}),
            updatedAt: now,
          })
          .where(eq(schema.outreachDrafts.id, draft.id));
      }

      const fresh = await db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.advisorId, advisorId))
        .get();
      const revisions = await db
        .select()
        .from(schema.draftRevisions)
        .where(eq(schema.draftRevisions.draftId, fresh!.id))
        .orderBy(desc(schema.draftRevisions.createdAt))
        .limit(20);

      return c.json({ ok: true, draft: fresh, revisions });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "保存草稿失败" },
        400
      );
    }
  });

  app.post("/api/advisors/:id/draft/generate", async (c) => {
    const advisorId = c.req.param("id");
    const advisorRow = await db
      .select()
      .from(schema.advisors)
      .where(eq(schema.advisors.id, advisorId))
      .get();
    if (!advisorRow) return c.json({ ok: false, error: "导师不存在" }, 404);

    const inst = await db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.id, advisorRow.institutionId))
      .get();
    const profileRow = await db
      .select()
      .from(schema.applicantProfiles)
      .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
      .get();

    const bodyJson = (await c.req.json().catch(() => ({}))) as { hookNote?: string };
    const advDto = toAdvisorDto(advisorRow, inst?.name || "");
    if (bodyJson.hookNote !== undefined) advDto.hookNote = bodyJson.hookNote;

    const generated = generateAcademicTemplateDraft(
      {
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
      },
      advDto
    );

    return c.json({ ok: true, ...generated });
  });

  app.post("/api/advisors/:id/draft/revisions/:revId/restore", async (c) => {
    const advisorId = c.req.param("id");
    const revId = c.req.param("revId");
    const draft = await db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.advisorId, advisorId))
      .get();
    const rev = await db
      .select()
      .from(schema.draftRevisions)
      .where(eq(schema.draftRevisions.id, revId))
      .get();
    if (!draft || !rev || rev.draftId !== draft.id) {
      return c.json({ ok: false, error: "版本快照不存在" }, 404);
    }

    const now = new Date().toISOString();
    if (draft.body.trim() || draft.subject.trim()) {
      await db.insert(schema.draftRevisions).values({
        id: crypto.randomUUID(),
        draftId: draft.id,
        subject: draft.subject,
        body: draft.body,
        source: "restore",
        note: "回滚前自动备份",
        createdAt: now,
      });
    }

    await db
      .update(schema.outreachDrafts)
      .set({ subject: rev.subject, body: rev.body, updatedAt: now })
      .where(eq(schema.outreachDrafts.id, draft.id));

    const fresh = await db
      .select()
      .from(schema.outreachDrafts)
      .where(eq(schema.outreachDrafts.id, draft.id))
      .get();
    const revisions = await db
      .select()
      .from(schema.draftRevisions)
      .where(eq(schema.draftRevisions.draftId, draft.id))
      .orderBy(desc(schema.draftRevisions.createdAt))
      .limit(20);

    return c.json({ ok: true, draft: fresh, revisions });
  });

  // --- Resumes ---
  app.post("/api/resumes", async (c) => {
    try {
      const body = (await c.req.json()) as {
        filename?: string;
        contentBase64?: string;
        setAsDefault?: boolean;
        advisorId?: string;
      };
      const resume = await saveUploadedResume({
        filename: body.filename || "resume.pdf",
        base64Content: body.contentBase64 || "",
        setAsDefault: body.setAsDefault,
      });

      if (body.advisorId) {
        await db
          .update(schema.outreachDrafts)
          .set({ resumeId: resume.id, updatedAt: new Date().toISOString() })
          .where(eq(schema.outreachDrafts.advisorId, body.advisorId));
      }
      return c.json({ ok: true, resume });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "上传 PDF 失败" },
        400
      );
    }
  });

  app.get("/api/resumes/:id/view", async (c) => {
    const id = c.req.param("id");
    const row = await db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, id))
      .get();
    if (!row || !fs.existsSync(row.storagePath)) {
      return c.text("PDF not found", 404);
    }
    const bytes = fs.readFileSync(row.storagePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
        "Cache-Control": "no-store",
      },
    });
  });

  app.patch("/api/resumes/:id/default", async (c) => {
    const id = c.req.param("id");
    const row = await db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, id))
      .get();
    if (!row) return c.json({ ok: false, error: "简历不存在" }, 404);

    const now = new Date().toISOString();
    await db
      .update(schema.resumes)
      .set({ isDefault: false })
      .where(eq(schema.resumes.userId, LOCAL_USER_ID));
    await db
      .update(schema.resumes)
      .set({ isDefault: true })
      .where(eq(schema.resumes.id, id));

    const settings = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .get();
    if (settings) {
      await db
        .update(schema.appSettings)
        .set({
          preferences: { ...settings.preferences, defaultResumeId: id },
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));
    }
    return c.json({ ok: true });
  });

  app.delete("/api/resumes/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.resumes).where(eq(schema.resumes.id, id));
    return c.json({ ok: true });
  });

  // --- Mail Accounts & Discovery ---
  app.post("/api/mail-accounts/discover", async (c) => {
    try {
      const input = DiscoverMailAccountInputSchema.parse(await c.req.json());
      const discovery = await discoverMailboxConfig(input.email);
      return c.json({ ok: true, discovery });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "自动识别邮箱失败" },
        400
      );
    }
  });

  app.post("/api/mail-accounts", async (c) => {
    try {
      const input = SaveMailAccountInputSchema.parse(await c.req.json());
      const now = new Date().toISOString();
      const id = input.id || crypto.randomUUID();
      const cleanedCred = (input.credential || "").replace(/\s+/g, "");
      const row = {
        id,
        userId: LOCAL_USER_ID,
        label: input.label,
        email: input.email,
        displayName: input.displayName,
        providerType: input.providerType,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecurity: input.smtpSecurity,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        draftsFolder: input.draftsFolder || "Drafts",
        encryptedCredential: cleanedCred ? encryptSecret(cleanedCred) : "",
        dailyLimit: input.dailyLimit,
        enabled: input.enabled,
        note: input.note,
        lastTestResult: null,
        lastSyncUid: 0,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.mailAccounts).values(row);
      return c.json({ ok: true, account: toPublicMailAccount(row) });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "保存邮箱失败" },
        400
      );
    }
  });

  app.put("/api/mail-accounts/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const input = SaveMailAccountInputSchema.parse(await c.req.json());
      const existing = await db
        .select()
        .from(schema.mailAccounts)
        .where(eq(schema.mailAccounts.id, id))
        .get();
      if (!existing) return c.json({ ok: false, error: "发件箱不存在" }, 404);

      const cleanedCred = (input.credential || "").replace(/\s+/g, "");
      const encryptedCredential =
        input.credentialDirty || (!existing.encryptedCredential && cleanedCred)
          ? encryptSecret(cleanedCred)
          : existing.encryptedCredential;

      const now = new Date().toISOString();
      await db
        .update(schema.mailAccounts)
        .set({
          label: input.label,
          email: input.email,
          displayName: input.displayName,
          providerType: input.providerType,
          smtpHost: input.smtpHost,
          smtpPort: input.smtpPort,
          smtpSecurity: input.smtpSecurity,
          imapHost: input.imapHost,
          imapPort: input.imapPort,
          draftsFolder: input.draftsFolder || "Drafts",
          encryptedCredential,
          dailyLimit: input.dailyLimit,
          enabled: input.enabled,
          note: input.note,
          updatedAt: now,
        })
        .where(eq(schema.mailAccounts.id, id));

      const fresh = await db
        .select()
        .from(schema.mailAccounts)
        .where(eq(schema.mailAccounts.id, id))
        .get();
      return c.json({ ok: true, account: toPublicMailAccount(fresh!) });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "更新邮箱失败" },
        400
      );
    }
  });

  app.delete("/api/mail-accounts/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.mailAccounts).where(eq(schema.mailAccounts.id, id));
    return c.json({ ok: true });
  });

  app.post("/api/mail-accounts/test", async (c) => {
    try {
      const input = TestMailAccountInputSchema.parse(await c.req.json());
      const existing = input.id
        ? await db
            .select()
            .from(schema.mailAccounts)
            .where(eq(schema.mailAccounts.id, input.id))
            .get()
        : undefined;

      const cleanedCred = (input.credential || "").replace(/\s+/g, "");
      const rawCredential =
        input.credentialDirty || !existing
          ? cleanedCred
          : cleanedCred || decryptSecret(existing.encryptedCredential);

      const profile = await db
        .select()
        .from(schema.applicantProfiles)
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
        .get();
      const fallbackDisplayName =
        input.displayName ||
        (profile?.name
          ? profile.affiliation
            ? `${profile.name}（${profile.affiliation}）`
            : profile.name
          : "");

      const testAcc = {
        id: input.id || "temp",
        label: input.label,
        email: input.email,
        displayName: fallbackDisplayName,
        providerType: input.providerType,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecurity: input.smtpSecurity,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        draftsFolder: input.draftsFolder || "Drafts",
        credential: rawCredential,
        lastSyncUid: existing?.lastSyncUid || 0,
      };

      const result = await defaultMailTransport.testConnection(testAcc);
      let savedAccount: MailAccountPublic | null = null;

      if (input.autoSaveOnSuccess && result.smtpOk) {
        const now = new Date().toISOString();
        const enc = encryptSecret(rawCredential);
        if (existing) {
          await db
            .update(schema.mailAccounts)
            .set({
              label: input.label,
              email: input.email,
              displayName: fallbackDisplayName,
              smtpHost: input.smtpHost,
              smtpPort: input.smtpPort,
              smtpSecurity: input.smtpSecurity,
              imapHost: input.imapHost,
              imapPort: input.imapPort,
              draftsFolder: input.draftsFolder || "Drafts",
              encryptedCredential: enc,
              dailyLimit: input.dailyLimit,
              enabled: input.enabled,
              note: input.note,
              lastTestResult: result,
              updatedAt: now,
            })
            .where(eq(schema.mailAccounts.id, existing.id));
          const fresh = await db
            .select()
            .from(schema.mailAccounts)
            .where(eq(schema.mailAccounts.id, existing.id))
            .get();
          savedAccount = toPublicMailAccount(fresh!);
        } else {
          const newId = crypto.randomUUID();
          const newRow = {
            id: newId,
            userId: LOCAL_USER_ID,
            label: input.label,
            email: input.email,
            displayName: fallbackDisplayName,
            providerType: input.providerType,
            smtpHost: input.smtpHost,
            smtpPort: input.smtpPort,
            smtpSecurity: input.smtpSecurity,
            imapHost: input.imapHost,
            imapPort: input.imapPort,
            draftsFolder: input.draftsFolder || "Drafts",
            encryptedCredential: enc,
            dailyLimit: input.dailyLimit,
            enabled: input.enabled,
            note: input.note,
            lastTestResult: result,
            lastSyncUid: 0,
            createdAt: now,
            updatedAt: now,
          };
          await db.insert(schema.mailAccounts).values(newRow);
          savedAccount = toPublicMailAccount(newRow);
        }
      } else if (existing) {
        await db
          .update(schema.mailAccounts)
          .set({ lastTestResult: result, updatedAt: new Date().toISOString() })
          .where(eq(schema.mailAccounts.id, existing.id));
      }

      return c.json({
        ok: true,
        result,
        autoSaved: Boolean(savedAccount),
        account: savedAccount,
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "测试失败" },
        400
      );
    }
  });

  // --- Mail Threads, Send, Draft, Test Self, Sync ---
  async function resolveMailAccount(accountId: string, requireImap = false) {
    const accounts = await db
      .select()
      .from(schema.mailAccounts)
      .where(eq(schema.mailAccounts.userId, LOCAL_USER_ID));

    let chosen =
      accountId && accountId !== "auto"
        ? accounts.find((a) => a.id === accountId)
        : undefined;
    if (!chosen) {
      chosen = accounts.find(
        (a) =>
          a.enabled &&
          a.email &&
          decryptSecret(a.encryptedCredential) &&
          (requireImap ? a.imapHost : a.smtpHost)
      );
    }
    if (!chosen || !chosen.email || !decryptSecret(chosen.encryptedCredential)) {
      throw new Error("尚未配置可用的发件箱，请先打开「设置 → 收发邮箱」填入邮箱并测试保存");
    }
    if (requireImap && !chosen.imapHost) {
      throw new Error(`发件箱【${chosen.label}】未配置 IMAP 服务器`);
    }
    return chosen;
  }

  async function resolveAttachment(params: {
    includeAttachment: boolean;
    resumeId?: string | null;
    advisorId?: string;
    customAttachmentName?: string;
    customAttachmentBase64?: string;
  }): Promise<{ path?: string; name?: string; buffer?: Buffer }> {
    if (params.customAttachmentBase64 && params.customAttachmentName) {
      return {
        name: params.customAttachmentName,
        buffer: Buffer.from(params.customAttachmentBase64, "base64"),
      };
    }
    if (!params.includeAttachment) return {};

    let targetResumeId = params.resumeId || null;
    if (!targetResumeId && params.advisorId) {
      const draft = await db
        .select()
        .from(schema.outreachDrafts)
        .where(eq(schema.outreachDrafts.advisorId, params.advisorId))
        .get();
      targetResumeId = draft?.resumeId || null;
    }
    if (!targetResumeId) {
      const settings = await db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .get();
      targetResumeId = settings?.preferences?.defaultResumeId || null;
    }
    if (!targetResumeId) return {};

    const resumeRow = await db
      .select()
      .from(schema.resumes)
      .where(eq(schema.resumes.id, targetResumeId))
      .get();
    if (!resumeRow || !fs.existsSync(resumeRow.storagePath)) return {};

    return {
      path: resumeRow.storagePath,
      name: resumeRow.filename,
    };
  }

  app.get("/api/mail/threads/:advisorId", async (c) => {
    const advisorId = c.req.param("advisorId");
    const markRead = c.req.query("mark_read") === "1";

    if (markRead) {
      await db
        .update(schema.mailMessages)
        .set({ isUnread: false })
        .where(
          and(
            eq(schema.mailMessages.userId, LOCAL_USER_ID),
            eq(schema.mailMessages.advisorId, advisorId),
            eq(schema.mailMessages.direction, "inbound"),
            eq(schema.mailMessages.isUnread, true)
          )
        );
    }

    const messages = await db
      .select()
      .from(schema.mailMessages)
      .where(
        and(
          eq(schema.mailMessages.userId, LOCAL_USER_ID),
          eq(schema.mailMessages.advisorId, advisorId)
        )
      )
      .orderBy(asc(schema.mailMessages.sentOrReceivedAt));

    const summary = await getUnreadRepliesSummary();
    return c.json({ ok: true, messages, ...summary });
  });

  app.post("/api/mail/send-single", async (c) => {
    try {
      const input = SendSingleMailInputSchema.parse(await c.req.json());
      const accRow = await resolveMailAccount(input.accountId, false);
      const att = await resolveAttachment({
        includeAttachment: input.includeAttachment,
        resumeId: input.resumeId,
        advisorId: input.advisorId,
        customAttachmentName: input.customAttachmentName,
        customAttachmentBase64: input.customAttachmentBase64,
      });

      const sendRes = await defaultMailTransport.sendMessage(
        toTransportAccount(accRow),
        {
          toEmail: input.toEmail,
          subject: input.subject,
          body: input.body,
          attachmentPath: att.path,
          attachmentName: att.name,
          attachmentBuffer: att.buffer,
          inReplyTo: input.inReplyTo || undefined,
          references: input.references || undefined,
        }
      );

      const now = new Date().toISOString();
      let advisorId = input.advisorId || null;

      if (!advisorId && input.autoAddContact) {
        const inst = await findOrCreateInstitution(input.institutionName || "自由联系");
        const createdAdvId = crypto.randomUUID();
        const contactName =
          (input.contactName || "").trim() || input.toEmail.split("@")[0];
        await db.insert(schema.advisors).values({
          id: createdAdvId,
          userId: LOCAL_USER_ID,
          institutionId: inst.id,
          name: contactName,
          dept: "",
          title: "",
          email: input.toEmail,
          homepageUrl: "",
          scholarUrl: "",
          avatarSeed: `${inst.name}::${contactName}`,
          researchTags: [],
          researchSummary: "",
          representativeWorks: [],
          recruitmentSignal: null,
          matchTier: "high",
          matchScore: null,
          stage: "sent",
          inBatch: false,
          assignedAccountId: accRow.id,
          hookNote: "",
          userNotes: "由「写新邮件」自动收录",
          replyNote: "",
          aiInsights: null,
          researchEmbedding: null,
          lastSentAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.outreachDrafts).values({
          id: crypto.randomUUID(),
          advisorId: createdAdvId,
          subject: input.subject,
          body: input.body,
          selectedHook: "",
          resumeId: null,
          preferredAccountId: accRow.id,
          updatedAt: now,
        });
        advisorId = createdAdvId;
      } else if (advisorId) {
        const adv = await db
          .select()
          .from(schema.advisors)
          .where(eq(schema.advisors.id, advisorId))
          .get();
        if (adv) {
          const nextStage =
            adv.stage === "replied" || adv.stage === "interviewing" || input.inReplyTo
              ? adv.stage === "interviewing"
                ? "interviewing"
                : "replied"
              : "sent";
          await db
            .update(schema.advisors)
            .set({
              email: input.toEmail,
              stage: nextStage,
              assignedAccountId: accRow.id,
              lastSentAt: now,
              updatedAt: now,
            })
            .where(eq(schema.advisors.id, advisorId));
        }
      }

      const msgEntry = {
        id: crypto.randomUUID(),
        userId: LOCAL_USER_ID,
        advisorId,
        mailAccountId: accRow.id,
        direction: "outbound" as const,
        fromName: accRow.displayName || accRow.email,
        fromEmail: accRow.email,
        toEmail: input.toEmail,
        subject: input.subject,
        body: input.body,
        attachments: att.name ? [att.name] : [],
        messageId: sendRes.messageId,
        inReplyTo: input.inReplyTo,
        referencesHeader: input.references,
        isUnread: false,
        replyIntent: null,
        extractedTodos: [],
        sentOrReceivedAt: now,
      };
      await db.insert(schema.mailMessages).values(msgEntry);

      return c.json({
        ok: true,
        advisorId,
        message: `已通过【${accRow.label}】成功发送给 ${input.toEmail}`,
        sentMessage: msgEntry,
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "发送失败" },
        500
      );
    }
  });

  app.post("/api/mail/save-draft", async (c) => {
    try {
      const input = SaveSingleDraftInputSchema.parse(await c.req.json());
      const accRow = await resolveMailAccount(input.accountId, true);
      const att = await resolveAttachment({
        includeAttachment: true,
        resumeId: input.resumeId,
      });
      const { folder } = await defaultMailTransport.saveDraft(
        toTransportAccount(accRow),
        {
          toEmail: input.toEmail,
          subject: input.subject,
          body: input.body,
          attachmentPath: att.path,
          attachmentName: att.name,
        }
      );
      return c.json({
        ok: true,
        message: `已存入【${accRow.label}】的邮箱草稿箱（${folder}）`,
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "写入草稿箱失败" },
        500
      );
    }
  });

  app.post("/api/mail/test-self", async (c) => {
    try {
      const input = SelfTestMailInputSchema.parse(await c.req.json());
      const accRow = await resolveMailAccount(input.accountId, false);
      const att = await resolveAttachment({
        includeAttachment: true,
        resumeId: input.resumeId,
      });
      await defaultMailTransport.sendMessage(toTransportAccount(accRow), {
        toEmail: input.testTo,
        subject: `[测试落箱] ${input.subject || "（未填主题）"}`,
        body: input.body || "这是一封预览测试邮件。",
        attachmentPath: att.path,
        attachmentName: att.name,
      });
      return c.json({
        ok: true,
        message: `测试邮件已通过【${accRow.label}】发送至 ${input.testTo}，请检查落箱排版与附件`,
      });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "测试发信失败" },
        500
      );
    }
  });

  app.post("/api/mail/sync-replies", async (c) => {
    if (syncInProgress) {
      const summary = await getUnreadRepliesSummary();
      return c.json({ ok: true, busy: true, newReplies: [], errors: [], ...summary });
    }
    syncInProgress = true;
    try {
      const [accounts, allAdvisors, allInsts, allMessages] = await Promise.all([
        db
          .select()
          .from(schema.mailAccounts)
          .where(eq(schema.mailAccounts.userId, LOCAL_USER_ID)),
        db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
        db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
        db.select().from(schema.mailMessages).where(eq(schema.mailMessages.userId, LOCAL_USER_ID)),
      ]);

      const enabledImap = accounts.filter(
        (a) =>
          a.enabled &&
          a.email &&
          a.imapHost &&
          decryptSecret(a.encryptedCredential)
      );

      if (enabledImap.length === 0) {
        const summary = await getUnreadRepliesSummary();
        return c.json({
          ok: true,
          skipped: true,
          reason: "尚未配置可用的 IMAP 发件箱授权码",
          newReplies: [],
          errors: [],
          ...summary,
        });
      }

      const instMap = new Map(allInsts.map((i) => [i.id, i.name]));
      const advById = new Map(allAdvisors.map((a) => [a.id, a]));

      const ctx: SyncRepliesContext = {
        ownEmails: new Set(accounts.map((a) => a.email.trim().toLowerCase())),
        existingInboundMessageIds: new Set(
          allMessages
            .filter((m) => m.direction === "inbound" && m.messageId)
            .map((m) => m.messageId)
        ),
        contactedEmailMap: new Map(),
        outboundMessageIds: new Map(),
        outboundSubjectMap: new Map(),
      };

      for (const adv of allAdvisors) {
        const em = adv.email.trim().toLowerCase();
        if (
          em &&
          (adv.stage === "sent" ||
            adv.stage === "replied" ||
            adv.stage === "interviewing" ||
            adv.lastSentAt)
        ) {
          ctx.contactedEmailMap.set(em, {
            advisorId: adv.id,
            name: adv.name,
            institutionName: instMap.get(adv.institutionId) || "",
          });
        }
      }

      for (const m of allMessages) {
        if (m.direction !== "outbound" || !m.advisorId) continue;
        const adv = advById.get(m.advisorId);
        if (!adv) continue;
        const ref = {
          advisorId: adv.id,
          name: adv.name,
          institutionName: instMap.get(adv.institutionId) || "",
        };
        if (m.toEmail) ctx.contactedEmailMap.set(m.toEmail.trim().toLowerCase(), ref);
        if (m.messageId) ctx.outboundMessageIds.set(m.messageId.trim(), ref);
        const sk = normalizeSubjectKey(m.subject);
        if (sk.length >= 4) ctx.outboundSubjectMap.set(sk, ref);
      }

      const newReplies: UnreadReplyItem[] = [];
      const errors: string[] = [];

      for (const acc of enabledImap) {
        try {
          const res = await defaultMailTransport.syncReplies(toTransportAccount(acc), ctx);
          if (res.maxUidSeen > acc.lastSyncUid) {
            await db
              .update(schema.mailAccounts)
              .set({ lastSyncUid: res.maxUidSeen, updatedAt: new Date().toISOString() })
              .where(eq(schema.mailAccounts.id, acc.id));
          }
          for (const rep of res.replies) {
            const msgId = crypto.randomUUID();
            await db.insert(schema.mailMessages).values({
              id: msgId,
              userId: LOCAL_USER_ID,
              advisorId: rep.advisorId,
              mailAccountId: acc.id,
              direction: "inbound",
              fromName: rep.fromName,
              fromEmail: rep.fromEmail,
              toEmail: rep.toEmail,
              subject: rep.subject,
              body: rep.body,
              attachments: rep.attachments,
              messageId: rep.messageId,
              inReplyTo: rep.inReplyTo,
              referencesHeader: "",
              isUnread: true,
              replyIntent: null,
              extractedTodos: [],
              sentOrReceivedAt: rep.receivedAt,
            });
            ctx.existingInboundMessageIds.add(rep.messageId);

            const adv = advById.get(rep.advisorId);
            if (adv) {
              const snippet = rep.body.replace(/\s+/g, " ").trim().slice(0, 80);
              const line = `[${rep.receivedAt.slice(0, 16).replace("T", " ")} 回信] ${snippet}`;
              const merged = adv.replyNote ? `${line}\n${adv.replyNote}` : line;
              await db
                .update(schema.advisors)
                .set({
                  stage: adv.stage === "interviewing" ? "interviewing" : "replied",
                  replyNote: merged,
                  updatedAt: new Date().toISOString(),
                })
                .where(eq(schema.advisors.id, adv.id));
            }

            newReplies.push({
              msgId,
              advisorId: rep.advisorId,
              advisorName: rep.advisorName,
              institutionName: rep.institutionName,
              fromEmail: rep.fromEmail,
              subject: rep.subject,
              snippet: rep.body.replace(/\s+/g, " ").trim().slice(0, 110),
              timestamp: rep.receivedAt,
            });
          }
        } catch (err) {
          errors.push(`${acc.label}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const now = new Date().toISOString();
      await db
        .update(schema.appSettings)
        .set({ lastMailSyncAt: now, updatedAt: now })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));

      const summary = await getUnreadRepliesSummary();
      return c.json({ ok: true, newReplies, errors, ...summary });
    } finally {
      syncInProgress = false;
    }
  });

  app.post("/api/mail/mark-read", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      advisorId?: string;
      all?: boolean;
    };
    if (body.all) {
      await db
        .update(schema.mailMessages)
        .set({ isUnread: false })
        .where(
          and(
            eq(schema.mailMessages.userId, LOCAL_USER_ID),
            eq(schema.mailMessages.direction, "inbound"),
            eq(schema.mailMessages.isUnread, true)
          )
        );
    } else if (body.advisorId) {
      await db
        .update(schema.mailMessages)
        .set({ isUnread: false })
        .where(
          and(
            eq(schema.mailMessages.userId, LOCAL_USER_ID),
            eq(schema.mailMessages.advisorId, body.advisorId),
            eq(schema.mailMessages.direction, "inbound"),
            eq(schema.mailMessages.isUnread, true)
          )
        );
    }
    const summary = await getUnreadRepliesSummary();
    return c.json({ ok: true, ...summary });
  });

  // --- Dispatch Queue ---
  app.post("/api/dispatch/plan", async (c) => {
    try {
      const input = StartDispatchInputSchema.parse(await c.req.json());
      const plan = await buildDispatchPlan(input);
      return c.json({ ok: true, plan });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "生成发送计划失败" },
        400
      );
    }
  });

  app.post("/api/dispatch/start", async (c) => {
    try {
      const input = StartDispatchInputSchema.parse(await c.req.json());
      const job = await startDispatchJob(input);
      return c.json({ ok: true, job });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "启动队列失败" },
        400
      );
    }
  });

  app.post("/api/dispatch/stop", async (c) => {
    await requestStopActiveJob();
    return c.json({ ok: true });
  });

  app.get("/api/dispatch/status", async (c) => {
    const [job, quotaToday] = await Promise.all([
      getLatestDispatchJob(),
      getQuotaToday(),
    ]);
    return c.json({ ok: true, job, quotaToday });
  });

  app.post("/api/dispatch/quota/reset", async (c) => {
    const settings = await db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .get();
    const now = new Date().toISOString();
    if (settings) {
      await db
        .update(schema.appSettings)
        .set({
          preferences: { ...settings.preferences, quotaResetAfter: now },
          updatedAt: now,
        })
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID));
    }
    const quotaToday = await getQuotaToday();
    return c.json({ ok: true, quotaToday, quotaResetAfter: now });
  });

  // --- Settings ---
  app.put("/api/settings", async (c) => {
    try {
      const input = UpdateSettingsInputSchema.parse(await c.req.json());
      const existing = await db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .get();
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

  // --- Lightweight CSV / JSON Import & Export (Replacing V1 live xlsx binding) ---
  app.get("/api/data/export/csv", async (c) => {
    const [advisorRows, instRows, draftRows] = await Promise.all([
      db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
      db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
      db.select().from(schema.outreachDrafts),
    ]);
    const instMap = new Map(instRows.map((i) => [i.id, i.name]));
    const draftMap = new Map(draftRows.map((d) => [d.advisorId, d]));

    const rows = advisorRows.map((a) => {
      const d = draftMap.get(a.id);
      return {
        高校: instMap.get(a.institutionId) || "",
        导师姓名: a.name,
        院系: a.dept,
        职称: a.title,
        邮箱: a.email,
        主页: a.homepageUrl,
        匹配度: a.matchTier,
        状态: a.stage,
        研究标签: (a.researchTags || []).join(" | "),
        研究方向: a.researchSummary,
        研究契合笔记: a.hookNote,
        邮件主题: d?.subject || "",
        邮件正文: d?.body || "",
        个人备忘: a.userNotes,
        回信记录: a.replyNote,
        最近联系时间: a.lastSentAt || "",
      };
    });

    const csv = "\uFEFF" + Papa.unparse(rows);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="advisors_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  });

  app.get("/api/data/export/json", async (c) => {
    const [profile, institutions, advisors, drafts] = await Promise.all([
      db
        .select()
        .from(schema.applicantProfiles)
        .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
        .get(),
      db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
      db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
      db.select().from(schema.outreachDrafts),
    ]);

    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), version: "2.0", profile, institutions, advisors, drafts },
      null,
      2
    );
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="phd_workbench_backup_${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  });

  app.post("/api/data/import/csv", async (c) => {
    try {
      const body = (await c.req.json()) as {
        csvText?: string;
        defaultInstitution?: string;
      };
      if (!body.csvText || !body.csvText.trim()) {
        return c.json({ ok: false, error: "CSV 内容不能为空" }, 400);
      }
      const parsed = Papa.parse<Record<string, string>>(body.csvText.trim(), {
        header: true,
        skipEmptyLines: true,
      });

      const pick = (row: Record<string, string>, keys: string[]): string => {
        for (const k of keys) {
          if (row[k] !== undefined && String(row[k]).trim()) {
            return String(row[k]).trim();
          }
        }
        return "";
      };

      let added = 0;
      let skipped = 0;
      const now = new Date().toISOString();

      const existingAll = await db
        .select()
        .from(schema.advisors)
        .where(eq(schema.advisors.userId, LOCAL_USER_ID));
      const seenKeys = new Set(
        existingAll.map((a) => `${a.institutionId}::${a.name.trim()}`)
      );

      for (const row of parsed.data) {
        const name = pick(row, ["导师姓名", "姓名", "name", "Name"]);
        if (!name) continue;
        const school =
          pick(row, ["高校", "学校", "institution", "school", "School"]) ||
          body.defaultInstitution ||
          "导入高校";
        const inst = await findOrCreateInstitution(school);
        const dupKey = `${inst.id}::${name}`;
        if (seenKeys.has(dupKey)) {
          skipped += 1;
          continue;
        }

        const email = pick(row, ["邮箱", "公开邮箱", "email", "Email"]);
        const dept = pick(row, ["院系", "学院", "学院/单位", "dept"]);
        const title = pick(row, ["职称", "职称与博导资格", "title"]);
        const homepageUrl = pick(row, ["主页", "官网", "homepage", "homepageUrl"]);
        const tagsRaw = pick(row, ["研究标签", "匹配方向标签", "tags"]);
        const research = pick(row, ["研究方向", "详细研究方向与代表亮点", "research"]);
        const hookNote = pick(row, ["研究契合笔记", "切入点", "hook"]);
        const userNotes = pick(row, ["个人备忘", "个人备注 / 来源", "note"]);
        const matchRaw = pick(row, ["匹配度", "优先级", "priority", "matchTier"]);
        const stageRaw = pick(row, ["状态", "沟通状态", "投递状态", "stage", "status"]);
        const subject = pick(row, ["邮件主题", "subject"]);
        const draftBody = pick(row, ["邮件正文", "body"]);

        const advisorId = crypto.randomUUID();
        await db.insert(schema.advisors).values({
          id: advisorId,
          userId: LOCAL_USER_ID,
          institutionId: inst.id,
          name,
          dept,
          title,
          email,
          homepageUrl,
          scholarUrl: "",
          avatarSeed: `${inst.name}::${name}`,
          researchTags: tagsRaw
            ? tagsRaw.split(/[|,，/]/).map((s) => s.trim()).filter(Boolean)
            : [],
          researchSummary: research,
          representativeWorks: [],
          recruitmentSignal: null,
          matchTier: normalizeMatchTier(matchRaw),
          matchScore: null,
          stage: normalizeAdvisorStage(stageRaw),
          inBatch: true,
          assignedAccountId: "auto",
          hookNote,
          userNotes,
          replyNote: "",
          aiInsights: null,
          researchEmbedding: null,
          lastSentAt: null,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.outreachDrafts).values({
          id: crypto.randomUUID(),
          advisorId,
          subject,
          body: draftBody,
          selectedHook: hookNote,
          resumeId: null,
          preferredAccountId: "auto",
          updatedAt: now,
        });
        seenKeys.add(dupKey);
        added += 1;
      }

      return c.json({ ok: true, added, skipped });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "CSV 导入失败" },
        400
      );
    }
  });

  return app;
}
