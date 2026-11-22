export type MatchTier = "perfect" | "high" | "try" | "unknown";
export type AdvisorStage =
  | "drafting"
  | "ready"
  | "sent"
  | "replied"
  | "interviewing"
  | "paused";

export type ReplyIntent =
  | "positive_interview"
  | "welcome_apply"
  | "need_materials"
  | "no_quota"
  | "other";

export const MATCH_TIER_OPTIONS: ReadonlyArray<{
  value: MatchTier;
  label: string;
  short: string;
}> = [
  { value: "perfect", label: "极高匹配 · 首选导师", short: "极高匹配" },
  { value: "high", label: "高度匹配 · 重点联系", short: "高度匹配" },
  { value: "try", label: "可以尝试 · 拓展备选", short: "可以尝试" },
  { value: "unknown", label: "待进一步了解", short: "待了解" },
];

export const ADVISOR_STAGE_OPTIONS: ReadonlyArray<{
  value: AdvisorStage;
  label: string;
}> = [
  { value: "drafting", label: "待撰写" },
  { value: "ready", label: "待发送" },
  { value: "sent", label: "已发送" },
  { value: "replied", label: "已回信" },
  { value: "interviewing", label: "面试推进" },
  { value: "paused", label: "暂缓" },
];

export const REPLY_INTENT_LABELS: Record<ReplyIntent, string> = {
  positive_interview: "积极约面",
  welcome_apply: "欢迎报考",
  need_materials: "需补交材料",
  no_quota: "暂无名额",
  other: "常规回复",
};

export interface MailboxPreset {
  key: string;
  label: string;
  domains: string[];
  mxKeywords: string[];
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "SSL" | "STARTTLS" | "NONE";
  imapHost: string;
  imapPort: number;
  draftsFolder: string;
  authGuideUrl: string;
  guideSteps: string[];
  note: string;
}

export const MAILBOX_PRESETS: MailboxPreset[] = [
  {
    key: "qq",
    label: "QQ 邮箱",
    domains: ["qq.com", "foxmail.com"],
    mxKeywords: ["qq.com"],
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.qq.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://mail.qq.com/",
    guideSteps: [
      "在弹出的 QQ 邮箱网页登录后，点顶部【设置 → 账号】",
      "向下找到「POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务」，开启「IMAP/SMTP服务」",
      "按提示完成扫码或短信验证后，复制生成的 16 位授权码粘贴到下方",
    ],
    note: "QQ 邮箱需使用 16 位客户端授权码（非 QQ 登录密码）",
  },
  {
    key: "163",
    label: "163 网易邮箱",
    domains: ["163.com"],
    mxKeywords: ["163.com", "netease.com"],
    smtpHost: "smtp.163.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.163.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://mail.163.com/",
    guideSteps: [
      "登录 163 邮箱后，点击上方【设置 → POP3/SMTP/IMAP】",
      "开启「IMAP/SMTP服务」和「POP3/SMTP服务」",
      "点击「新增授权密码」，复制生成的授权码并粘贴到下方",
    ],
    note: "163 邮箱必须填客户端授权密码，不能填网页登录密码",
  },
  {
    key: "126",
    label: "126 邮箱",
    domains: ["126.com"],
    mxKeywords: ["126.com"],
    smtpHost: "smtp.126.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.126.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://mail.126.com/",
    guideSteps: [
      "登录 126 邮箱后，点击上方【设置 → POP3/SMTP/IMAP】",
      "开启「IMAP/SMTP服务」",
      "新增客户端授权密码并粘贴到下方即可完成绑定",
    ],
    note: "126 邮箱需填写客户端授权码",
  },
  {
    key: "yeah",
    label: "Yeah.net 邮箱",
    domains: ["yeah.net"],
    mxKeywords: ["yeah.net"],
    smtpHost: "smtp.yeah.net",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.yeah.net",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://mail.yeah.net/",
    guideSteps: [
      "登录 Yeah 邮箱进入【设置 → POP3/SMTP/IMAP】",
      "开启「IMAP/SMTP服务」",
      "新增授权码并粘贴到下方输入框",
    ],
    note: "网易 Yeah 邮箱需使用客户端授权码",
  },
  {
    key: "qq_exmail",
    label: "腾讯企业邮",
    domains: [],
    mxKeywords: ["exmail.qq.com"],
    smtpHost: "smtp.exmail.qq.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.exmail.qq.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://exmail.qq.com/",
    guideSteps: [
      "登录学校/单位腾讯企业邮网页版，点右上角【设置 → 账户】或【微信绑定/安全设置】",
      "开启「安全登录」时需在【客户端专用密码】生成新密码",
      "将生成的客户端专用密码粘贴到下方完成测试",
    ],
    note: "已通过 MX 自动识别底层为腾讯企业邮箱",
  },
  {
    key: "163_qiye",
    label: "网易企业邮",
    domains: [],
    mxKeywords: ["qiye.163.com", "ym.163.com"],
    smtpHost: "smtp.qiye.163.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.qiye.163.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://qiye.163.com/",
    guideSteps: [
      "登录网易企业邮网页版，打开【设置 → 客户端设置 / 安全设置】",
      "确认开启 IMAP/SMTP 并生成「客户端授权码」",
      "粘贴授权码到下方进行连通测试",
    ],
    note: "已通过 MX 自动识别底层为网易企业邮箱",
  },
  {
    key: "aliyun_qiye",
    label: "阿里企业邮",
    domains: ["aliyun.com"],
    mxKeywords: ["mxhichina.com", "alibaba-inc"],
    smtpHost: "smtp.qiye.aliyun.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.qiye.aliyun.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://qiye.aliyun.com/",
    guideSteps: [
      "登录阿里企业邮箱，进入【设置 → 账户与安全】",
      "生成第三方客户端安全密码",
      "将安全密码粘贴到下方完成连通测试",
    ],
    note: "已通过 MX 自动识别底层为阿里企业邮箱",
  },
  {
    key: "outlook",
    label: "Outlook / 微软高校邮箱",
    domains: ["outlook.com", "hotmail.com", "live.com"],
    mxKeywords: ["outlook.com", "protection.outlook.com"],
    smtpHost: "smtp-mail.outlook.com",
    smtpPort: 587,
    smtpSecurity: "STARTTLS",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "https://account.live.com/proofs/manage/additional",
    guideSteps: [
      "登录微软账户安全设置页，建议先开启两步验证",
      "在「应用密码」中创建一个新应用密码（部分组织邮箱可直接用原密码或后续接入 OAuth2）",
      "粘贴密码到下方；若遇组织策略拦截，可改用高校国内镜像或 163/QQ 邮箱",
    ],
    note: "微软个人 Outlook 逐步收紧传统密码认证，Phase 3 将接入官方 Graph OAuth2",
  },
  {
    key: "gmail",
    label: "Gmail / Google Workspace",
    domains: ["gmail.com", "googlemail.com"],
    mxKeywords: ["google.com", "googlemail.com"],
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    draftsFolder: "[Gmail]/Drafts",
    authGuideUrl: "https://myaccount.google.com/apppasswords",
    guideSteps: [
      "确保 Google 账号已开启「两步验证 (2-Step Verification)」",
      "在弹出的 Google「应用专用密码 (App Passwords)」页面创建一个应用密码",
      "将 16 位应用专用密码（自动去空格）粘贴到下方并测试",
    ],
    note: "Gmail 一期通过 16 位应用专用密码接入，支持自动去空格",
  },
  {
    key: "edu",
    label: "高校 .edu.cn 邮箱",
    domains: [],
    mxKeywords: ["coremail", "edu.cn"],
    smtpHost: "",
    smtpPort: 465,
    smtpSecurity: "SSL",
    imapHost: "",
    imapPort: 993,
    draftsFolder: "Drafts",
    authGuideUrl: "",
    guideSteps: [
      "输入你的校内邮箱地址后，系统会自动探测 MX 托管商并猜测常见 Coremail 地址",
      "若未自动填充，展开下方「高级网络参数」填入学校信息中心公布的 SMTP/IMAP 主机",
      "若学校邮箱开启了二次验证，请在网页端【设置 → 客户端授权码】生成专用密码后填入",
    ],
    note: "高校 .edu.cn 域名在各校网关互信度最高，推荐作为主力发件箱",
  },
];

export const DEFAULT_POLICY_CONFIG = {
  minDelaySec: 180,
  maxDelaySec: 420,
  avoidConsecutiveSameDomain: true,
  maxAttachmentMb: 2.5,
} as const;
