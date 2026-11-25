import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { limitOrReject } from "@/lib/security/request";
import { unifiedSearch } from "@/server/search";

/** GET /api/v1/search?q=…&limit=12: unified search across archive, languages, species, ecosystems, entities and places. */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const limit = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 12));
  const viewer = await getViewer();
  const results = await unifiedSearch(q, viewer, limit);
  return NextResponse.json({ query: q, results: results.map(({ score, ...rest }) => ({ ...rest, score: Math.round(score * 1000) / 1000 })) });
}
