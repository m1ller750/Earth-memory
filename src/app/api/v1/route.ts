import { NextResponse } from "next/server";

/** GET /api/v1: index of the public API. */
export function GET() {
  return NextResponse.json({
    name: "EARTH MEMORY API",
    version: "1",
    auth: "Read endpoints are public (public records only). Writes need a session or 'Authorization: Bearer em_…' with the matching scope (contribute, verify). Create keys at /account#api-keys.",
    endpoints: [
      { method: "GET", path: "/api/v1/search?q=", description: "Unified search across records, languages, species, ecosystems, entities and places" },
      { method: "GET", path: "/api/v1/records", description: "Search and filter the archive" },
      { method: "POST", path: "/api/v1/records", description: "Create a contribution (scope: contribute)" },
      { method: "GET", path: "/api/v1/records/{slug}", description: "Full record with sources and labelled AI annotations" },
      { method: "GET", path: "/api/v1/records/{slug}/related", description: "Memory Connection Engine results with evidence" },
      { method: "POST", path: "/api/v1/records/{slug}/reviews", description: "Submit a review (scope: verify)" },
      { method: "GET", path: "/api/v1/languages", description: "Endangered language profiles" },
      { method: "GET", path: "/api/v1/languages/{slug}", description: "Language profile, vocabulary and Memory Alert" },
      { method: "GET", path: "/api/v1/species", description: "Threatened species" },
      { method: "GET", path: "/api/v1/ecosystems/{slug}", description: "Ecosystem with dated, sourced observations" },
      { method: "GET", path: "/api/v1/places/{code}", description: "What the archive holds about a country" },
      { method: "GET", path: "/api/v1/alerts", description: "Memory Alert indicators" },
      { method: "GET", path: "/api/v1/graph?node=", description: "Knowledge-graph neighbourhood" },
      { method: "GET", path: "/api/v1/stats", description: "Live counts" },
      { method: "POST", path: "/api/v1/ai/chat", description: "EARTH AI (newline-delimited JSON stream)" },
      { method: "POST", path: "/api/v1/media", description: "Upload a file (session or contribute scope)" },
      { method: "GET", path: "/api/v1/health", description: "Health check" },
    ],
  });
}
