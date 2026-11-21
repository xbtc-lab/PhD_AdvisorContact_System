export interface SenderProfile {
  name: string;
  affiliation: string;
  degree_info: string;
  research_summary: string;
  phone: string;
  wechat: string;
  github: string;
}

export interface AiConfig {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  has_api_key?: boolean;
  api_key_len?: number;
  api_key_dirty?: boolean;
  clear_api_key?: boolean;
}

export interface PolicyConfig {
  min_delay_sec: number;
  max_delay_sec: number;
  avoid_consecutive_same_domain: boolean;
  max_attachment_mb: number;
}

export interface AccountLastTest {
  smtp_ok: boolean;
  smtp_msg: string;
  imap_ok: boolean;
  imap_msg: string;
  tested_at?: string;
}

export interface AccountConfig {
  id: string;
  orig_id?: string;
  label: string;
  email: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: "SSL" | "STARTTLS" | "NONE";
  imap_host: string;
  imap_port: number;
  drafts_folder: string;
  password: string;
  has_password?: boolean;
  password_len?: number;
  password_dirty?: boolean;
  daily_limit: number;
  enabled: boolean;
  note: string;
  last_test?: AccountLastTest | null;
}

export interface WorkbenchConfig {
  excel_path: string;
  default_resume_path: string;
  outbox_dir: string;
  sender_profile: SenderProfile;
  ai_config: AiConfig;
  policy: PolicyConfig;
  accounts: AccountConfig[];
  quota_reset_after?: string;
}

export interface Professor {
  id: string;
  sheet: string;
  row: number;
  seq: number | string;
  priority: string;
  name: string;
  homepage: string;
  dept: string;
  title: string;
  tags: string;
  research: string;
  email: string;
  note: string;
  in_batch: string;
  assigned_sender: string;
  status: string;
  hook: string;
  subject: string;
  body_path: string;
  body_exists: boolean;
  resume_path: string;
  effective_resume_path: string;
  resume_name: string;
  resume_exists: boolean;
  resume_size_mb: number;
  is_custom_resume: boolean;
  sent_time: string;
  reply_note: string;
}

export interface MailThreadMessage {
  id: string;
  direction: "outbound" | "inbound";
  unread?: boolean;
  professor_id: string;
  school?: string;
  professor_name?: string;
  account_id?: string;
  from_name?: string;
  from_email: string;
  to_email: string;
  subject: string;
  body: string;
  attachments?: string[];
  message_id?: string;
  in_reply_to?: string;
  timestamp: string;
}

export interface UnreadReplyItem {
  msg_id: string;
  professor_id: string;
  professor_name: string;
  school: string;
  from_email: string;
  subject: string;
  snippet: string;
  timestamp: string;
}

export interface HistoryItem {
  timestamp: string;
  date: string;
  mode: "draft" | "send";
  ok: boolean;
  error?: string;
  id: string;
  school: string;
  name: string;
  to_email: string;
  account_id: string;
  from_email: string;
  subject: string;
  resume_name: string;
}

export interface LastSendBatch {
  has_history: boolean;
  last_sent_at?: string;
  last_batch_start?: string;
  last_batch_end?: string;
  last_batch_count?: number;
  elapsed_seconds?: number;
  elapsed_text?: string;
}

export interface PlanAccountSummary {
  id: string;
  label: string;
  email: string;
  enabled: boolean;
  configured: boolean;
  daily_limit: number;
  used_today: number;
  planned: number;
  remaining_after: number;
}

export interface PlanItem {
  id: string;
  sheet: string;
  row: number;
  name: string;
  dept: string;
  priority: string;
  to_email: string;
  domain: string;
  subject: string;
  resume_name: string;
  resume_path: string;
  resume_size_mb: number;
  account_id: string;
  from_email: string;
  ready: boolean;
  issues: string[];
  warnings: string[];
  exec_status?: "pending" | "processing" | "ok" | "error";
  exec_msg?: string;
}

export interface DispatchPlan {
  mode: "draft" | "send";
  total: number;
  ready_count: number;
  blocked_count: number;
  items: PlanItem[];
  accounts: PlanAccountSummary[];
  ignore_quota: boolean;
  target_date: string;
  is_future_date: boolean;
  last_send_batch: LastSendBatch;
}

export interface JobState {
  running: boolean;
  stop_requested: boolean;
  mode: string;
  started_at: string;
  finished_at: string;
  scheduled_start_at?: string;
  schedule_wait_seconds?: number;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  current_item: PlanItem | null;
  waiting_seconds: number;
  next_item: PlanItem | null;
  items: PlanItem[];
  logs: string[];
}

export interface BootstrapPayload {
  ok: boolean;
  config: WorkbenchConfig;
  professors: Professor[];
  sheets: string[];
  excel_path: string;
  excel_filename: string;
  quota_today: Record<string, number>;
  last_send_batch: LastSendBatch;
  history: HistoryItem[];
  job: JobState;
  unread_replies?: UnreadReplyItem[];
  reply_counts?: Record<string, number>;
  last_sync_at?: string;
}

export interface FilterState {
  school: string;
  matchTier: string;
  status: string;
  query: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggested_subject?: string;
  suggested_body?: string;
  suggested_hook?: string;
  model?: string;
}

export interface ExtractedProfessor {
  selected: boolean;
  name: string;
  dept: string;
  title: string;
  tags: string;
  research: string;
  email: string;
  homepage: string;
  priority: string;
  note: string;
}
