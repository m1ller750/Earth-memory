/**
 * EARTH MEMORY MCP server (stdio).
 *
 * Gives AI agents controlled access to the archive through the public REST API, so every
 * permission check, validation rule, rate limit and audit entry of the platform applies.
 *
 *   EARTH_MEMORY_URL      base URL of a running Earth Memory server (default http://localhost:3000)
 *   EARTH_MEMORY_API_KEY  optional API key ("em_…"). Without it only read tools are registered.
 *
 * Read tools:  search_archive, get_archive_record, search_languages, explore_location,
 *              find_related_records, search_species, get_preservation_status
 * Write tools: submit_contribution (scope "contribute"), verify_record (scope "verify")
 *
 * Logs go to stderr; stdout carries the MCP protocol.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.EARTH_MEMORY_URL ?? "http://localhost:3000").replace(/\/$/, "");
const API_KEY = process.env.EARTH_MEMORY_API_KEY?.trim() || null;
const VERSION = "0.1.0";

const DIMENSIONS = ["human", "cultural", "historical", "natural", "scientific"] as const;
const KINDS = ["photograph", "video", "audio", "document", "story", "interview", "recipe", "practice", "map", "research", "observation", "site", "tradition", "event", "artifact"] as const;
const LANGUAGE_STATUSES = ["vulnerable", "definitely_endangered", "severely_endangered", "critically_endangered", "extinct", "safe"] as const;
const IUCN = ["CR", "EN", "VU", "NT", "LC", "DD", "EW", "EX"] as const;
const LICENSES = ["CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC0-1.0", "public-domain", "all-rights-reserved", "community-protocol"] as const;

function log(event: string, details: Record<string, unknown> = {}) {
  process.stderr.write(`${JSON.stringify({ ts: new Date().toISOString(), server: "earth-memory-mcp", event, ...details })}\n`);
}

class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(method: "GET" | "POST", path: string, body?: unknown, auth = false): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": `earth-memory-mcp/${VERSION}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && API_KEY) headers.Authorization = `Bearer ${API_KEY}`;
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new ApiFailure(`Earth Memory is not reachable at ${BASE_URL} (${error instanceof Error ? error.message : String(error)}). Start the server or set EARTH_MEMORY_URL.`, 0);
  }
  log("api_call", { method, path: path.split("?")[0], status: response.status, ms: Date.now() - started });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!response.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${response.status}`;
    throw new ApiFailure(message, response.status);
  }
  return json;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

async function run(tool: string, fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("tool_error", { tool, message });
    return { isError: true, content: [{ type: "text", text: `Earth Memory error: ${message}` }] };
  }
}

const server = new McpServer(
  { name: "earth-memory", version: VERSION },
  {
    instructions:
      "Tools for EARTH MEMORY, an archive of cultural, historical, linguistic, natural and scientific memory. Results only include public records. Records marked provenance 'reference' come from public sources (an AI-assisted editorial compilation, or text imported from Wikipedia with Wikidata facts; see each record's attribution) and are pending expert verification; 'demo' records are fictional. Connection Engine links labelled 'probable' or 'speculative' are not verified. Always cite record URLs and never present unverified material as established fact.",
  },
);

/* ------------------------------------------------------------- read tools */

server.registerTool(
  "search_archive",
  {
    title: "Search the archive",
    description: "Search Earth Memory archive records (stories, traditions, sites, events, documents, observations). Filters are optional. Returns summaries with provenance and verification status.",
    inputSchema: {
      query: z.string().max(200).optional().describe("Free text, any language, e.g. 'silk road', 'Самарканд'"),
      dimension: z.enum(DIMENSIONS).optional(),
      kind: z.enum(KINDS).optional(),
      country: z.string().regex(/^[A-Za-z]{2}$/).optional().describe("ISO 3166-1 alpha-2 code"),
      region: z.string().max(60).optional().describe("Region name such as 'Central Asia' or 'Middle East'"),
      verification: z.enum(["unverified", "community_verified", "expert_verified", "disputed"]).optional(),
      from: z.number().int().min(-10000).max(3000).optional().describe("Period start year (negative = BCE)"),
      to: z.number().int().min(-10000).max(3000).optional().describe("Period end year"),
      limit: z.number().int().min(1).max(50).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (a) => run("search_archive", () => call("GET", `/api/v1/records${qs({ q: a.query, dimension: a.dimension, kind: a.kind, country: a.country?.toUpperCase(), region: a.region, verification: a.verification, from: a.from, to: a.to, limit: a.limit })}`)),
);

server.registerTool(
  "get_archive_record",
  {
    title: "Get an archive record",
    description: "Full record by slug: text, place, period, sources, media links, knowledge-graph entities, review history and any AI annotations (always labelled as unverified AI interpretation).",
    inputSchema: { slug: z.string().regex(/^[a-z0-9-]{1,120}$/).describe("Record slug, e.g. 'ancient-merv'") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ slug }) => run("get_archive_record", () => call("GET", `/api/v1/records/${slug}`)),
);

server.registerTool(
  "search_languages",
  {
    title: "Search languages",
    description: "Endangered language profiles with their vitality category and the source of that category. Speaker numbers are not provided.",
    inputSchema: {
      query: z.string().max(100).optional(),
      status: z.enum(LANGUAGE_STATUSES).optional(),
      region: z.string().max(60).optional().describe("e.g. 'Central Asia', 'Siberia', 'Pacific Islands'"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (a) => run("search_languages", () => call("GET", `/api/v1/languages${qs({ q: a.query, status: a.status, region: a.region })}`)),
);

server.registerTool(
  "explore_location",
  {
    title: "Explore a location",
    description: "What Earth Memory holds about a country: counts, records, languages, species and Memory Alerts.",
    inputSchema: { country: z.string().min(2).max(60).describe("ISO alpha-2 code (e.g. 'UZ') or an English country name") },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ country }) =>
    run("explore_location", async () => {
      let code = /^[A-Za-z]{2}$/.test(country) ? country.toLowerCase() : null;
      if (!code) {
        const search = (await call("GET", `/api/v1/search${qs({ q: country, limit: 5 })}`)) as { results: Array<{ type: string; href: string }> };
        const place = search.results.find((r) => r.type === "place" && /^\/places\/[a-z]{2}$/.test(r.href));
        if (!place) throw new ApiFailure(`No country found for "${country}".`, 404);
        code = place.href.split("/").pop()!;
      }
      return call("GET", `/api/v1/places/${code}`);
    }),
);

server.registerTool(
  "find_related_records",
  {
    title: "Find related records",
    description: "Memory Connection Engine results for a record: related records with a 0–1 strength, the evidence for each link and an uncertainty label (confirmed only when an expert accepted it).",
    inputSchema: { slug: z.string().regex(/^[a-z0-9-]{1,120}$/) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async ({ slug }) => run("find_related_records", () => call("GET", `/api/v1/records/${slug}/related`)),
);

server.registerTool(
  "search_species",
  {
    title: "Search threatened species",
    description: "Threatened species with their IUCN Red List category as last assessed, habitat and range countries.",
    inputSchema: {
      query: z.string().max(100).optional(),
      status: z.enum(IUCN).optional(),
      region: z.string().max(60).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (a) => run("search_species", () => call("GET", `/api/v1/species${qs({ q: a.query, status: a.status, region: a.region })}`)),
);

server.registerTool(
  "get_preservation_status",
  {
    title: "Get preservation status (Memory Alert)",
    description:
      "Memory Alert preservation-priority indicators: score 0–100, level, factors, missing documentation and recommended actions. Not an extinction prediction. Optionally filter by subject type, region or slug.",
    inputSchema: {
      type: z.enum(["language", "tradition", "ecosystem", "species"]).optional(),
      region: z.string().max(60).optional(),
      slug: z.string().regex(/^[a-z0-9-]{1,120}$/).optional().describe("Return only this subject"),
      limit: z.number().int().min(1).max(100).default(10),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async (a) =>
    run("get_preservation_status", async () => {
      const data = (await call("GET", `/api/v1/alerts${qs({ type: a.type, region: a.region, limit: a.slug ? 100 : a.limit })}`)) as { results: Array<{ slug: string }> };
      return a.slug ? { ...data, results: data.results.filter((r) => r.slug === a.slug) } : data;
    }),
);

/* ------------------------------------------------------------ write tools */

if (API_KEY) {
  server.registerTool(
    "submit_contribution",
    {
      title: "Submit a contribution",
      description:
        "Create a new public archive record on behalf of the API key's owner. It starts unverified. Only submit material the human has the right to share, with consent from the people involved; set consentConfirmed only when the human has explicitly confirmed this.",
      inputSchema: {
        title: z.string().min(3).max(200),
        summary: z.string().max(400).optional(),
        body: z.string().min(20).max(20000),
        dimension: z.enum(DIMENSIONS),
        kind: z.enum(KINDS),
        contentLanguage: z.string().regex(/^[a-z]{2,3}$/).default("en"),
        countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(),
        placeName: z.string().max(200).optional(),
        lat: z.number().min(-90).max(90).optional(),
        lng: z.number().min(-180).max(180).optional(),
        periodStart: z.number().int().min(-10000).max(3000).optional(),
        periodEnd: z.number().int().min(-10000).max(3000).optional(),
        tags: z.array(z.string().max(40)).max(12).default([]),
        sources: z.array(z.object({ citation: z.string().min(3).max(500), url: z.string().url().optional() })).max(20).default([]),
        license: z.enum(LICENSES).default("CC-BY-4.0"),
        consentConfirmed: z.boolean().describe("The human confirmed they may share this and that the people involved consented"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (a) =>
      run("submit_contribution", async () => {
        if (!a.consentConfirmed) throw new ApiFailure("Consent has not been confirmed by the human. Ask them before submitting.", 400);
        const { consentConfirmed, countryCode, ...rest } = a;
        return call("POST", "/api/v1/records", { ...rest, countryCode: countryCode?.toUpperCase(), visibility: "public", sensitivity: "none", consent: consentConfirmed }, true);
      }),
  );

  server.registerTool(
    "verify_record",
    {
      title: "Review a record",
      description: "Submit a review decision for a record on behalf of the API key's owner (scope 'verify'). Decisions: approve, request_changes, dispute. Explain what was checked in the note.",
      inputSchema: {
        slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
        decision: z.enum(["approve", "request_changes", "dispute"]),
        note: z.string().max(2000).default(""),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ slug, decision, note }) => run("verify_record", () => call("POST", `/api/v1/records/${slug}/reviews`, { decision, note }, true)),
  );
}

async function main() {
  await server.connect(new StdioServerTransport());
  log("started", { baseUrl: BASE_URL, writeTools: Boolean(API_KEY) });
}

main().catch((error) => {
  log("fatal", { message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
