"use server";

import { and, eq, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { can } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { languages, lexiconEntries, media } from "@/lib/db/schema";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { lexiconInputSchema } from "@/lib/validation/schemas";
import type { ActionState } from "./records";

/** Adds a community vocabulary entry (unverified until reviewed), optionally with recorded pronunciation. */
export async function addLexiconEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "lexicon:create")) return { error: "auth" };
  const raw = Object.fromEntries(formData);
  const parsed = lexiconInputSchema.safeParse({
    ...raw,
    transcription: raw.transcription || undefined,
    glossRu: raw.glossRu || undefined,
    partOfSpeech: raw.partOfSpeech || undefined,
  });
  if (!parsed.success) return { error: "validation", message: parsed.error.issues[0]?.message };
  if (!rateLimit(`write:${viewer.id}`, LIMITS.write.limit, LIMITS.write.windowMs).ok) return { error: "rate_limited" };

  const db = await getDb();
  const [language] = await db.select({ id: languages.id }).from(languages).where(eq(languages.id, parsed.data.languageId)).limit(1);
  if (!language) return { error: "not_found" };

  const [entry] = await db
    .insert(lexiconEntries)
    .values({
      languageId: language.id,
      headword: parsed.data.headword,
      transcription: parsed.data.transcription ?? null,
      glossEn: parsed.data.glossEn,
      glossRu: parsed.data.glossRu ?? null,
      partOfSpeech: parsed.data.partOfSpeech ?? null,
      sourceCitation: parsed.data.sourceCitation,
      contributorId: viewer.id,
      origin: "community",
    })
    .returning({ id: lexiconEntries.id });

  if (parsed.data.mediaId) {
    // Only the uploader's own, still unattached audio can be linked.
    await db
      .update(media)
      .set({ lexiconEntryId: entry.id })
      .where(and(eq(media.id, parsed.data.mediaId), eq(media.uploadedBy, viewer.id), eq(media.kind, "audio"), isNull(media.recordId), isNull(media.lexiconEntryId)));
  }
  await audit(db, viewer, { action: "lexicon.create", subjectType: "lexicon", subjectId: entry.id, details: { languageId: language.id, withAudio: Boolean(parsed.data.mediaId) } });
  refresh();
  return { ok: true };
}
