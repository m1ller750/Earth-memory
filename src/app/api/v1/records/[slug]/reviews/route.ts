import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { apiError, isSameOrigin, limitOrReject, validationError } from "@/lib/security/request";
import { getRecordBySlug } from "@/server/records";
import { submitReview } from "@/server/reviews";

const bodySchema = z.object({ decision: z.enum(["approve", "request_changes", "dispute"]), note: z.string().trim().max(2000).default("") });

/** POST /api/v1/records/{slug}/reviews: submit a community or expert review (API key scope `verify`). */
export async function POST(request: Request, { params }: RouteContext<"/api/v1/records/[slug]/reviews">) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Cross-site request rejected.");
  const viewer = await getViewer();
  if (!viewer) return apiError(401, "unauthorized", "Authenticate with a session or an API key.");
  if (!can(viewer, "review:community") && !can(viewer, "review:expert")) return apiError(403, "forbidden", "Scope `verify` required.");
  const limited = await limitOrReject("write", viewer.id);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { slug } = await params;
  const record = await getRecordBySlug(slug, viewer);
  if (record.status !== "ok") return apiError(404, "not_found", "No accessible record with this slug.");
  const outcome = await submitReview(viewer, record.record.id, parsed.data.decision, parsed.data.note);
  if (!outcome.ok) return apiError(outcome.error === "forbidden" ? 403 : 404, outcome.error, outcome.error === "forbidden" ? "You cannot review your own contribution." : "Not found.");
  return NextResponse.json({ record: slug, verification: outcome.verification, reviewerRole: outcome.reviewerRole });
}
