import { createHash } from "node:crypto";
/**
 * Rate-limiting foundation: token-bucket abstraction with an in-memory
 * implementation. The interface is backend-agnostic so a distributed store
 * (Redis) can replace memory without touching routes.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiter {
  take(key: string): RateLimitResult;
  reset(key: string): void;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

export function createMemoryLimiter(options: { capacity: number; refillPerSecond: number }): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return {
    take(key: string): RateLimitResult {
      const now = Date.now();
      // Bound memory on long-lived instances: drop buckets idle > 10 minutes.
      if (buckets.size > 10_000) {
        for (const [k, b] of buckets) if (now - b.updatedAt > 600_000) buckets.delete(k);
      }
      const bucket = buckets.get(key) ?? { tokens: options.capacity, updatedAt: now };
      const elapsed = Math.max(0, (now - bucket.updatedAt) / 1000);
      bucket.tokens = Math.min(options.capacity, bucket.tokens + elapsed * options.refillPerSecond);
      bucket.updatedAt = now;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
      }
      const retryAfterSec = Math.max(1, Math.ceil((1 - bucket.tokens) / options.refillPerSecond));
      buckets.set(key, bucket);
      return { allowed: false, remaining: 0, retryAfterSec };
    },
    reset(key: string): void {
      buckets.delete(key);
    },
  };
}

/** Per-class presets. Auth is strictest; reads are generous. */
export const LIMITS = {
  auth: { capacity: 10, refillPerSecond: 10 / 60 },
  write: { capacity: 60, refillPerSecond: 1 },
  read: { capacity: 300, refillPerSecond: 5 },
  upload: { capacity: 20, refillPerSecond: 20 / 60 },
  expensive: { capacity: 10, refillPerSecond: 10 / 60 },
} as const;

export type LimitClass = keyof typeof LIMITS;

const limiters = new Map<LimitClass, RateLimiter>();

export function limiterFor(limitClass: LimitClass): RateLimiter {
  let limiter = limiters.get(limitClass);
  if (!limiter) {
    limiter = createMemoryLimiter(LIMITS[limitClass]);
    limiters.set(limitClass, limiter);
  }
  return limiter;
}

/** For tests: fresh isolated limiter. */
export function createTestLimiter(capacity: number, refillPerSecond: number): RateLimiter {
  return createMemoryLimiter({ capacity, refillPerSecond });
}

export function clientKey(request: Request): string {
  // Prefer the platform-set client address (can't be spoofed by the caller).
  const h = request.headers;
  const forwarded = h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") ?? h.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0].trim() || "unknown";
  return `ip:${ip}`;
}

/**
 * Key for everyday read/write limits: the signed-in session when there is one
 * (so many users sharing one IP — mobile carriers, offices — don't throttle
 * each other), otherwise the client IP. Sign-in and sign-up keep using the IP.
 */
export function callerKey(request: Request): string {
  const cookie = request.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)tr_session=([^;]+)/.exec(cookie);
  if (m && m[1].length >= 16) return `sess:${createHash("sha256").update(m[1]).digest("hex").slice(0, 24)}`;
  return clientKey(request);
}
