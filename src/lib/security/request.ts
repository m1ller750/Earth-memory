import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LIMITS, rateLimit } from "./rate-limit";

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
}

/**
 * Rejects cross-site browser requests to cookie-authenticated endpoints. Requests that
 * carry an API key (non-browser agents) are exempt because they do not rely on cookies.
 */
export function isSameOrigin(request: Request): boolean {
  if (request.headers.get("authorization")?.startsWith("Bearer em_")) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function validationError(error: ZodError) {
  return apiError(400, "validation_error", "The request is invalid.", {
    issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

/** Applies the named rate limit for the caller and returns a 429 response when exceeded. */
export async function limitOrReject(bucket: keyof typeof LIMITS, identity?: string) {
  const key = `${bucket}:${identity ?? (await clientIp())}`;
  const { limit, windowMs } = LIMITS[bucket];
  const result = rateLimit(key, limit, windowMs);
  if (result.ok) return null;
  const response = apiError(429, "rate_limited", "Too many requests. Please slow down.");
  response.headers.set("Retry-After", String(result.retryAfterSeconds));
  return response;
}
