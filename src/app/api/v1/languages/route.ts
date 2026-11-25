import { NextResponse, type NextRequest } from "next/server";
import { LANGUAGE_STATUSES, type LanguageStatus } from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { findRegion } from "@/lib/geo/regions";
import { limitOrReject } from "@/lib/security/request";
import { publicBaseUrl } from "@/server/api";
import { listLanguages } from "@/server/languages";

/** GET /api/v1/languages?q=&status=&region=: language profiles with their vitality category and its source. */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const sp = request.nextUrl.searchParams;
  const status = (LANGUAGE_STATUSES as readonly string[]).includes(sp.get("status") ?? "") ? (sp.get("status") as LanguageStatus) : undefined;
  const region = sp.get("region") ? findRegion(sp.get("region")!) : null;
  const rows = await listLanguages({ q: sp.get("q")?.slice(0, 100) || undefined, status, countries: region?.codes });
  return NextResponse.json({
    region: region?.label ?? null,
    note: "Vitality categories are quoted from the cited source (mostly the UNESCO Atlas, 2010). Speaker numbers are not given.",
    results: rows.map((l) => ({
      slug: l.slug,
      name: l.name,
      endonym: l.endonym,
      iso639_3: l.iso6393,
      family: l.family,
      status: l.status,
      statusSource: l.statusSource,
      countries: l.countryCodes.map((c) => ({ code: c, name: countryName(c, "en") })),
      provenance: l.origin,
      verification: l.verification,
      url: `${publicBaseUrl()}/languages/${l.slug}`,
    })),
  });
}
