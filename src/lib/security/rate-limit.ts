/**
 * In-memory sliding-window rate limiter. Suitable for a single server process;
 * a multi-instance deployment should back this with Redis (see docs/DEPLOYMENT.md).
 */
interface Bucket {
  hits: number[];
}

const globalForLimiter = globalThis as unknown as { __emRateLimit?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = (globalForLimiter.__emRateLimit ??= new Map<string, Bucket>());

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((windowMs - (now - bucket.hits[0])) / 1000) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) prune(now, windowMs);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 };
}

function prune(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}

export const LIMITS = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  write: { limit: 30, windowMs: 10 * 60_000 },
  upload: { limit: 40, windowMs: 60 * 60_000 },
  ai: { limit: 20, windowMs: 10 * 60_000 },
  api: { limit: 240, windowMs: 60_000 },
} as const;

export function resetRateLimits() {
  buckets.clear();
}
