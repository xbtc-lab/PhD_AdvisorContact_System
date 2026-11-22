import dns from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import { ImapFlow, type MessageStructureObject } from "imapflow";
import { normalizeSubjectKey, type MailAccountTestResult } from "@app/shared";

export interface MailTransportAccount {
  id: string;
  label: string;
  email: string;
  displayName: string;
  providerType: "imap_smtp" | "ms_graph" | "gmail_api";
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "SSL" | "STARTTLS" | "NONE";
  imapHost: string;
  imapPort: number;
  draftsFolder: string;
  credential: string;
  lastSyncUid: number;
}

export interface SendMessagePayload {
  toEmail: string;
  subject: string;
  body: string;
  attachmentPath?: string;
  attachmentName?: string;
  attachmentBuffer?: Buffer;
  inReplyTo?: string;
  references?: string;
}

export interface SendMessageResult {
  messageId: string;
}

export interface InboundReplyItem {
  uid: number;
  advisorId: string;
  advisorName: string;
  institutionName: string;
  fromName: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  attachments: string[];
  messageId: string;
  inReplyTo: string;
  receivedAt: string;
}

export interface SyncRepliesContext {
  ownEmails: Set<string>;
  existingInboundMessageIds: Set<string>;
  contactedEmailMap: Map<string, { advisorId: string; name: string; institutionName: string }>;
  outboundMessageIds: Map<string, { advisorId: string; name: string; institutionName: string }>;
  outboundSubjectMap: Map<string, { advisorId: string; name: string; institutionName: string }>;
}

export interface SyncRepliesResult {
  replies: InboundReplyItem[];
  maxUidSeen: number;
}

export interface MailTransport {
  testConnection(account: MailTransportAccount): Promise<MailAccountTestResult>;
  sendMessage(account: MailTransportAccount, payload: SendMessagePayload): Promise<SendMessageResult>;
  saveDraft(account: MailTransportAccount, payload: SendMessagePayload): Promise<{ folder: string }>;
  syncReplies(account: MailTransportAccount, ctx: SyncRepliesContext): Promise<SyncRepliesResult>;
}

async function detectProxyDiagnostic(host: string, errMsg: string): Promise<string> {
  if (!host) return "";
  let resolvedIp = "";
  try {
    if (net.isIP(host)) {
      resolvedIp = host;
    } else {
      const res = await dns.lookup(host);
      resolvedIp = res.address;
    }
  } catch {
    resolvedIp = "";
  }
  const low = errMsg.toLowerCase();
  if (resolvedIp.startsWith("198.18.") || resolvedIp.startsWith("198.19.")) {
    return `（检测到 ${host} 被解析为代理假 IP ${resolvedIp}，VPN/TUN 全局代理常会拦截 SMTP 端口；请关闭 TUN 模式或将邮箱域名设为直连后重试）`;
  }
  if (low.includes("unexpected eof") || low.includes("timed out") || low.includes("econnreset")) {
    return "（连接被中途断开或超时，如当前开启了代理软件 TUN 模式，请尝试关闭或切换直连后重试）";
  }
  return "";
}

function buildSmtpTransport(account: MailTransportAccount) {
  const sec = account.smtpSecurity.toUpperCase();
  const secure = sec === "SSL";
  const requireTLS = sec === "STARTTLS";
  const ignoreTLS = sec === "NONE";

  return nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure,
    requireTLS,
    ignoreTLS,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: account.email,
      pass: account.credential,
    },
    tls: {
      minVersion: "TLSv1.2",
    },
  });
}

function buildMailOptions(account: MailTransportAccount, payload: SendMessagePayload) {
  const displayName = (account.displayName || "").trim() || account.email;
  const from = displayName && displayName !== account.email
    ? `"${displayName.replace(/"/g, "")}" <${account.email}>`
    : account.email;

  const attachments: Array<{ filename: string; path?: string; content?: Buffer }> = [];
  if (payload.attachmentBuffer && payload.attachmentName) {
    attachments.push({
      filename: payload.attachmentName,
      content: payload.attachmentBuffer,
    });
  } else if (payload.attachmentPath) {
    attachments.push({
      filename: payload.attachmentName || "resume.pdf",
      path: payload.attachmentPath,
    });
  }

  const headers: Record<string, string> = {};
  if (payload.inReplyTo) {
    headers["In-Reply-To"] = payload.inReplyTo.trim();
    const refs = payload.references
      ? `${payload.references.trim()} ${payload.inReplyTo.trim()}`.trim()
      : payload.inReplyTo.trim();
    headers["References"] = refs;
  }

  return {
    from,
    to: payload.toEmail,
    subject: payload.subject,
    text: payload.body,
    attachments,
    headers,
  };
}

function createImapClient(account: MailTransportAccount): ImapFlow {
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: true,
    logger: false,
    connectionTimeout: 18000,
    greetingTimeout: 12000,
    socketTimeout: 25000,
    auth: {
      user: account.email,
      pass: account.credential,
    },
    clientInfo: {
      name: "PhDOutreachWorkbench",
      version: "2.0.0",
      vendor: "local",
    },
  });
}

function stripHtmlSimple(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walkStructureForTextAndAttachments(node?: MessageStructureObject): {
  plainPart?: string;
  htmlPart?: string;
  attachments: string[];
} {
  const attachments: string[] = [];
  let plainPart: string | undefined;
  let htmlPart: string | undefined;

  function visit(cur?: MessageStructureObject) {
    if (!cur) return;
    const disp = (cur.disposition || "").toLowerCase();
    const fname = cur.dispositionParameters?.filename || cur.parameters?.name;
    if (disp === "attachment" || (fname && !cur.type?.startsWith("text/"))) {
      if (fname) attachments.push(fname);
      return;
    }
    const ctype = (cur.type || "").toLowerCase();
    if (ctype === "text/plain" && !plainPart && cur.part) {
      plainPart = cur.part;
    } else if (ctype === "text/html" && !htmlPart && cur.part) {
      htmlPart = cur.part;
    }
    if (cur.childNodes) {
      for (const child of cur.childNodes) {
        visit(child);
      }
    }
  }

  visit(node);
  return { plainPart, htmlPart, attachments };
}

export class ImapSmtpTransport implements MailTransport {
  async testConnection(account: MailTransportAccount): Promise<MailAccountTestResult> {
    const testedAt = new Date().toISOString();
    const result: MailAccountTestResult = {
      smtpOk: false,
      smtpMsg: "",
      imapOk: false,
      imapMsg: "",
      testedAt,
    };

    if (!account.email || !account.credential) {
      result.smtpMsg = "请先填写邮箱地址和授权码/密码";
      return result;
    }

    // SMTP verify
    try {
      const transporter = buildSmtpTransport(account);
      await transporter.verify();
      transporter.close();
      result.smtpOk = true;
      result.smtpMsg = "SMTP 登录验证通过";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      let hint = "";
      if (msg.includes("535")) {
        if (account.smtpHost.includes("163")) {
          hint = "（提示：163 邮箱必须填客户端授权码，不能填网页登录密码）";
        } else if (account.smtpHost.includes("qq.com")) {
          hint = "（提示：QQ 邮箱请填 16 位客户端授权码，不能填 QQ 密码）";
        } else if (account.smtpHost.includes("outlook") || account.smtpHost.includes("office365")) {
          hint = "（提示：微软个人 Outlook 对传统密码限制较多，建议改用高校邮箱或 163/QQ）";
        }
      }
      if (!hint) {
        hint = await detectProxyDiagnostic(account.smtpHost, msg);
      }
      result.smtpMsg = `SMTP 失败：${msg}${hint}`;
    }

    // IMAP verify
    if (account.imapHost) {
      const imap = createImapClient(account);
      try {
        await imap.connect();
        const boxes = await imap.list();
        const draftBox =
          boxes.find((b) => b.specialUse === "\\Drafts")?.path ||
          boxes.find((b) => b.path.toLowerCase() === "drafts")?.path ||
          account.draftsFolder ||
          "Drafts";
        await imap.logout().catch(() => {});
        result.imapOk = true;
        result.imapMsg = `IMAP 登录通过（草稿箱：${draftBox}）`;
      } catch (err) {
        imap.close();
        const msg = err instanceof Error ? err.message : String(err);
        result.imapMsg = `IMAP 失败：${msg}`;
      }
    } else {
      result.imapMsg = "未配置 IMAP（仅影响草稿箱写入与自动查收导师回信）";
    }

    return result;
  }

  async sendMessage(
    account: MailTransportAccount,
    payload: SendMessagePayload
  ): Promise<SendMessageResult> {
    const transporter = buildSmtpTransport(account);
    try {
      const info = await transporter.sendMail(buildMailOptions(account, payload));
      return { messageId: info.messageId || "" };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const hint = await detectProxyDiagnostic(account.smtpHost, raw);
      throw new Error(`发送失败：${raw}${hint}`);
    } finally {
      transporter.close();
    }
  }

  async saveDraft(
    account: MailTransportAccount,
    payload: SendMessagePayload
  ): Promise<{ folder: string }> {
    if (!account.imapHost) {
      throw new Error("该发件箱未配置 IMAP 服务器地址");
    }
    const composer = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "windows",
    });
    const compiled = await composer.sendMail(buildMailOptions(account, payload));
    const rawBuffer = Buffer.isBuffer(compiled.message)
      ? compiled.message
      : Buffer.from(String(compiled.message));

    const imap = createImapClient(account);
    try {
      await imap.connect();
      const boxes = await imap.list();
      const folder =
        boxes.find((b) => b.specialUse === "\\Drafts")?.path ||
        boxes.find((b) => b.path.toLowerCase() === "drafts")?.path ||
        account.draftsFolder ||
        "Drafts";

      await imap.append(folder, rawBuffer, ["\\Draft"]);
      await imap.logout().catch(() => {});
      return { folder };
    } finally {
      imap.close();
    }
  }

  async syncReplies(
    account: MailTransportAccount,
    ctx: SyncRepliesContext
  ): Promise<SyncRepliesResult> {
    if (!account.imapHost || !account.credential) {
      return { replies: [], maxUidSeen: account.lastSyncUid };
    }

    const imap = createImapClient(account);
    const replies: InboundReplyItem[] = [];
    let maxUidSeen = account.lastSyncUid;

    try {
      await imap.connect();
      const lock = await imap.getMailboxLock("INBOX", { readOnly: true });
      try {
        const searchQuery =
          account.lastSyncUid > 0 ? { uid: `${account.lastSyncUid + 1}:*` } : { all: true };
        const matchedUids = await imap.search(searchQuery, { uid: true });
        if (!matchedUids || matchedUids.length === 0) {
          return { replies: [], maxUidSeen };
        }

        const targetUids = matchedUids
          .filter((u) => u > account.lastSyncUid)
          .slice(-60);
        if (targetUids.length === 0) {
          return { replies: [], maxUidSeen };
        }

        const messages = await imap.fetchAll(
          targetUids,
          {
            uid: true,
            envelope: true,
            bodyStructure: true,
            headers: ["message-id", "in-reply-to", "references"],
          },
          { uid: true }
        );

        for (const msg of messages) {
          if (msg.uid > maxUidSeen) maxUidSeen = msg.uid;

          const env = msg.envelope;
          const fromObj = env?.from?.[0];
          const fromAddr = (fromObj?.address || "").trim().toLowerCase();
          if (!fromAddr || ctx.ownEmails.has(fromAddr)) continue;

          const headerStr = msg.headers ? msg.headers.toString("utf8") : "";
          const midMatch = headerStr.match(/^Message-ID:\s*(.+)$/im);
          const inReplyMatch = headerStr.match(/^In-Reply-To:\s*(.+)$/im);
          const refsMatch = headerStr.match(/^References:\s*(.+)$/im);

          const messageId = (env?.messageId || midMatch?.[1] || `imap-${account.id}-${msg.uid}`).trim();
          if (ctx.existingInboundMessageIds.has(messageId)) continue;

          const inReplyTo = (env?.inReplyTo || inReplyMatch?.[1] || "").trim();
          const refs = (refsMatch?.[1] || "").trim();
          const subject = (env?.subject || "（无主题）").trim();
          const subjKey = normalizeSubjectKey(subject);

          let matched = ctx.contactedEmailMap.get(fromAddr);
          if (!matched && (inReplyTo || refs)) {
            for (const tok of `${inReplyTo} ${refs}`.split(/\s+/)) {
              const hit = ctx.outboundMessageIds.get(tok.trim());
              if (hit) {
                matched = hit;
                break;
              }
            }
          }
          if (!matched && subjKey && /^(?:re|回复|答复)\s*[:：]/i.test(subject)) {
            matched = ctx.outboundSubjectMap.get(subjKey);
          }

          if (!matched) continue;

          // Whitelist hit! Download body part cleanly
          const { plainPart, htmlPart, attachments } = walkStructureForTextAndAttachments(
            msg.bodyStructure
          );

          let bodyText = "";
          const partsToDownload = [plainPart, htmlPart].filter((x): x is string => Boolean(x));
          if (partsToDownload.length > 0) {
            const downloaded = await imap.downloadMany(String(msg.uid), partsToDownload, {
              uid: true,
            });
            if (plainPart && downloaded[plainPart]?.content) {
              bodyText = downloaded[plainPart].content!.toString("utf8").trim();
            } else if (htmlPart && downloaded[htmlPart]?.content) {
              bodyText = stripHtmlSimple(downloaded[htmlPart].content!.toString("utf8"));
            }
          } else {
            // Single-part message fallback
            const full = await imap.fetchOne(String(msg.uid), { source: true }, { uid: true });
            if (full && full.source) {
              const rawStr = full.source.toString("utf8");
              const splitIdx = rawStr.indexOf("\r\n\r\n");
              bodyText = splitIdx !== -1 ? rawStr.slice(splitIdx + 4).trim() : rawStr.trim();
            }
          }

          const receivedAt = env?.date
            ? new Date(env.date).toISOString()
            : new Date().toISOString();

          replies.push({
            uid: msg.uid,
            advisorId: matched.advisorId,
            advisorName: matched.name,
            institutionName: matched.institutionName,
            fromName: fromObj?.name || matched.name,
            fromEmail: fromAddr,
            toEmail: account.email,
            subject,
            body: bodyText || "（邮件正文为空或仅包含图片/附件）",
            attachments,
            messageId,
            inReplyTo,
            receivedAt,
          });
        }
      } finally {
        lock.release();
      }
      await imap.logout().catch(() => {});
      return { replies, maxUidSeen };
    } finally {
      imap.close();
    }
  }
}

export const defaultMailTransport: MailTransport = new ImapSmtpTransport();
