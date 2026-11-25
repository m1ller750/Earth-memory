import { NextResponse } from "next/server";
import { limitOrReject } from "@/lib/security/request";
import { getGlobalStats } from "@/server/stats";

/** GET /api/v1/stats: live database counts, split by provenance. */
export async function GET() {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  return NextResponse.json({ generatedAt: new Date().toISOString(), ...(await getGlobalStats()) });
}
