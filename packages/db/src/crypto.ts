import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * 敏感凭证加密工具：使用 AES-256-GCM 对邮箱授权码与 AI API Key 进行落盘加密，
 * 本地开发未配置 APP_ENCRYPTION_KEY 时自动持久化独立随机密钥到 storage/.dev-master.key。
 */
let cachedKey: Buffer | null = null;

function resolveWorkspaceStorageDir(): string {
  if (process.env.STORAGE_DIR) {
    return path.resolve(process.env.STORAGE_DIR);
  }
  let dir = path.dirname(new URL(import.meta.url).pathname);
  if (process.platform === "win32" && dir.startsWith("/")) {
    dir = dir.slice(1);
  }
  let cur = dir;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(cur, "pnpm-workspace.yaml"))) {
      return path.join(cur, "storage");
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(process.cwd(), "storage");
}

function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const envSecret = (process.env.APP_ENCRYPTION_KEY || "").trim();
  if (envSecret.length >= 16) {
    cachedKey = crypto.createHash("sha256").update(envSecret, "utf8").digest();
    return cachedKey;
  }

  const storageDir = resolveWorkspaceStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  const keyFile = path.join(storageDir, ".dev-master.key");
  if (fs.existsSync(keyFile)) {
    const raw = fs.readFileSync(keyFile, "utf8").trim();
    if (raw.length === 64) {
      cachedKey = Buffer.from(raw, "hex");
      return cachedKey;
    }
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, generated.toString("hex"), { encoding: "utf8", mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

const PREFIX = "enc:v1:";

export function encryptSecret(plaintext: string): string {
  const clean = plaintext || "";
  if (!clean) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const rest = stored.slice(PREFIX.length);
  const parts = rest.split(":");
  if (parts.length !== 3) return "";
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    return "";
  }
}
