"use server";

import { and, eq, or } from "drizzle-orm";
import { refresh } from "next/cache";
import { can } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { edges, reports } from "@/lib/db/schema";
import { scorePair } from "@/lib/engine/connections";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { connectionReviewSchema, reportSchema, reviewSchema } from "@/lib/validation/schemas";
import { loadEngineRecords } from "@/server/engine";
import { submitReview } from "@/server/reviews";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

function limited(viewerId: string) {
  return !rateLimit(`write:${viewerId}`, LIMITS.write.limit, LIMITS.write.windowMs).ok;
}

export async function submitReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "auth" };
  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation" };
  if (limited(viewer.id)) return { error: "rate_limited" };

  const outcome = await submitReview(viewer, parsed.data.recordId, parsed.data.decision, parsed.data.note);
  if (!outcome.ok) return { error: outcome.error };
  refresh();
  return { ok: true };
}

export async function reportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "report:create")) return { error: "auth" };
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation" };
  if (limited(viewer.id)) return { error: "rate_limited" };
  const db = await getDb();
  await db.insert(reports).values({ subjectType: parsed.data.subjectType, subjectId: parsed.data.subjectId, reporterId: viewer.id, reason: parsed.data.reason, details: parsed.data.details });
  await audit(db, viewer, { action: "report.create", subjectType: parsed.data.subjectType, subjectId: parsed.data.subjectId, details: { reason: parsed.data.reason } });
  return { ok: true };
}

/** Experts accept or reject a connection proposed by the engine. Evidence is recomputed on the server. */
export async function reviewConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "edge:review")) return { error: "forbidden" };
  const parsed = connectionReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation" };
  if (limited(viewer.id)) return { error: "rate_limited" };
  const { recordId, otherId, decision } = parsed.data;

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.sourceType, "record"),
        eq(edges.targetType, "record"),
        or(and(eq(edges.sourceId, recordId), eq(edges.targetId, otherId)), and(eq(edges.sourceId, otherId), eq(edges.targetId, recordId))),
      ),
    )
    .limit(1);

  const status = decision === "accept" ? "accepted" : "rejected";
  if (existing) {
    await db
      .update(edges)
      .set({ status, uncertainty: decision === "accept" ? "confirmed" : existing.uncertainty, reviewedBy: viewer.id, reviewedAt: new Date() })
      .where(eq(edges.id, existing.id));
  } else {
    const { records: all, context } = await loadEngineRecords(viewer);
    const a = all.find((r) => r.id === recordId);
    const b = all.find((r) => r.id === otherId);
    if (!a || !b) return { error: "not_found" };
    const scored = scorePair(a, b, context);
    await db.insert(edges).values({
      sourceType: "record",
      sourceId: recordId,
      targetType: "record",
      targetId: otherId,
      relation: "possibly_related",
      evidence: scored?.evidence ?? [],
      provenance: "engine",
      confidence: scored?.score ?? 0,
      uncertainty: decision === "accept" ? "confirmed" : (scored?.uncertainty ?? "speculative"),
      status,
      reviewedBy: viewer.id,
      reviewedAt: new Date(),
    });
  }
  await audit(db, viewer, { action: `connection.${decision}`, subjectType: "record", subjectId: recordId, details: { otherId } });
  refresh();
  return { ok: true };
}
