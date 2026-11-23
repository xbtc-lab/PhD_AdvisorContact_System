import fs from "node:fs/promises";
import path from "node:path";
import { getStorageRoot } from "@app/db";

export interface StoragePutResult {
  key: string;
  publicUrl: string;
}

/**
 * 统一存储抽象接口：
 * Phase 1 头像直链官网、附件/PDF 落盘本地 storage/；
 * 预留 S3/OSS/COS/R2 扩展位，仅需实现本接口即可切换。
 */
export interface StorageAdapter {
  readonly mode: "local_disk" | "s3_compatible";
  putObject(key: string, body: Buffer, contentType: string): Promise<StoragePutResult>;
  getPublicUrl(key: string): string;
  deleteObject(key: string): Promise<void>;
}

export class LocalDiskStorage implements StorageAdapter {
  readonly mode = "local_disk" as const;
  private readonly rootDir: string;

  constructor(rootDir = getStorageRoot()) {
    this.rootDir = rootDir;
  }

  private resolveSafePath(key: string): string {
    const cleanKey = key.replace(/^[/\\]+/, "").replace(/\.\./g, "_");
    return path.join(this.rootDir, cleanKey);
  }

  async putObject(key: string, body: Buffer): Promise<StoragePutResult> {
    const abs = this.resolveSafePath(key);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, body);
    return { key, publicUrl: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `/storage/${key.replace(/^[/\\]+/, "")}`;
  }

  async deleteObject(key: string): Promise<void> {
    const abs = this.resolveSafePath(key);
    await fs.unlink(abs).catch(() => {});
  }
}

export function createStorageAdapter(): StorageAdapter {
  // Phase 1 默认本地磁盘存储；若后续需切 S3/OSS/R2，可依据 S3_ENDPOINT/S3_BUCKET 扩展适配器
  return new LocalDiskStorage();
}
