import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { countryName } from "@/lib/geo/countries";
import { apiError, limitOrReject } from "@/lib/security/request";
import { publicBaseUrl, toRecordSummary } from "@/server/api";
import { getLanguage } from "@/server/languages";

/** GET /api/v1/languages/{slug}: profile, vocabulary, related records and Memory Alert. */
export async function GET(_request: Request, { params }: RouteContext<"/api/v1/languages/[slug]">) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const { slug } = await params;
  const data = await getLanguage(slug, await getViewer());
  if (!data) return apiError(404, "not_found", "Unknown language.");
  const { language: l } = data;
  return NextResponse.json({
    slug: l.slug,
    name: l.name,
    endonym: l.endonym,
    family: l.family,
    status: l.status,
    statusSource: l.statusSource,
    speakersNote: l.speakersNote,
    writingSystems: l.writingSystems,
    countries: l.countryCodes.map((c) => ({ code: c, name: countryName(c, "en") })),
    description: l.description,
    sources: data.sources.map((s) => ({ citation: s.citation, url: s.url })),
    lexicon: data.lexicon.map((e) => ({
      headword: e.headword,
      transcription: e.transcription,
      glossEn: e.glossEn,
      glossRu: e.glossRu,
      source: e.sourceCitation,
      verification: e.verification,
      pronunciation: e.audioId ? `${publicBaseUrl()}/api/v1/media/${e.audioId}` : null,
    })),
    records: data.records.map(toRecordSummary),
    memoryAlert: data.alert ? { score: data.alert.score, level: data.alert.level, missing: data.alert.missing, actions: data.alert.actions } : null,
    url: `${publicBaseUrl()}/languages/${l.slug}`,
  });
}
