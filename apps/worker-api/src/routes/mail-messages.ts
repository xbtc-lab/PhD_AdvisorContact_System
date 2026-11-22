import crypto from "node:crypto";
import fs from "node:fs";
import { Hono } from "hono";
import {
  normalizeSubjectKey,
  SaveSingleDraftInputSchema,
  SelfTestMailInputSchema,
  SendSingleMailInputSchema,
  type UnreadReplyItem,
} from "@app/shared";
import {
  and,
  asc,
  db,
  decryptSecret,
  eq,
  firstOrNull,
  LOCAL_USER_ID,
  schema,
} from "@app/db";
import { findOrCreateInstitution, getUnreadRepliesSummary } from "../helpers/domain.js";
import { toTransportAccount } from "../services/dispatch-worker.js";
import { defaultMailTransport, type SyncRepliesContext } from "../services/mail-transport.js";

/**
 * 单封邮件发送、存入邮箱草稿箱、自测落箱、往来线程查询与 IMAP 自动拉信路由。
 */
export function createMailMessageRoutes() {
  const router = new Hono();
  let syncInProgress = false;

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
      const draft = await firstOrNull(
        db
          .select()
          .from(schema.outreachDrafts)
          .where(eq(schema.outreachDrafts.advisorId, params.advisorId))
          .limit(1)
      );
      targetResumeId = draft?.resumeId || null;
    }
    if (!targetResumeId) {
      const settings = await firstOrNull(
        db
          .select()
          .from(schema.appSettings)
          .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
          .limit(1)
      );
      targetResumeId = settings?.preferences?.defaultResumeId || null;
    }
    if (!targetResumeId) return {};

    const resumeRow = await firstOrNull(
      db.select().from(schema.resumes).where(eq(schema.resumes.id, targetResumeId)).limit(1)
    );
    if (!resumeRow || !fs.existsSync(resumeRow.storagePath)) return {};

    return {
      path: resumeRow.storagePath,
      name: resumeRow.filename,
    };
  }

  router.get("/api/mail/threads/:advisorId", async (c) => {
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

  router.post("/api/mail/send-single", async (c) => {
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
          catalogAdvisorId: null,
          name: contactName,
          dept: "",
          title: "",
          honorBadge: "",
          email: input.toEmail,
          homepageUrl: "",
          scholarUrl: "",
          avatarSeed: `${inst.name}::${contactName}`,
          photoUrl: "",
          photoSource: "",
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
          trackSummary: "",
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
          templateStyle: "editorial",
          embedContactCard: true,
          updatedAt: now,
        });
        advisorId = createdAdvId;
      } else if (advisorId) {
        const adv = await firstOrNull(
          db.select().from(schema.advisors).where(eq(schema.advisors.id, advisorId)).limit(1)
        );
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

  router.post("/api/mail/save-draft", async (c) => {
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

  router.post("/api/mail/test-self", async (c) => {
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

  router.post("/api/mail/sync-replies", async (c) => {
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

  router.post("/api/mail/mark-read", async (c) => {
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

  return router;
}
