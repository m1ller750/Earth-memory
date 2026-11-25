import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { apiError, limitOrReject } from "@/lib/security/request";
import { publicBaseUrl } from "@/server/api";
import { relatedRecords } from "@/server/engine";
import { getRecordBySlug } from "@/server/records";

/** GET /api/v1/records/{slug}/related: Memory Connection Engine results with evidence and uncertainty. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/records/[slug]/related">) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const { slug } = await params;
  const viewer = await getViewer();
  const result = await getRecordBySlug(slug, viewer);
  if (result.status !== "ok") return apiError(404, "not_found", "No accessible record with this slug.");
  const related = await relatedRecords(result.record.id, viewer, 10);
  return NextResponse.json({
    record: slug,
    note: "Connections are proposed by the Memory Connection Engine from explainable signals. 'probable' and 'speculative' links are not verified; 'confirmed' means an expert accepted the link.",
    results: related.map((r) => ({
      slug: r.slug,
      title: r.title,
      dimension: r.dimension,
      strength: r.score,
      uncertainty: r.reviewStatus === "accepted" ? "confirmed" : r.uncertainty,
      reviewStatus: r.reviewStatus ?? "unreviewed",
      evidence: r.evidence.map((e) => ({ kind: e.kind, detail: e.detail, weight: e.weight })),
      url: `${publicBaseUrl()}/archive/${r.slug}`,
    })),
  });
}
