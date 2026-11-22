import crypto from "node:crypto";
import fs from "node:fs";
import {
  DEFAULT_POLICY_CONFIG,
  extractDomain,
  interleaveByDomain,
  normalizeMatchTier,
  type DispatchAccountSummary,
  type DispatchJob,
  type DispatchJobItemStatus,
  type DispatchPlan,
  type DispatchPlanItem,
  type PolicyConfig,
} from "@app/shared";
import {
  and,
  asc,
  db,
  decryptSecret,
  desc,
  eq,
  firstOrNull,
  LOCAL_USER_ID,
  schema,
} from "@app/db";
import {
  defaultMailTransport,
  type MailTransportAccount,
} from "./mail-transport.js";

function localDateStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTimeLogPrefix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`;
}

function toTransportAccount(
  row: typeof schema.mailAccounts.$inferSelect
): MailTransportAccount {
  return {
    id: row.id,
    label: row.label,
    email: row.email,
    displayName: row.displayName,
    providerType: row.providerType as MailTransportAccount["providerType"],
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: row.smtpSecurity as MailTransportAccount["smtpSecurity"],
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    draftsFolder: row.draftsFolder,
    credential: decryptSecret(row.encryptedCredential),
    lastSyncUid: row.lastSyncUid,
  };
}

export async function getQuotaToday(targetDate?: string): Promise<Record<string, number>> {
  const today = localDateStr();
  const day = targetDate || today;
  const settings = await firstOrNull(
    db
      .select()
      .from(schema.appSettings)
      .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
      .limit(1)
  );
  const resetAfter = day === today ? settings?.preferences?.quotaResetAfter || "" : "";

  const msgs = await db
    .select()
    .from(schema.mailMessages)
    .where(
      and(
        eq(schema.mailMessages.userId, LOCAL_USER_ID),
        eq(schema.mailMessages.direction, "outbound")
      )
    );

  const counts: Record<string, number> = {};
  for (const m of msgs) {
    if (!m.mailAccountId) continue;
    const msgLocalDay = localDateStr(new Date(m.sentOrReceivedAt));
    if (msgLocalDay !== day) continue;
    if (resetAfter && m.sentOrReceivedAt <= resetAfter) continue;
    counts[m.mailAccountId] = (counts[m.mailAccountId] || 0) + 1;
  }
  return counts;
}

export async function buildDispatchPlan(params: {
  mode: "send" | "draft";
  advisorIds?: string[];
  ignoreQuota?: boolean;
  scheduledStartAt?: string;
}): Promise<DispatchPlan> {
  const mode = params.mode;
  const ignoreQuota = Boolean(params.ignoreQuota);
  const today = localDateStr();

  let startDt: Date | null = null;
  if (params.scheduledStartAt && params.scheduledStartAt.trim()) {
    const parsed = new Date(params.scheduledStartAt.trim());
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      startDt = parsed;
    }
  }
  const targetDate = startDt ? localDateStr(startDt) : today;
  const isFutureDate = targetDate !== today;

  const [
    allAdvisors,
    allInsts,
    allDrafts,
    allResumes,
    allAccounts,
    settings,
    outboundMsgs,
  ] = await Promise.all([
    db.select().from(schema.advisors).where(eq(schema.advisors.userId, LOCAL_USER_ID)),
    db.select().from(schema.institutions).where(eq(schema.institutions.userId, LOCAL_USER_ID)),
    db.select().from(schema.outreachDrafts),
    db.select().from(schema.resumes).where(eq(schema.resumes.userId, LOCAL_USER_ID)),
    db.select().from(schema.mailAccounts).where(eq(schema.mailAccounts.userId, LOCAL_USER_ID)),
    firstOrNull(
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .limit(1)
    ),
    db
      .select()
      .from(schema.mailMessages)
      .where(
        and(
          eq(schema.mailMessages.userId, LOCAL_USER_ID),
          eq(schema.mailMessages.direction, "outbound")
        )
      ),
  ]);

  const policy: PolicyConfig = settings?.policyConfig || { ...DEFAULT_POLICY_CONFIG };
  const defaultResumeId = settings?.preferences?.defaultResumeId || null;

  const instMap = new Map(allInsts.map((i) => [i.id, i]));
  const draftByAdvisor = new Map(allDrafts.map((d) => [d.advisorId, d]));
  const resumeMap = new Map(allResumes.map((r) => [r.id, r]));
  const defaultResume =
    (defaultResumeId ? resumeMap.get(defaultResumeId) : undefined) ||
    allResumes.find((r) => r.isDefault) ||
    null;

  const sentEmails = new Set(outboundMsgs.map((m) => m.toEmail.trim().toLowerCase()));
  const quotaUsed = mode === "send" ? await getQuotaToday(targetDate) : {};

  const enabledAccounts = allAccounts.filter(
    (a) =>
      a.enabled &&
      a.email.trim() &&
      decryptSecret(a.encryptedCredential).trim() &&
      a.smtpHost.trim()
  );
  const accById = new Map(allAccounts.map((a) => [a.id, a]));

  const remaining = new Map<string, number>();
  const plannedCounts = new Map<string, number>();
  for (const a of enabledAccounts) {
    const used = quotaUsed[a.id] || 0;
    remaining.set(a.id, mode === "send" ? Math.max(0, a.dailyLimit - used) : a.dailyLimit);
    plannedCounts.set(a.id, 0);
  }

  let targets = params.advisorIds?.length
    ? allAdvisors.filter((a) => params.advisorIds!.includes(a.id))
    : allAdvisors.filter((a) => a.stage === "ready");

  if (policy.avoidConsecutiveSameDomain) {
    targets = interleaveByDomain(targets);
  }

  const lastDomainByAcc = new Map<string, string>();
  const planItems: DispatchPlanItem[] = [];

  for (const adv of targets) {
    const inst = instMap.get(adv.institutionId);
    const draft = draftByAdvisor.get(adv.id);
    const issues: string[] = [];
    const warnings: string[] = [];

    const toEmail = adv.email.trim();
    const subject = (draft?.subject || "").trim();
    const body = (draft?.body || "").trim();
    if (!toEmail.includes("@")) issues.push("缺少有效收件邮箱");
    if (!subject) issues.push("缺少邮件主题");
    if (!body) issues.push("缺少邮件正文");

    const effResume =
      (draft?.resumeId ? resumeMap.get(draft.resumeId) : undefined) || defaultResume;
    const resumeExists = Boolean(effResume && fs.existsSync(effResume.storagePath));
    const resumeSizeMb = effResume
      ? Number((effResume.sizeBytes / (1024 * 1024)).toFixed(2))
      : 0;

    if (!resumeExists) {
      warnings.push("未挂载 PDF 简历，将以纯文本发送");
    } else if (resumeSizeMb > policy.maxAttachmentMb) {
      warnings.push(`附件 ${resumeSizeMb} MB 超过建议上限 ${policy.maxAttachmentMb} MB`);
    }

    if (mode === "send" && toEmail && sentEmails.has(toEmail.toLowerCase())) {
      warnings.push("历史记录显示已向该邮箱发送过，请确认是否重复发送");
    }

    const preferred =
      draft?.preferredAccountId && draft.preferredAccountId !== "auto"
        ? draft.preferredAccountId
        : adv.assignedAccountId || "auto";

    let chosenAcc: (typeof allAccounts)[number] | undefined;
    const dom = extractDomain(toEmail);

    if (preferred && preferred !== "auto") {
      const candidate = accById.get(preferred);
      if (!candidate || !candidate.enabled) {
        issues.push("指定发件箱未启用或已删除");
      } else if (!candidate.email || !decryptSecret(candidate.encryptedCredential)) {
        issues.push(`指定发件箱【${candidate.label}】未填邮箱或授权码`);
      } else if ((remaining.get(candidate.id) ?? 0) <= 0 && !(mode === "send" && ignoreQuota)) {
        issues.push(`指定发件箱【${candidate.label}】今日配额已满`);
      } else {
        chosenAcc = candidate;
        if ((remaining.get(candidate.id) ?? 0) <= 0 && mode === "send" && ignoreQuota) {
          warnings.push(`【${candidate.label}】已超今日配额上限，按个人选择强行排入`);
        }
      }
    } else {
      const avail = enabledAccounts.filter((a) => (remaining.get(a.id) ?? 0) > 0);
      if (avail.length > 0) {
        avail.sort((a, b) => {
          const sameA = lastDomainByAcc.get(a.id) === dom ? 1 : 0;
          const sameB = lastDomainByAcc.get(b.id) === dom ? 1 : 0;
          if (sameA !== sameB) return sameA - sameB;
          return (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0);
        });
        chosenAcc = avail[0];
      } else if (mode === "send" && ignoreQuota && enabledAccounts.length > 0) {
        const sorted = [...enabledAccounts].sort((a, b) => {
          const sameA = lastDomainByAcc.get(a.id) === dom ? 1 : 0;
          const sameB = lastDomainByAcc.get(b.id) === dom ? 1 : 0;
          if (sameA !== sameB) return sameA - sameB;
          const loadA = (plannedCounts.get(a.id) ?? 0) + (quotaUsed[a.id] ?? 0);
          const loadB = (plannedCounts.get(b.id) ?? 0) + (quotaUsed[b.id] ?? 0);
          return loadA - loadB;
        });
        chosenAcc = sorted[0];
        warnings.push("已达今日默认配额，已按个人选择继续轮换排入");
      } else {
        issues.push("暂无可用发件箱或今日配额已满（请先配置邮箱，或开启「允许超出今日限额」）");
      }
    }

    if (chosenAcc && issues.length === 0) {
      const rem = remaining.get(chosenAcc.id) ?? 0;
      if (rem > 0) remaining.set(chosenAcc.id, rem - 1);
      plannedCounts.set(chosenAcc.id, (plannedCounts.get(chosenAcc.id) ?? 0) + 1);
      lastDomainByAcc.set(chosenAcc.id, dom);
    }

    planItems.push({
      advisorId: adv.id,
      advisorName: adv.name,
      institutionName: inst?.name || "",
      dept: adv.dept,
      matchTier: normalizeMatchTier(adv.matchTier),
      toEmail,
      domain: dom,
      subject,
      resumeId: resumeExists && effResume ? effResume.id : null,
      resumeName: resumeExists && effResume ? effResume.filename : "",
      resumeSizeMb: resumeExists ? resumeSizeMb : 0,
      accountId: chosenAcc?.id || "",
      accountLabel: chosenAcc?.label || "",
      fromEmail: chosenAcc?.email || "",
      ready: issues.length === 0,
      issues,
      warnings,
    });
  }

  const accountsSummary: DispatchAccountSummary[] = allAccounts.map((a) => {
    const used = mode === "send" ? quotaUsed[a.id] || 0 : 0;
    const planned = planItems.filter((it) => it.ready && it.accountId === a.id).length;
    return {
      id: a.id,
      label: a.label,
      email: a.email,
      enabled: a.enabled,
      configured: Boolean(a.email && decryptSecret(a.encryptedCredential) && a.smtpHost),
      dailyLimit: a.dailyLimit,
      usedToday: used,
      planned,
      remainingAfter: Math.max(0, a.dailyLimit - used - planned),
    };
  });

  return {
    mode,
    total: planItems.length,
    readyCount: planItems.filter((i) => i.ready).length,
    blockedCount: planItems.filter((i) => !i.ready).length,
    items: planItems,
    accounts: accountsSummary,
    ignoreQuota,
    targetDate,
    isFutureDate,
  };
}

// Live in-memory transient counters synchronized with DB job rows
const runtimeTracker = {
  activeJobId: null as string | null,
  stopRequested: false,
  scheduleWaitSeconds: 0,
  waitingSeconds: 0,
  currentItemId: null as string | null,
  nextItemId: null as string | null,
};

export async function reconcileStaleJobs(): Promise<void> {
  const stale = await db
    .select()
    .from(schema.dispatchJobs)
    .where(eq(schema.dispatchJobs.userId, LOCAL_USER_ID));
  const now = new Date().toISOString();
  for (const job of stale) {
    if (job.status === "running" || job.status === "waiting_schedule") {
      await db
        .update(schema.dispatchJobs)
        .set({
          status: "stopped",
          finishedAt: now,
          logs: [...job.logs, `${localTimeLogPrefix()} 服务重启，未执行队列已安全停止。`],
        })
        .where(eq(schema.dispatchJobs.id, job.id));
    }
  }
}

export async function requestStopActiveJob(): Promise<boolean> {
  if (!runtimeTracker.activeJobId) return false;
  runtimeTracker.stopRequested = true;
  await db
    .update(schema.dispatchJobs)
    .set({ stopRequested: true })
    .where(eq(schema.dispatchJobs.id, runtimeTracker.activeJobId));
  return true;
}

export async function getLatestDispatchJob(): Promise<DispatchJob | null> {
  const job = await firstOrNull(
    db
      .select()
      .from(schema.dispatchJobs)
      .where(eq(schema.dispatchJobs.userId, LOCAL_USER_ID))
      .orderBy(desc(schema.dispatchJobs.startedAt))
      .limit(1)
  );

  if (!job) return null;

  const itemRows = await db
    .select()
    .from(schema.dispatchJobItems)
    .where(eq(schema.dispatchJobItems.jobId, job.id))
    .orderBy(asc(schema.dispatchJobItems.seqIndex));

  const items: DispatchJobItemStatus[] = itemRows.map((r) => ({
    id: r.id,
    advisorId: r.advisorId,
    advisorName: r.advisorName,
    institutionName: r.institutionName,
    toEmail: r.toEmail,
    subject: r.subject,
    accountId: r.accountId,
    accountLabel: r.accountLabel,
    status: r.status as DispatchJobItemStatus["status"],
    message: r.message,
    processedAt: r.processedAt,
  }));

  const isThisLive = runtimeTracker.activeJobId === job.id;
  const currentItem =
    (isThisLive && runtimeTracker.currentItemId
      ? items.find((i) => i.id === runtimeTracker.currentItemId)
      : items.find((i) => i.status === "processing")) || null;
  const nextItem =
    (isThisLive && runtimeTracker.nextItemId
      ? items.find((i) => i.id === runtimeTracker.nextItemId)
      : null) || null;

  return {
    id: job.id,
    mode: job.mode as "send" | "draft",
    status: job.status as DispatchJob["status"],
    stopRequested: job.stopRequested,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    scheduledStartAt: job.scheduledStartAt,
    scheduleWaitSeconds: isThisLive ? runtimeTracker.scheduleWaitSeconds : 0,
    waitingSeconds: isThisLive ? runtimeTracker.waitingSeconds : 0,
    total: job.total,
    completed: job.completed,
    succeeded: job.succeeded,
    failed: job.failed,
    currentItem,
    nextItem,
    items,
    logs: job.logs,
  };
}

async function sleepOneSecondTicks(
  seconds: number,
  onTick: (remaining: number) => void
): Promise<boolean> {
  for (let rem = seconds; rem > 0; rem--) {
    if (runtimeTracker.stopRequested) return false;
    onTick(rem);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return !runtimeTracker.stopRequested;
}

export async function startDispatchJob(params: {
  mode: "send" | "draft";
  advisorIds?: string[];
  ignoreQuota?: boolean;
  scheduledStartAt?: string;
}): Promise<DispatchJob> {
  if (runtimeTracker.activeJobId) {
    throw new Error("当前已有批量任务正在运行，请等待完成或先停止队列");
  }

  const plan = await buildDispatchPlan(params);
  const readyItems = plan.items.filter((i) => i.ready);
  if (readyItems.length === 0) {
    throw new Error("没有符合发送条件的就绪邮件（请检查收件邮箱、主题、正文及发件箱配额）");
  }

  let startDt: Date | null = null;
  if (params.scheduledStartAt && params.scheduledStartAt.trim()) {
    const parsed = new Date(params.scheduledStartAt.trim());
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
      startDt = parsed;
    }
  }

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const [draftRows, resumeRows, settings] = await Promise.all([
    db.select().from(schema.outreachDrafts),
    db.select().from(schema.resumes).where(eq(schema.resumes.userId, LOCAL_USER_ID)),
    firstOrNull(
      db
        .select()
        .from(schema.appSettings)
        .where(eq(schema.appSettings.userId, LOCAL_USER_ID))
        .limit(1)
    ),
  ]);
  const draftMap = new Map(draftRows.map((d) => [d.advisorId, d]));
  const resumeMap = new Map(resumeRows.map((r) => [r.id, r]));
  const policy: PolicyConfig = settings?.policyConfig || { ...DEFAULT_POLICY_CONFIG };

  const initLog = startDt
    ? `${localTimeLogPrefix()} 已设定预约发送：将于 ${startDt.toLocaleString("zh-CN")} 自动启动（共 ${readyItems.length} 封）。`
    : `${localTimeLogPrefix()} 启动批量任务：${plan.mode === "draft" ? "写入草稿箱" : "错峰慢速发送"}，共 ${readyItems.length} 封。`;

  await db.insert(schema.dispatchJobs).values({
    id: jobId,
    userId: LOCAL_USER_ID,
    mode: plan.mode,
    status: startDt ? "waiting_schedule" : "running",
    stopRequested: false,
    scheduledStartAt: startDt ? startDt.toISOString() : null,
    startedAt: now,
    finishedAt: null,
    total: readyItems.length,
    completed: 0,
    succeeded: 0,
    failed: 0,
    logs: [initLog],
  });

  const jobItemRows = readyItems.map((it, idx) => {
    const draft = draftMap.get(it.advisorId);
    const res = it.resumeId ? resumeMap.get(it.resumeId) : undefined;
    return {
      id: crypto.randomUUID(),
      jobId,
      advisorId: it.advisorId,
      advisorName: it.advisorName,
      institutionName: it.institutionName,
      toEmail: it.toEmail,
      subject: it.subject,
      bodySnapshot: draft?.body || "",
      resumePathSnapshot: res?.storagePath || "",
      resumeNameSnapshot: res?.filename || it.resumeName || "",
      accountId: it.accountId,
      accountLabel: it.accountLabel,
      seqIndex: idx,
      status: "pending",
      message: startDt ? "等待定时启动" : "排队中",
      processedAt: null,
    };
  });

  await db.insert(schema.dispatchJobItems).values(jobItemRows);

  runtimeTracker.activeJobId = jobId;
  runtimeTracker.stopRequested = false;
  runtimeTracker.scheduleWaitSeconds = startDt
    ? Math.max(0, Math.ceil((startDt.getTime() - Date.now()) / 1000))
    : 0;
  runtimeTracker.waitingSeconds = runtimeTracker.scheduleWaitSeconds;
  runtimeTracker.currentItemId = null;
  runtimeTracker.nextItemId = jobItemRows[0]?.id || null;

  // Run asynchronously in background
  void runDispatchWorkerLoop(jobId, plan.mode, jobItemRows, policy, startDt);

  const created = await getLatestDispatchJob();
  return created!;
}

async function appendJobLog(jobId: string, text: string) {
  const row = await firstOrNull(
    db
      .select({ logs: schema.dispatchJobs.logs })
      .from(schema.dispatchJobs)
      .where(eq(schema.dispatchJobs.id, jobId))
      .limit(1)
  );
  const nextLogs = [...(row?.logs || []), `${localTimeLogPrefix()} ${text}`];
  await db
    .update(schema.dispatchJobs)
    .set({ logs: nextLogs })
    .where(eq(schema.dispatchJobs.id, jobId));
}

async function runDispatchWorkerLoop(
  jobId: string,
  mode: "send" | "draft",
  items: Array<typeof schema.dispatchJobItems.$inferInsert>,
  policy: PolicyConfig,
  startDt: Date | null
) {
  let completed = 0;
  let succeeded = 0;
  let failed = 0;
  const minD = Math.max(5, policy.minDelaySec);
  const maxD = Math.max(minD, policy.maxDelaySec);

  try {
    if (startDt && startDt.getTime() > Date.now()) {
      const waitSec = Math.ceil((startDt.getTime() - Date.now()) / 1000);
      const okToProceed = await sleepOneSecondTicks(waitSec, (rem) => {
        runtimeTracker.scheduleWaitSeconds = rem;
        runtimeTracker.waitingSeconds = rem;
      });
      runtimeTracker.scheduleWaitSeconds = 0;
      runtimeTracker.waitingSeconds = 0;
      if (!okToProceed) {
        await appendJobLog(jobId, "收到停止指令，预约队列在启动前已取消。");
        await db
          .update(schema.dispatchJobs)
          .set({ status: "stopped", finishedAt: new Date().toISOString() })
          .where(eq(schema.dispatchJobs.id, jobId));
        return;
      }
      await db
        .update(schema.dispatchJobs)
        .set({ status: "running" })
        .where(eq(schema.dispatchJobs.id, jobId));
      await appendJobLog(jobId, "已到达预约时间，开始逐封投递...");
    }

    const accountRows = await db
      .select()
      .from(schema.mailAccounts)
      .where(eq(schema.mailAccounts.userId, LOCAL_USER_ID));
    const accMap = new Map(accountRows.map((a) => [a.id, a]));

    for (let i = 0; i < items.length; i++) {
      if (runtimeTracker.stopRequested) {
        await appendJobLog(jobId, "收到终止指令，停止处理剩余邮件。");
        break;
      }

      const item = items[i];
      runtimeTracker.currentItemId = item.id;
      runtimeTracker.nextItemId = items[i + 1]?.id || null;
      runtimeTracker.waitingSeconds = 0;

      await db
        .update(schema.dispatchJobItems)
        .set({ status: "processing", message: mode === "draft" ? "写入草稿箱..." : "正在发送..." })
        .where(eq(schema.dispatchJobItems.id, item.id));

      const accRow = accMap.get(item.accountId);
      let ok = false;
      let errMsg = "";

      try {
        if (!accRow) {
          throw new Error("未找到对应的发件箱配置");
        }
        const transportAcc = toTransportAccount(accRow);
        const hasAtt = Boolean(item.resumePathSnapshot && fs.existsSync(item.resumePathSnapshot));

        if (mode === "draft") {
          const { folder } = await defaultMailTransport.saveDraft(transportAcc, {
            toEmail: item.toEmail,
            subject: item.subject,
            body: item.bodySnapshot,
            attachmentPath: hasAtt ? item.resumePathSnapshot : undefined,
            attachmentName: hasAtt ? item.resumeNameSnapshot || "resume.pdf" : undefined,
          });
          ok = true;
          await db
            .update(schema.advisors)
            .set({
              stage: "ready",
              assignedAccountId: accRow.id,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(schema.advisors.id, item.advisorId));
          await appendJobLog(jobId, `已存入草稿箱：${item.institutionName} ${item.advisorName} (${folder})`);
        } else {
          const sentRes = await defaultMailTransport.sendMessage(transportAcc, {
            toEmail: item.toEmail,
            subject: item.subject,
            body: item.bodySnapshot,
            attachmentPath: hasAtt ? item.resumePathSnapshot : undefined,
            attachmentName: hasAtt ? item.resumeNameSnapshot || "resume.pdf" : undefined,
          });
          ok = true;
          const sentAt = new Date().toISOString();
          await db
            .update(schema.advisors)
            .set({
              stage: "sent",
              assignedAccountId: accRow.id,
              lastSentAt: sentAt,
              updatedAt: sentAt,
            })
            .where(eq(schema.advisors.id, item.advisorId));

          await db.insert(schema.mailMessages).values({
            id: crypto.randomUUID(),
            userId: LOCAL_USER_ID,
            advisorId: item.advisorId,
            mailAccountId: accRow.id,
            direction: "outbound",
            fromName: accRow.displayName || accRow.email,
            fromEmail: accRow.email,
            toEmail: item.toEmail,
            subject: item.subject,
            body: item.bodySnapshot,
            attachments: hasAtt && item.resumeNameSnapshot ? [item.resumeNameSnapshot] : [],
            messageId: sentRes.messageId,
            inReplyTo: "",
            referencesHeader: "",
            isUnread: false,
            replyIntent: null,
            extractedTodos: [],
            sentOrReceivedAt: sentAt,
          });
          await appendJobLog(jobId, `发送成功：${item.institutionName} ${item.advisorName} (${item.toEmail})`);
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : String(err);
        await appendJobLog(jobId, `失败：${item.advisorName} | ${errMsg}`);
      }

      completed += 1;
      if (ok) succeeded += 1;
      else failed += 1;

      await db
        .update(schema.dispatchJobItems)
        .set({
          status: ok ? "ok" : "error",
          message: ok
            ? mode === "draft"
              ? "已写入草稿箱"
              : "已发送"
            : errMsg,
          processedAt: new Date().toISOString(),
        })
        .where(eq(schema.dispatchJobItems.id, item.id));

      await db
        .update(schema.dispatchJobs)
        .set({ completed, succeeded, failed })
        .where(eq(schema.dispatchJobs.id, jobId));

      if (i < items.length - 1) {
        if (!ok) {
          await appendJobLog(jobId, "本封失败，跳过休眠立即处理下一封...");
          continue;
        }
        const delaySec =
          mode === "draft"
            ? 2
            : Math.floor(Math.random() * (maxD - minD + 1)) + minD;
        if (mode === "send") {
          await appendJobLog(
            jobId,
            `防拦截错峰休息 ${delaySec} 秒后发送下一封（${items[i + 1].advisorName}）...`
          );
        }
        runtimeTracker.currentItemId = null;
        const cont = await sleepOneSecondTicks(delaySec, (rem) => {
          runtimeTracker.waitingSeconds = rem;
        });
        runtimeTracker.waitingSeconds = 0;
        if (!cont) {
          await appendJobLog(jobId, "收到终止指令，结束后续等待队列。");
          break;
        }
      }
    }

    const finalStatus = runtimeTracker.stopRequested ? "stopped" : "completed";
    await db
      .update(schema.dispatchJobs)
      .set({
        status: finalStatus,
        finishedAt: new Date().toISOString(),
      })
      .where(eq(schema.dispatchJobs.id, jobId));
    await appendJobLog(jobId, `任务结束：成功 ${succeeded} / 失败 ${failed} / 总计 ${items.length}`);
  } finally {
    runtimeTracker.activeJobId = null;
    runtimeTracker.stopRequested = false;
    runtimeTracker.scheduleWaitSeconds = 0;
    runtimeTracker.waitingSeconds = 0;
    runtimeTracker.currentItemId = null;
    runtimeTracker.nextItemId = null;
  }
}

export { toTransportAccount };
