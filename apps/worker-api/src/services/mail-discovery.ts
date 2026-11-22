import dns from "node:dns/promises";
import {
  MAILBOX_PRESETS,
  type DiscoverMailAccountResult,
  type MailboxPreset,
} from "@app/shared";

function buildResult(
  preset: MailboxPreset,
  mxHosts: string[],
  detectedVia: DiscoverMailAccountResult["detectedVia"],
  overrides?: Partial<DiscoverMailAccountResult>
): DiscoverMailAccountResult {
  return {
    presetKey: preset.key,
    providerLabel: preset.label,
    mxHosts,
    smtpHost: overrides?.smtpHost ?? preset.smtpHost,
    smtpPort: overrides?.smtpPort ?? preset.smtpPort,
    smtpSecurity: overrides?.smtpSecurity ?? preset.smtpSecurity,
    imapHost: overrides?.imapHost ?? preset.imapHost,
    imapPort: overrides?.imapPort ?? preset.imapPort,
    draftsFolder: overrides?.draftsFolder ?? preset.draftsFolder,
    authGuideUrl: overrides?.authGuideUrl ?? preset.authGuideUrl,
    guideSteps: overrides?.guideSteps ?? preset.guideSteps,
    note: overrides?.note ?? preset.note,
    detectedVia,
  };
}

export async function discoverMailboxConfig(
  emailAddr: string
): Promise<DiscoverMailAccountResult> {
  const clean = emailAddr.trim().toLowerCase();
  const atIdx = clean.indexOf("@");
  const domain = atIdx !== -1 ? clean.slice(atIdx + 1).trim() : "";

  const eduPreset = MAILBOX_PRESETS.find((p) => p.key === "edu")!;
  if (!domain) {
    return buildResult(eduPreset, [], "fallback");
  }

  // 1. Direct domain match
  const direct = MAILBOX_PRESETS.find((p) => p.domains.includes(domain));
  if (direct) {
    return buildResult(direct, [], "domain");
  }

  // 2. DNS MX record lookup
  let mxHosts: string[] = [];
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("DNS timeout")), 2500)),
    ]);
    mxHosts = records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.toLowerCase().replace(/\.$/, ""));
  } catch {
    mxHosts = [];
  }

  const mxJoined = mxHosts.join(" ");
  for (const preset of MAILBOX_PRESETS) {
    if (preset.key === "edu") continue;
    if (preset.mxKeywords.some((kw) => mxJoined.includes(kw))) {
      return buildResult(preset, mxHosts, "mx");
    }
  }

  // 3. Chinese university .edu.cn heuristic (e.g., stu.xmu.edu.cn -> mail.xmu.edu.cn / smtp.xmu.edu.cn)
  if (domain.endsWith(".edu.cn")) {
    const parts = domain.split(".");
    // Root university domain e.g. xmu.edu.cn (last 3 segments)
    const rootUnivDomain = parts.length >= 3 ? parts.slice(-3).join(".") : domain;
    const guessedHost = `mail.${rootUnivDomain}`;
    return buildResult(eduPreset, mxHosts, "edu_heuristic", {
      providerLabel: `高校邮箱 (${rootUnivDomain})`,
      smtpHost: guessedHost,
      imapHost: guessedHost,
      authGuideUrl: `https://${guessedHost}/`,
      note: `已自动推测常见高校邮箱地址 ${guessedHost}；如提示连接失败，请展开「高级网络参数」按校信息中心公告调整。`,
    });
  }

  // 4. Generic fallback
  return buildResult(eduPreset, mxHosts, "fallback", {
    providerLabel: `自定义邮箱 (${domain})`,
    smtpHost: `smtp.${domain}`,
    imapHost: `imap.${domain}`,
  });
}
