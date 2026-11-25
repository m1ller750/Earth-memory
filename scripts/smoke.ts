/**
 * Smoke test against a running server: every main route, every API endpoint, and every
 * internal link found on the main pages. Fails on HTTP errors, error pages and soft 404s.
 * Usage: npm run smoke            (BASE_URL defaults to http://localhost:3000)
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
// Pages stream, so a not-found or failed render still returns HTTP 200. Next.js marks a not-found
// render with this fallback code, and React marks a failed server render with an error digest.
const NOT_FOUND_MARKER = "NEXT_HTTP_ERROR_FALLBACK;404";
const ERROR_MARKERS = ["data-dgst=", "NEXT_HTTP_ERROR_FALLBACK;500"];

const PAGES = [
  "/",
  "/explore",
  "/archive",
  "/archive?q=silk&dimension=historical",
  "/archive?region=Central%20Asia",
  "/archive/samarkand-crossroad-of-cultures",
  "/archive/demo-community-seasonal-gathering",
  "/languages",
  "/languages/yaghnobi",
  "/living-earth",
  "/living-earth/species/saiga-antelope",
  "/living-earth/ecosystems/aral-sea",
  "/places/uz",
  "/graph",
  "/graph?node=language:sogdian&depth=2",
  "/timeline",
  "/alerts",
  "/alerts/language/ter-sami",
  "/ai",
  "/dashboard",
  "/community",
  "/collections/sogdian-memory",
  "/institutions/demo-university-linguistics-lab",
  "/contribute",
  "/login",
  "/register",
  "/about",
  "/developers",
];

const API: Array<{ path: string; check: (json: unknown) => boolean }> = [
  { path: "/api/v1", check: (j) => Array.isArray((j as { endpoints: unknown[] }).endpoints) },
  { path: "/api/v1/health", check: (j) => (j as { status: string }).status === "ok" },
  { path: "/api/v1/search?q=samarkand", check: (j) => (j as { results: unknown[] }).results.length > 0 },
  { path: "/api/v1/records?q=aral", check: (j) => (j as { total: number }).total > 0 },
  { path: "/api/v1/records/ancient-merv", check: (j) => (j as { sources: unknown[] }).sources.length > 0 },
  { path: "/api/v1/records/ancient-merv/related", check: (j) => Array.isArray((j as { results: unknown[] }).results) },
  { path: "/api/v1/languages?status=critically_endangered", check: (j) => (j as { results: unknown[] }).results.length > 0 },
  { path: "/api/v1/languages/ainu", check: (j) => (j as { lexicon: unknown[] }).lexicon.length > 0 },
  { path: "/api/v1/species?region=Central%20Asia", check: (j) => (j as { results: unknown[] }).results.length > 0 },
  { path: "/api/v1/ecosystems/aral-sea", check: (j) => (j as { observations: unknown[] }).observations.length > 0 },
  { path: "/api/v1/places/kz", check: (j) => (j as { counts: { records: number } }).counts.records > 0 },
  { path: "/api/v1/alerts?type=language&limit=5", check: (j) => (j as { results: unknown[] }).results.length === 5 },
  { path: "/api/v1/graph?node=entity:silk-road", check: (j) => (j as { nodes: unknown[] }).nodes.length > 1 },
  { path: "/api/v1/stats", check: (j) => (j as { totalRecords: number }).totalRecords > 0 },
];

const MUST_BE_HIDDEN = [{ path: "/api/v1/records/demo-community-seasonal-gathering", status: 404 }];

async function get(path: string) {
  const started = Date.now();
  const res = await fetch(BASE + path, { headers: { "Accept-Language": "en" }, redirect: "manual" });
  const text = await res.text();
  return { status: res.status, text, ms: Date.now() - started, location: res.headers.get("location") };
}

async function main() {
  const failures: string[] = [];
  const links = new Set<string>();
  console.info(`Smoke test against ${BASE}\n`);

  for (const path of PAGES) {
    const { status, text, ms } = await get(path);
    const softNotFound = text.includes(NOT_FOUND_MARKER);
    const errorPage = ERROR_MARKERS.some((m) => text.includes(m));
    const ok = status === 200 && !softNotFound && !errorPage;
    console.info(`${ok ? "PASS" : "FAIL"}  ${String(status).padEnd(4)} ${String(ms).padStart(5)} ms  ${path}${softNotFound ? "  (not-found page)" : ""}${errorPage ? "  (error page)" : ""}`);
    if (!ok) failures.push(path);
    for (const m of text.matchAll(/href="(\/[^"#?]*)(?:\?[^"]*)?"/g)) {
      const href = m[1];
      if (!href.startsWith("/_next") && !href.startsWith("/api/") && !href.endsWith(".svg") && !href.endsWith(".json")) links.add(href);
    }
  }

  console.info("\nAPI");
  for (const { path, check } of API) {
    const { status, text, ms } = await get(path);
    let ok = status === 200;
    try {
      ok = ok && check(JSON.parse(text));
    } catch {
      ok = false;
    }
    console.info(`${ok ? "PASS" : "FAIL"}  ${String(status).padEnd(4)} ${String(ms).padStart(5)} ms  ${path}`);
    if (!ok) failures.push(path);
  }
  for (const { path, status: expected } of MUST_BE_HIDDEN) {
    const { status } = await get(path);
    const ok = status === expected;
    console.info(`${ok ? "PASS" : "FAIL"}  ${String(status).padEnd(4)}           ${path}  (restricted record must not be exposed)`);
    if (!ok) failures.push(path);
  }

  const toCrawl = [...links].filter((l) => !PAGES.includes(l)).sort();
  console.info(`\nInternal links found on those pages: ${toCrawl.length}`);
  for (const path of toCrawl) {
    const { status, text } = await get(path);
    const ok = (status === 200 && !text.includes(NOT_FOUND_MARKER) && !ERROR_MARKERS.some((m) => text.includes(m))) || (status >= 300 && status < 400);
    if (!ok) {
      console.info(`FAIL  ${status}  ${path}`);
      failures.push(path);
    }
  }
  console.info(`\n${failures.length === 0 ? "All checks passed." : `${failures.length} failure(s):\n  ${failures.join("\n  ")}`}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
