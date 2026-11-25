import { NextResponse, type NextRequest } from "next/server";
import { IUCN_STATUSES, type IucnStatus } from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { findRegion } from "@/lib/geo/regions";
import { foldForSearch } from "@/lib/text";
import { limitOrReject } from "@/lib/security/request";
import { publicBaseUrl } from "@/server/api";
import { listSpecies } from "@/server/living";

/** GET /api/v1/species?q=&status=&region=: threatened species with their IUCN category as last assessed. */
export async function GET(request: NextRequest) {
  const limited = await limitOrReject("api");
  if (limited) return limited;
  const sp = request.nextUrl.searchParams;
  const status = (IUCN_STATUSES as readonly string[]).includes(sp.get("status") ?? "") ? (sp.get("status") as IucnStatus) : undefined;
  const region = sp.get("region") ? findRegion(sp.get("region")!) : null;
  const q = foldForSearch(sp.get("q") ?? "").trim();
  const rows = (await listSpecies(status)).filter(
    (s) => (!region || s.countryCodes.some((c) => region.codes.includes(c))) && (!q || foldForSearch(s.searchText).includes(q)),
  );
  return NextResponse.json({
    region: region?.label ?? null,
    note: "IUCN categories reflect the last assessment known to the compilers. Check the IUCN Red List for current status. No population figures are fabricated.",
    results: rows.map((s) => ({
      slug: s.slug,
      commonName: s.commonName,
      scientificName: s.scientificName,
      iucnStatus: s.iucnStatus,
      assessment: s.assessmentNote,
      habitat: s.habitat,
      countries: s.countryCodes.map((c) => ({ code: c, name: countryName(c, "en") })),
      url: `${publicBaseUrl()}/living-earth/species/${s.slug}`,
    })),
  });
}
