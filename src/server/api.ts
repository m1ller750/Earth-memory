import { countryName } from "@/lib/geo/countries";
import type { RecordDetail, RecordListItem } from "./records";

/** Public JSON shapes for the REST API and the MCP server. Internal ids stay out of list views. */

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function toRecordSummary(r: RecordListItem) {
  return {
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    dimension: r.dimension,
    kind: r.kind,
    country: r.countryCode ? { code: r.countryCode, name: countryName(r.countryCode, "en") } : null,
    countries: r.countryCodes,
    place: r.placeName,
    coordinates: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    period: r.periodStart != null ? { start: r.periodStart, end: r.periodEnd ?? r.periodStart, label: r.dateLabel } : null,
    verification: r.verification,
    provenance: r.origin,
    url: `${publicBaseUrl()}/archive/${r.slug}`,
  };
}

export function toRecordDetail(d: RecordDetail) {
  const r = d.record;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    body: r.body,
    dimension: r.dimension,
    kind: r.kind,
    countries: [...new Set([r.countryCode, ...r.countryCodes].filter(Boolean) as string[])].map((c) => ({ code: c, name: countryName(c, "en") })),
    place: r.placeName,
    coordinates: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    period: r.periodStart != null ? { start: r.periodStart, end: r.periodEnd ?? r.periodStart, label: r.dateLabel } : null,
    contentLanguage: r.contentLanguage,
    tags: r.tags,
    license: r.license,
    attribution: r.attribution,
    visibility: r.visibility,
    verification: r.verification,
    provenance: r.origin,
    provenanceNote:
      r.origin === "reference"
        ? "Reference data from the cited public sources (the attribution says how it was compiled); pending expert verification."
        : r.origin === "demo"
          ? "Fictional demonstration content."
          : "Community contribution.",
    sources: d.sources.map((s) => ({ citation: s.citation, url: s.url, kind: s.kind })),
    media: d.media.map((m) => ({ id: m.id, kind: m.kind, mime: m.mime, caption: m.caption, url: `${publicBaseUrl()}/api/v1/media/${m.id}` })),
    entities: d.entities.map((e) => ({ slug: e.slug, name: e.name, type: e.type })),
    language: d.language,
    ecosystem: d.ecosystem,
    species: d.species,
    reviews: d.reviews.map((rv) => ({ decision: rv.decision, reviewerRole: rv.reviewerRole, note: rv.note, createdAt: rv.createdAt })),
    aiAnnotations: d.annotations.map((a) => ({ kind: a.kind, targetLanguage: a.targetLanguage, model: a.model, status: a.status, label: "AI interpretation, not verified", content: a.content })),
    url: `${publicBaseUrl()}/archive/${r.slug}`,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
