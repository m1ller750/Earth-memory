import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { apiError, limitOrReject } from "@/lib/security/request";
import { publicBaseUrl, toRecordSummary } from "@/server/api";
import { getEcosystem } from "@/server/living";

/** GET /api/v1/ecosystems/{slug}: ecosystem profile with dated observations, each with source and reliability. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/ecosystems/[slug]">) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const { slug } = await params;
  const data = await getEcosystem(slug, await getViewer());
  if (!data) return apiError(404, "not_found", "Unknown ecosystem.");
  const e = data.ecosystem;
  return NextResponse.json({
    slug: e.slug,
    name: e.name,
    kind: e.kind,
    status: e.statusNote,
    countries: e.countryCodes,
    description: e.description,
    observations: data.observations.map((o) => ({
      year: o.year,
      yearEnd: o.yearEnd,
      title: o.title,
      observation: o.observation,
      metric: o.metricValue != null ? { name: o.metricName, value: o.metricValue, unit: o.metricUnit } : null,
      source: o.sourceCitation,
      sourceUrl: o.sourceUrl,
      reliability: o.reliability,
    })),
    records: data.records.map(toRecordSummary),
    url: `${publicBaseUrl()}/living-earth/ecosystems/${e.slug}`,
  });
}
