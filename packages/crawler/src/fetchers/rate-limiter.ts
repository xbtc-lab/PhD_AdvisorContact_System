interface DomainBucketState {
  chain: Promise<void>;
  lastRequestAt: number;
  consecutiveFailures: number;
  circuitOpenUntil: number;
}

export interface RateLimiterOptions {
  minIntervalMs?: number;
  jitterMs?: number;
  circuitBreakerThreshold?: number;
  circuitCooldownMs?: number;
}

/**
 * 单域名串行令牌桶 + 域级熔断器：
 * 确保每个高校域名同一时刻并发 = 1、间隔 1–1.35s，连续失败 N 次自动冷静期保护。
 */
export class DomainRateLimiter {
  private readonly domains = new Map<string, DomainBucketState>();
  private minIntervalMs: number;
  private jitterMs: number;
  private circuitBreakerThreshold: number;
  private circuitCooldownMs: number;

  constructor(opts: RateLimiterOptions = {}) {
    this.minIntervalMs = opts.minIntervalMs ?? 900;
    this.jitterMs = opts.jitterMs ?? 300;
    this.circuitBreakerThreshold = opts.circuitBreakerThreshold ?? 5;
    this.circuitCooldownMs = opts.circuitCooldownMs ?? 30 * 60 * 1000;
  }

  configure(opts: RateLimiterOptions): void {
    if (typeof opts.minIntervalMs === "number" && opts.minIntervalMs >= 100) {
      this.minIntervalMs = opts.minIntervalMs;
    }
    if (typeof opts.jitterMs === "number" && opts.jitterMs >= 0) {
      this.jitterMs = opts.jitterMs;
    }
    if (typeof opts.circuitBreakerThreshold === "number" && opts.circuitBreakerThreshold >= 1) {
      this.circuitBreakerThreshold = opts.circuitBreakerThreshold;
    }
    if (typeof opts.circuitCooldownMs === "number" && opts.circuitCooldownMs >= 10_000) {
      this.circuitCooldownMs = opts.circuitCooldownMs;
    }
  }

  private getState(host: string): DomainBucketState {
    const key = host.toLowerCase();
    let state = this.domains.get(key);
    if (!state) {
      state = {
        chain: Promise.resolve(),
        lastRequestAt: 0,
        consecutiveFailures: 0,
        circuitOpenUntil: 0,
      };
      this.domains.set(key, state);
    }
    return state;
  }

  async schedule<T>(host: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(host);
    const now = Date.now();
    if (state.circuitOpenUntil > now) {
      const remainMin = Math.ceil((state.circuitOpenUntil - now) / 60_000);
      throw new Error(`域名 ${host} 已触发连续失败熔断保护（剩余约 ${remainMin} 分钟冷却）`);
    }

    let release!: () => void;
    const prev = state.chain;
    state.chain = new Promise<void>((resolve) => {
      release = resolve;
    });

    await prev;
    try {
      const elapsed = Date.now() - state.lastRequestAt;
      const targetWait =
        this.minIntervalMs + Math.floor(Math.random() * (this.jitterMs + 1));
      if (state.lastRequestAt > 0 && elapsed < targetWait) {
        await new Promise((r) => setTimeout(r, targetWait - elapsed));
      }
      state.lastRequestAt = Date.now();
      return await fn();
    } finally {
      release();
    }
  }

  recordSuccess(host: string): void {
    const state = this.getState(host);
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = 0;
  }

  recordFailure(host: string): void {
    const state = this.getState(host);
    state.consecutiveFailures += 1;
    if (state.consecutiveFailures >= this.circuitBreakerThreshold) {
      state.circuitOpenUntil = Date.now() + this.circuitCooldownMs;
    }
  }
}

export const defaultRateLimiter = new DomainRateLimiter();
