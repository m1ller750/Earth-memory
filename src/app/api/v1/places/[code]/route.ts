import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { apiError, limitOrReject } from "@/lib/security/request";
import { getPlaceSummary } from "@/server/places";

/** GET /api/v1/places/{ISO-alpha-2}: what Earth Memory holds about a country. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/places/[code]">) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const { code } = await params;
  const summary = await getPlaceSummary(code, await getViewer());
  if (!summary) return apiError(404, "not_found", "Unknown country code.");
  return NextResponse.json(summary);
}
