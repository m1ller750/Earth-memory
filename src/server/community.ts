import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { collectionItems, collectionMembers, collections, institutions, lexiconEntries, records, reports, reviews, sources, users } from "@/lib/db/schema";
import { computeReputation, type ContributionStats } from "@/lib/engine/reputation";
import { listRecords } from "./records";

async function statsFor(userIds: string[]): Promise<Map<string, ContributionStats>> {
  const db = await getDb();
  const empty = (): ContributionStats => ({ totalContributions: 0, communityVerified: 0, expertVerified: 0, disputed: 0, sourcesCited: 0, reviewsGiven: 0, lexiconVerified: 0, upheldReports: 0 });
  const out = new Map(userIds.map((id) => [id, empty()]));
  if (!userIds.length) return out;
  const [recordRows, sourceRows, reviewRows, lexiconRows, reportRows] = await Promise.all([
    db
      .select({ userId: records.contributorId, verification: records.verification, n: count() })
      .from(records)
      .where(inArray(records.contributorId, userIds))
      .groupBy(records.contributorId, records.verification),
    db
      .select({ userId: records.contributorId, n: count() })
      .from(sources)
      .innerJoin(records, and(eq(sources.subjectType, "record"), sql`${sources.subjectId} = ${records.id}`))
      .where(inArray(records.contributorId, userIds))
      .groupBy(records.contributorId),
    db.select({ userId: reviews.reviewerId, n: count() }).from(reviews).where(inArray(reviews.reviewerId, userIds)).groupBy(reviews.reviewerId),
    db
      .select({ userId: lexiconEntries.contributorId, n: count() })
      .from(lexiconEntries)
      .where(and(inArray(lexiconEntries.contributorId, userIds), inArray(lexiconEntries.verification, ["community_verified", "expert_verified"])))
      .groupBy(lexiconEntries.contributorId),
    db
      .select({ userId: records.contributorId, n: count() })
      .from(reports)
      .innerJoin(records, sql`${reports.subjectId} = ${records.id}`)
      .where(and(eq(reports.status, "resolved"), inArray(records.contributorId, userIds)))
      .groupBy(records.contributorId),
  ]);
  for (const r of recordRows) {
    const s = out.get(r.userId!)!;
    s.totalContributions += r.n;
    if (r.verification === "community_verified") s.communityVerified += r.n;
    if (r.verification === "expert_verified") s.expertVerified += r.n;
    if (r.verification === "disputed") s.disputed += r.n;
  }
  for (const r of sourceRows) out.get(r.userId!)!.sourcesCited = r.n;
  for (const r of reviewRows) out.get(r.userId)!.reviewsGiven = r.n;
  for (const r of lexiconRows) out.get(r.userId!)!.lexiconVerified = r.n;
  for (const r of reportRows) out.get(r.userId!)!.upheldReports = r.n;
  return out;
}

export async function listContributors() {
  const db = await getDb();
  const rows = await db.select({ id: users.id, name: users.name, role: users.role, affiliation: users.affiliation, isDemo: users.isDemo, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(200);
  const stats = await statsFor(rows.map((r) => r.id));
  return rows
    .map((r) => ({ ...r, stats: stats.get(r.id)!, reputation: computeReputation(stats.get(r.id)!) }))
    .sort((a, b) => b.reputation.score - a.reputation.score || b.stats.totalContributions - a.stats.totalContributions);
}

export async function getContributor(id: string, viewer: Viewer | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [user] = await db
    .select({ id: users.id, name: users.name, role: users.role, bio: users.bio, affiliation: users.affiliation, isDemo: users.isDemo, createdAt: users.createdAt, institutionId: users.institutionId })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!user) return null;
  const stats = (await statsFor([id])).get(id)!;
  const [contributions, recentReviews, institution] = await Promise.all([
    listRecords({ contributorId: id }, viewer, { limit: 24 }),
    db
      .select({ id: reviews.id, decision: reviews.decision, createdAt: reviews.createdAt, slug: records.slug, title: records.title, visibility: records.visibility })
      .from(reviews)
      .innerJoin(records, eq(records.id, reviews.recordId))
      .where(and(eq(reviews.reviewerId, id), eq(records.visibility, "public")))
      .orderBy(desc(reviews.createdAt))
      .limit(10),
    user.institutionId ? db.select().from(institutions).where(eq(institutions.id, user.institutionId)).limit(1) : Promise.resolve([]),
  ]);
  return { user, stats, reputation: computeReputation(stats), contributions: contributions.items, reviews: recentReviews, institution: institution[0] ?? null };
}

export async function listInstitutions() {
  const db = await getDb();
  return db.select().from(institutions).orderBy(institutions.name);
}

export async function getInstitution(slug: string, viewer: Viewer | null) {
  const db = await getDb();
  const [institution] = await db.select().from(institutions).where(eq(institutions.slug, slug)).limit(1);
  if (!institution) return null;
  const members = await db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.institutionId, institution.id));
  const cols = await db.select().from(collections).where(and(eq(collections.institutionId, institution.id), viewer ? undefined : eq(collections.visibility, "public")));
  return { institution, members, collections: cols };
}

export async function listCollections() {
  const db = await getDb();
  const rows = await db
    .select({ collection: collections, items: sql<number>`(select count(*)::int from ${collectionItems} ci where ci.collection_id = ${collections.id})`, members: sql<number>`(select count(*)::int from ${collectionMembers} cm where cm.collection_id = ${collections.id})` })
    .from(collections)
    .where(eq(collections.visibility, "public"))
    .orderBy(collections.title);
  return rows;
}

export async function getCollection(slug: string, viewer: Viewer | null) {
  const db = await getDb();
  const [collection] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1);
  if (!collection) return null;
  if (collection.visibility !== "public" && collection.ownerId !== viewer?.id) return null;
  const itemRows = await db.select({ recordId: collectionItems.recordId, note: collectionItems.note }).from(collectionItems).where(eq(collectionItems.collectionId, collection.id));
  const { recordsByIds } = await import("./records");
  const items = await recordsByIds(itemRows.map((i) => i.recordId), viewer);
  const memberRows = await db
    .select({ id: users.id, name: users.name, role: collectionMembers.role })
    .from(collectionMembers)
    .innerJoin(users, eq(users.id, collectionMembers.userId))
    .where(eq(collectionMembers.collectionId, collection.id));
  const [institution] = collection.institutionId ? await db.select().from(institutions).where(eq(institutions.id, collection.institutionId)).limit(1) : [];
  return { collection, items, members: memberRows, institution: institution ?? null };
}
