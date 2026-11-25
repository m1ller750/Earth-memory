import { NextResponse, type NextRequest } from "next/server";
import { can } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { apiError, isSameOrigin, limitOrReject, validationError } from "@/lib/security/request";
import { parseArchiveParams } from "@/lib/validation/filters";
import { recordInputSchema } from "@/lib/validation/schemas";
import { toRecordSummary } from "@/server/api";
import { ContributionError, createRecord } from "@/server/contributions";
import { listRecords } from "@/server/records";

/** GET /api/v1/records: search and filter the archive (q, dimension, kind, country, region, verification, origin, from, to, tag, page, limit). */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const { filters, sort, page } = parseArchiveParams(params);
  const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
  const { items, total } = await listRecords(filters, await getViewer(), { limit, offset: (page - 1) * limit, sort });
  return NextResponse.json({ total, page, limit, results: items.map(toRecordSummary) });
}

/** POST /api/v1/records: create a community contribution (session or API key with the `contribute` scope). */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Cross-site request rejected.");
  const viewer = await getViewer();
  if (!viewer) return apiError(401, "unauthorized", "Authenticate with a session or an API key.");
  if (!can(viewer, "record:create")) return apiError(403, "forbidden", "This key or account cannot create records (scope `contribute` required).");
  const limited = await limitOrReject("write", viewer.id);
  if (limited) return limited;
  const parsed = recordInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const row = await createRecord(viewer, parsed.data);
    return NextResponse.json({ id: row.id, slug: row.slug, verification: "unverified", url: `/archive/${row.slug}` }, { status: 201 });
  } catch (error) {
    if (error instanceof ContributionError) return apiError(403, error.code, error.message);
    throw error;
  }
}
