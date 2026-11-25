import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { can, type Viewer, visibleRecordsWhere } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { communities, communityMembers, media, records, sources } from "@/lib/db/schema";
import { cosine, fingerprint, recordFingerprintText } from "@/lib/engine/similarity";
import { countryName } from "@/lib/geo/countries";
import { buildSearchText, slugify } from "@/lib/text";
import type { RecordInput } from "@/lib/validation/schemas";

export class ContributionError extends Error {
  constructor(
    readonly code: "forbidden" | "community" | "validation",
    message: string,
  ) {
    super(message);
  }
}

async function uniqueSlug(title: string): Promise<string> {
  const db = await getDb();
  const base = slugify(title);
  const taken = new Set((await db.select({ slug: records.slug }).from(records).where(like(records.slug, `${base}%`))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** Creates a community contribution. Used by the contribute form, the REST API and the MCP server. */
export async function createRecord(viewer: Viewer, input: RecordInput): Promise<{ id: string; slug: string }> {
  if (!can(viewer, "record:create")) throw new ContributionError("forbidden", "This account cannot create records.");
  const db = await getDb();

  // Community-controlled access requires membership of that community.
  if (input.communityId) {
    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, input.communityId), eq(communityMembers.userId, viewer.id)))
      .limit(1);
    if (!membership) throw new ContributionError("community", "You can only share with a community you belong to.");
    if (input.visibility === "restricted" && membership.role !== "steward") {
      throw new ContributionError("community", "Only community stewards can restrict records to stewards.");
    }
  }
  // Agents may only publish openly visible material.
  if (viewer.apiKeyScopes && (input.visibility !== "public" || input.sensitivity !== "none")) {
    throw new ContributionError("forbidden", "Records submitted through the API must be public and not sensitive.");
  }

  const countries = [...new Set([input.countryCode].filter(Boolean) as string[])];
  const slug = await uniqueSlug(input.title);
  const [row] = await db
    .insert(records)
    .values({
      slug,
      title: input.title,
      summary: input.summary,
      body: input.body,
      dimension: input.dimension,
      kind: input.kind,
      countryCode: input.countryCode ?? null,
      countryCodes: countries,
      placeName: input.placeName || null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? input.periodStart ?? null,
      dateLabel: input.dateLabel || null,
      contentLanguage: input.contentLanguage,
      tags: input.tags.map((t) => t.toLowerCase()),
      contributorId: viewer.id,
      communityId: input.communityId ?? null,
      attribution: input.attribution || viewer.name,
      license: input.license,
      visibility: input.visibility,
      sensitivity: input.sensitivity,
      verification: "unverified",
      origin: "community",
      searchText: buildSearchText(input.title, input.summary, input.body, input.tags, input.placeName, countries.map((c) => countryName(c, "en")), countries.map((c) => countryName(c, "ru"))),
      fingerprint: fingerprint(recordFingerprintText(input)),
    })
    .returning({ id: records.id, slug: records.slug });

  if (input.sources.length) {
    await db.insert(sources).values(input.sources.map((s) => ({ subjectType: "record", subjectId: row.id, citation: s.citation, url: s.url ?? null, kind: "website" })));
  }
  if (input.mediaIds.length) {
    // Only the contributor's own files that are not yet attached anywhere.
    await db
      .update(media)
      .set({ recordId: row.id })
      .where(and(inArray(media.id, input.mediaIds), eq(media.uploadedBy, viewer.id), isNull(media.recordId), isNull(media.lexiconEntryId)));
  }
  await audit(db, viewer, { action: "record.create", subjectType: "record", subjectId: row.id, details: { slug, visibility: input.visibility, media: input.mediaIds.length } });
  return row;
}

/** Records whose wording is very close to a draft: possible duplicates to show before publishing. */
export async function findPossibleDuplicates(draft: { title: string; summary?: string; body: string }, viewer: Viewer | null, limit = 4) {
  const db = await getDb();
  const fp = fingerprint(recordFingerprintText(draft));
  const rows = await db
    .select({ id: records.id, slug: records.slug, title: records.title, fingerprint: records.fingerprint, origin: records.origin })
    .from(records)
    .where(visibleRecordsWhere(viewer));
  return rows
    .map((r) => ({ slug: r.slug, title: r.title, origin: r.origin, similarity: Math.round(cosine(fp, r.fingerprint) * 100) / 100 }))
    .filter((r) => r.similarity >= 0.5)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function viewerCommunities(viewer: Viewer) {
  if (!viewer.communities.length) return [];
  const db = await getDb();
  return db
    .select({ id: communities.id, name: communities.name })
    .from(communities)
    .where(inArray(communities.id, viewer.communities.map((c) => c.id)));
}
