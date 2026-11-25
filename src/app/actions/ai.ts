"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { can, canViewRecord, isAiSafe } from "@/lib/access/policy";
import { TRANSLATION_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { AiUnavailableError, completeText } from "@/lib/ai/provider";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { aiAnnotations, records } from "@/lib/db/schema";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { TRANSLATION_TARGETS, type TranslationTarget } from "@/lib/ai/targets";
import type { ActionState } from "./records";

const schema = z.object({ recordId: z.uuid(), target: z.enum(Object.keys(TRANSLATION_TARGETS) as [TranslationTarget, ...TranslationTarget[]]) });

/** Creates an AI translation stored as an unverified annotation, never over the original text. */
export async function translateRecordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "ai:annotate")) return { error: "auth" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation" };
  if (!rateLimit(`ai:${viewer.id}`, LIMITS.ai.limit, LIMITS.ai.windowMs).ok) return { error: "rate_limited" };

  const db = await getDb();
  const [record] = await db.select().from(records).where(eq(records.id, parsed.data.recordId)).limit(1);
  if (!record || !canViewRecord(viewer, record)) return { error: "not_found" };
  if (!isAiSafe(record)) return { error: "forbidden" };

  try {
    const { text, model, provider } = await completeText({
      system: TRANSLATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Target language: ${TRANSLATION_TARGETS[parsed.data.target]}\n\n<<<\n${record.title}\n\n${record.summary}\n\n${record.body}\n>>>` }],
      maxTokens: 4000,
      effort: "low",
    });
    const [title, ...rest] = text.split(/\n\s*\n/);
    await db.insert(aiAnnotations).values({
      subjectType: "record",
      subjectId: record.id,
      kind: "translation",
      targetLanguage: parsed.data.target,
      content: { title: title.trim(), text: rest.join("\n\n").trim() },
      model: `${provider}:${model}`,
      createdBy: viewer.id,
    });
    await audit(db, viewer, { action: "ai.translate", subjectType: "record", subjectId: record.id, details: { target: parsed.data.target, model } });
    refresh();
    return { ok: true };
  } catch (error) {
    if (error instanceof AiUnavailableError) return { error: "unavailable" };
    console.error(JSON.stringify({ level: "error", event: "ai.translate.failed", message: error instanceof Error ? error.message : String(error) }));
    return { error: "provider" };
  }
}
