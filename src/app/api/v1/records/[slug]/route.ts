import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { apiError, limitOrReject } from "@/lib/security/request";
import { toRecordDetail } from "@/server/api";
import { getRecordBySlug } from "@/server/records";

/** GET /api/v1/records/{slug}: full record with sources, media, entities, reviews and labelled AI annotations. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/records/[slug]">) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const { slug } = await params;
  const result = await getRecordBySlug(slug, await getViewer());
  // Restricted records are reported as not found so their existence is not revealed.
  if (result.status !== "ok") return apiError(404, "not_found", "No accessible record with this slug.");
  return NextResponse.json(toRecordDetail(result));
}
