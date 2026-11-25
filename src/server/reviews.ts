import { eq } from "drizzle-orm";
import { canReviewRecord, canViewRecord, reviewerRoleFor, type Viewer } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { records, reviews, type Verification } from "@/lib/db/schema";
import { computeVerification, type ReviewInput } from "@/lib/engine/verification";

export type ReviewOutcome =
  | { ok: true; verification: Verification; reviewerRole: "community" | "expert" }
  | { ok: false; error: "not_found" | "forbidden" };

/** Records (or updates) a reviewer's decision and recomputes the record's verification status. */
export async function submitReview(viewer: Viewer, recordId: string, decision: ReviewInput["decision"], note: string): Promise<ReviewOutcome> {
  const db = await getDb();
  const [record] = await db.select().from(records).where(eq(records.id, recordId)).limit(1);
  if (!record || !canViewRecord(viewer, record)) return { ok: false, error: "not_found" };
  if (!canReviewRecord(viewer, record)) return { ok: false, error: "forbidden" };

  const reviewerRole = reviewerRoleFor(viewer);
  await db
    .insert(reviews)
    .values({ recordId: record.id, reviewerId: viewer.id, decision, reviewerRole, note })
    .onConflictDoUpdate({ target: [reviews.recordId, reviews.reviewerId], set: { decision, reviewerRole, note, createdAt: new Date() } });
  const history = await db.select({ decision: reviews.decision, reviewerRole: reviews.reviewerRole, createdAt: reviews.createdAt }).from(reviews).where(eq(reviews.recordId, record.id));
  const verification = computeVerification(history as ReviewInput[]);
  await db.update(records).set({ verification, updatedAt: new Date() }).where(eq(records.id, record.id));
  await audit(db, viewer, { action: "review.submit", subjectType: "record", subjectId: record.id, details: { decision, reviewerRole, verification } });
  return { ok: true, verification, reviewerRole };
}
