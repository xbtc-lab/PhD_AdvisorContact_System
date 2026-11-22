import crypto from "node:crypto";
import { Hono } from "hono";
import {
  DiscoverMailAccountInputSchema,
  SaveMailAccountInputSchema,
  TestMailAccountInputSchema,
  type MailAccountPublic,
} from "@app/shared";
import { db, decryptSecret, encryptSecret, eq, firstOrNull, LOCAL_USER_ID, schema } from "@app/db";
import { toPublicMailAccount } from "../helpers/domain.js";
import { discoverMailboxConfig } from "../services/mail-discovery.js";
import { defaultMailTransport } from "../services/mail-transport.js";

/**
 * 发件箱管理、MX 自动识别与 SMTP/IMAP 连通性测试路由。
 */
export function createMailAccountRoutes() {
  const router = new Hono();

  router.post("/api/mail-accounts/discover", async (c) => {
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

  router.post("/api/mail-accounts", async (c) => {
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

  router.put("/api/mail-accounts/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const input = SaveMailAccountInputSchema.parse(await c.req.json());
      const existing = await firstOrNull(
        db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id)).limit(1)
      );
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

      const fresh = await firstOrNull(
        db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, id)).limit(1)
      );
      return c.json({ ok: true, account: toPublicMailAccount(fresh!) });
    } catch (err) {
      return c.json(
        { ok: false, error: err instanceof Error ? err.message : "更新邮箱失败" },
        400
      );
    }
  });

  router.delete("/api/mail-accounts/:id", async (c) => {
    const id = c.req.param("id");
    await db.delete(schema.mailAccounts).where(eq(schema.mailAccounts.id, id));
    return c.json({ ok: true });
  });

  router.post("/api/mail-accounts/test", async (c) => {
    try {
      const input = TestMailAccountInputSchema.parse(await c.req.json());
      const existing = input.id
        ? await firstOrNull(
            db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.id, input.id)).limit(1)
          )
        : undefined;

      const cleanedCred = (input.credential || "").replace(/\s+/g, "");
      const rawCredential =
        input.credentialDirty || !existing
          ? cleanedCred
          : cleanedCred || decryptSecret(existing.encryptedCredential);

      const profile = await firstOrNull(
        db
          .select()
          .from(schema.applicantProfiles)
          .where(eq(schema.applicantProfiles.userId, LOCAL_USER_ID))
          .limit(1)
      );
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
          const fresh = await firstOrNull(
            db
              .select()
              .from(schema.mailAccounts)
              .where(eq(schema.mailAccounts.id, existing.id))
              .limit(1)
          );
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

  return router;
}
