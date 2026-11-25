import { NextResponse, type NextRequest } from "next/server";
import type { AlertSubjectType } from "@/lib/engine/alerts";
import { findRegion } from "@/lib/geo/regions";
import { limitOrReject } from "@/lib/security/request";
import { publicBaseUrl } from "@/server/api";
import { getAllAlerts } from "@/server/alerts";

const TYPES: AlertSubjectType[] = ["language", "tradition", "ecosystem", "species"];

/** GET /api/v1/alerts?type=&region=&limit=: Memory Alert preservation-priority indicators with their factors. */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const sp = request.nextUrl.searchParams;
  const type = (TYPES as string[]).includes(sp.get("type") ?? "") ? (sp.get("type") as AlertSubjectType) : null;
  const region = sp.get("region") ? findRegion(sp.get("region")!) : null;
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));
  const alerts = (await getAllAlerts()).filter((a) => (!type || a.subjectType === type) && (!region || a.countryCodes.some((c) => region.codes.includes(c)))).slice(0, limit);
  return NextResponse.json({
    method: "score = 100 × (0.45 threat + 0.35 documentation gap + 0.10 single-source risk + 0.10 verification gap)",
    disclaimer: "Not an extinction prediction. Reflects what Earth Memory documents and the cited threat category.",
    region: region?.label ?? null,
    results: alerts.map((a) => ({
      subjectType: a.subjectType,
      slug: a.slug,
      name: a.name,
      score: a.score,
      level: a.level,
      confidence: a.confidence,
      threat: { category: a.threatCategory, source: a.threatSource },
      factors: a.factors.map((f) => ({ key: f.key, value: f.value, weight: f.weight, points: f.points })),
      missing: a.missing,
      recommendedActions: a.actions,
      url: `${publicBaseUrl()}/alerts/${a.subjectType}/${a.slug}`,
    })),
  });
}
