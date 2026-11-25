import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Viewer } from "../access/policy";
import { getDb } from "../db/client";
import { apiKeys, communityMembers, sessions, users } from "../db/schema";

export const SESSION_COOKIE = "em_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = await getDb();
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

async function loadViewer(userId: string, apiKeyScopes?: string[]): Promise<Viewer | null> {
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isDemo: users.isDemo })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;
  const memberships = await db
    .select({ id: communityMembers.communityId, role: communityMembers.role })
    .from(communityMembers)
    .where(eq(communityMembers.userId, userId));
  return {
    ...user,
    communities: memberships.map((m) => ({ id: m.id, role: m.role === "steward" ? "steward" : "member" })),
    apiKeyScopes,
  };
}

/**
 * The person (or agent) behind the current request. API keys are accepted from the
 * Authorization header ("Bearer em_…"); otherwise the session cookie is used.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const authorization = (await headers()).get("authorization");
  if (authorization?.startsWith("Bearer em_")) {
    return viewerFromApiKey(authorization.slice("Bearer ".length).trim());
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return session ? loadViewer(session.userId) : null;
});

export async function viewerFromApiKey(key: string): Promise<Viewer | null> {
  if (!/^em_[A-Za-z0-9_-]{20,}$/.test(key)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, scopes: apiKeys.scopes })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashToken(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return loadViewer(row.userId, row.scopes.length ? row.scopes : ["read"]);
}

/** Generates a new API key. Only its hash is stored; the plain key is returned once. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `em_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashToken(key) };
}
