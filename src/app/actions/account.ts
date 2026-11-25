"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { generateApiKey, getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { apiKeySchema } from "@/lib/validation/schemas";

export type ApiKeyState = { ok?: boolean; key?: string; error?: string } | null;

export async function createApiKeyAction(_prev: ApiKeyState, formData: FormData): Promise<ApiKeyState> {
  const viewer = await getViewer();
  if (!viewer || viewer.apiKeyScopes || !can(viewer, "apikey:create")) return { error: "auth" };
  const parsed = apiKeySchema.safeParse({ name: formData.get("name"), scopes: formData.getAll("scopes") });
  if (!parsed.success) return { error: "validation" };
  // The verify scope is only meaningful (and only granted) for reviewers.
  const scopes = parsed.data.scopes.filter((s) => s !== "verify" || can(viewer, "review:expert") || can(viewer, "review:community"));
  const db = await getDb();
  const active = await db.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, viewer.id), isNull(apiKeys.revokedAt)));
  if (active.length >= 10) return { error: "too_many" };
  const { key, prefix, hash } = generateApiKey();
  const [row] = await db.insert(apiKeys).values({ userId: viewer.id, name: parsed.data.name, prefix, keyHash: hash, scopes }).returning({ id: apiKeys.id });
  await audit(db, viewer, { action: "apikey.create", subjectType: "api_key", subjectId: row.id, details: { scopes } });
  refresh();
  return { ok: true, key };
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer || viewer.apiKeyScopes) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const db = await getDb();
  await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, id.data), eq(apiKeys.userId, viewer.id)));
  await audit(db, viewer, { action: "apikey.revoke", subjectType: "api_key", subjectId: id.data });
  refresh();
}
