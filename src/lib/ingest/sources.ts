/**
 * Network clients for the reference-data importer, each with an on-disk cache so re-runs are
 * incremental and reproducible:
 *
 * - Jina Reader through Jina's MCP server (`read_url`): parses each article into markdown.
 *   JINA_API_KEY is optional; without it Jina applies lower rate limits.
 * - Wikipedia API: lead text, coordinates and the Wikidata id of each article.
 * - Wikidata API and SPARQL endpoint: structured facts (countries, dates, statuses, designations).
 * - Glottolog: coordinates for languages.
 *
 * Only public reference pages are requested. No personal data is sent anywhere.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { WikidataEntity } from "./parse";

const USER_AGENT = "EarthMemoryImporter/0.2 (heritage archive prototype; Node.js)";
export const JINA_MCP_URL = process.env.JINA_MCP_URL ?? "https://mcp.jina.ai/v1";

export type Log = (message: string) => void;

/* ------------------------------------------------------------------ cache and HTTP */

export class DiskCache {
  constructor(
    readonly dir: string,
    readonly refresh = false,
  ) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(namespace: string, key: string) {
    const hash = crypto.createHash("sha1").update(key).digest("hex").slice(0, 20);
    return path.join(this.dir, namespace, `${hash}.json`);
  }

  get<T>(namespace: string, key: string): T | undefined {
    if (this.refresh) return undefined;
    try {
      return (JSON.parse(fs.readFileSync(this.file(namespace, key), "utf8")) as { value: T }).value;
    } catch {
      return undefined;
    }
  }

  set(namespace: string, key: string, value: unknown) {
    const file = this.file(namespace, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ key, savedAt: new Date().toISOString(), value }));
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryable(error: unknown): boolean {
  if (error instanceof HttpError) return error.status === 429 || error.status >= 500;
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket|503|502|504|overloaded|temporar/i.test(message);
}

export async function withRetry<T>(fn: () => Promise<T>, label: string, log: Log = () => {}, attempts = 6): Promise<T> {
  let delay = 2000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts || !retryable(error)) throw error;
      const wait = error instanceof HttpError && error.retryAfter ? error.retryAfter * 1000 : delay;
      log(`  retry ${attempt}/${attempts - 1} for ${label} in ${Math.round(wait / 1000)}s (${error instanceof Error ? error.message.slice(0, 80) : "error"})`);
      await sleep(wait);
      delay = Math.min(delay * 2, 60_000);
    }
  }
}

export async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after")) || undefined;
    throw new HttpError(response.status, `${response.status} ${response.statusText} for ${url.slice(0, 120)}`, retryAfter);
  }
  return (await response.json()) as T;
}

/** Runs `fn` over `items` with at most `limit` calls in flight, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------------------ Jina Reader (MCP) */

export class JinaReader {
  private client: Promise<Client> | null = null;

  constructor(
    private readonly cache: DiskCache,
    private readonly log: Log = () => {},
    private readonly apiKey = process.env.JINA_API_KEY,
  ) {}

  get authenticated() {
    return Boolean(this.apiKey);
  }

  private connect(): Promise<Client> {
    this.client ??= (async () => {
      const transport = new StreamableHTTPClientTransport(new URL(JINA_MCP_URL), {
        requestInit: { headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {} },
      });
      const client = new Client({ name: "earth-memory-importer", version: "0.2.0" });
      await client.connect(transport);
      const { tools } = await client.listTools();
      if (!tools.some((t) => t.name === "read_url")) throw new Error("Jina MCP server does not offer read_url");
      return client;
    })();
    return this.client;
  }

  /** Article as returned by Jina's read_url tool (YAML-style text with url, title and markdown content). */
  async read(url: string): Promise<string> {
    const cached = this.cache.get<string>("jina", url);
    if (cached) return cached;
    const text = await withRetry(
      async () => {
        const client = await this.connect();
        const result = (await client.callTool({ name: "read_url", arguments: { url } }, undefined, { timeout: 180_000 })) as {
          isError?: boolean;
          content?: Array<{ type: string; text?: string }>;
        };
        const body = (result.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("\n");
        if (result.isError) throw new Error(`Jina read_url error: ${body.slice(0, 200)}`);
        if (body.length < 200) throw new Error(`Jina returned too little content (${body.length} chars)`);
        return body;
      },
      `jina ${url}`,
      this.log,
    );
    this.cache.set("jina", url, text);
    return text;
  }

  async close() {
    if (!this.client) return;
    try {
      await (await this.client).close();
    } catch {
      /* already closed */
    }
  }
}

/* ------------------------------------------------------------------ Wikipedia */

export interface WikiPage {
  requested: string;
  title: string;
  url: string;
  qid?: string;
  extract: string;
  description?: string;
  lat?: number;
  lng?: number;
  missing: boolean;
  disambiguation?: boolean;
}

/** Disambiguation pages list several topics; they are never a source for one item. */
export function isDisambiguation(page: WikiPage): boolean {
  return (
    Boolean(page.disambiguation) ||
    /^(?:topics referred to by the same term|index of )/i.test(page.description ?? "") ||
    /\bmay (?:also )?refer to\b/i.test(page.extract.slice(0, 400))
  );
}

interface WikiQueryResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{
      title: string;
      missing?: boolean;
      extract?: string;
      description?: string;
      fullurl?: string;
      pageprops?: { wikibase_item?: string; disambiguation?: string };
      coordinates?: Array<{ lat: number; lon: number; globe?: string }>;
    }>;
  };
}

/** Lead extracts, coordinates and Wikidata ids for many articles (20 per request). */
export async function fetchWikipediaPages(titles: string[], cache: DiskCache, log: Log = () => {}): Promise<Map<string, WikiPage>> {
  const result = new Map<string, WikiPage>();
  const todo: string[] = [];
  for (const t of [...new Set(titles)]) {
    const hit = cache.get<WikiPage>("wikipedia", t);
    if (hit) result.set(t, hit);
    else todo.push(t);
  }
  for (const batch of chunks(todo, 20)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "extracts|coordinates|pageprops|description|info",
      exintro: "1",
      explaintext: "1",
      exlimit: "20",
      colimit: "max",
      ppprop: "wikibase_item|disambiguation",
      inprop: "url",
      titles: batch.join("|"),
    });
    const data = await withRetry(() => getJson<WikiQueryResponse>(`https://en.wikipedia.org/w/api.php?${params}`), "wikipedia batch", log);
    const rename = new Map<string, string>();
    for (const n of data.query?.normalized ?? []) rename.set(n.from, n.to);
    for (const r of data.query?.redirects ?? []) rename.set(r.from, r.to);
    const resolve = (t: string) => {
      let current = t;
      for (let i = 0; i < 4 && rename.has(current); i++) current = rename.get(current)!;
      return current;
    };
    const pages = new Map((data.query?.pages ?? []).map((p) => [p.title, p]));
    for (const requested of batch) {
      const page = pages.get(resolve(requested));
      const coordinate = page?.coordinates?.find((c) => !c.globe || c.globe === "earth");
      const entry: WikiPage = {
        requested,
        title: page?.title ?? requested,
        url: page?.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(requested.replace(/ /g, "_"))}`,
        qid: page?.pageprops?.wikibase_item,
        extract: page?.extract ?? "",
        description: page?.description,
        lat: coordinate?.lat,
        lng: coordinate?.lon,
        missing: !page || Boolean(page.missing),
        disambiguation: page?.pageprops?.disambiguation !== undefined,
      };
      result.set(requested, entry);
      if (!entry.missing) cache.set("wikipedia", requested, entry);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ Wikidata */

/** Entities by id (50 per request), English and Russian labels. */
export async function fetchWikidata(
  ids: string[],
  cache: DiskCache,
  props = "claims|labels|aliases|descriptions|sitelinks",
  log: Log = () => {},
): Promise<Map<string, WikidataEntity>> {
  const result = new Map<string, WikidataEntity>();
  const todo: string[] = [];
  const namespace = `wikidata-${props.replace(/\|/g, "-")}`;
  for (const id of [...new Set(ids)].filter((x) => /^Q\d+$/.test(x))) {
    const hit = cache.get<WikidataEntity>(namespace, id);
    if (hit) result.set(id, hit);
    else todo.push(id);
  }
  for (const batch of chunks(todo, 50)) {
    const params = new URLSearchParams({
      action: "wbgetentities",
      format: "json",
      ids: batch.join("|"),
      props,
      languages: "en|ru",
      sitefilter: "enwiki|ruwiki",
    });
    const data = await withRetry(() => getJson<{ entities?: Record<string, WikidataEntity> }>(`https://www.wikidata.org/w/api.php?${params}`), "wikidata batch", log);
    for (const [id, entity] of Object.entries(data.entities ?? {})) {
      result.set(id, entity);
      cache.set(namespace, id, entity);
    }
  }
  return result;
}

type SparqlRow = Record<string, { value: string }>;

export async function sparql(query: string, cache: DiskCache, log: Log = () => {}): Promise<SparqlRow[]> {
  const hit = cache.get<SparqlRow[]>("sparql", query);
  if (hit) return hit;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  const data = await withRetry(() => getJson<{ results: { bindings: SparqlRow[] } }>(url, { Accept: "application/sparql-results+json" }), "wikidata sparql", log);
  cache.set("sparql", query, data.results.bindings);
  return data.results.bindings;
}

/** Wikidata id → ISO 3166-1 alpha-2 code, for every item that has one. */
export async function countryCodesByQid(cache: DiskCache, log?: Log): Promise<Map<string, string>> {
  const rows = await sparql("SELECT ?c ?iso WHERE { ?c wdt:P297 ?iso . }", cache, log);
  return new Map(rows.map((r) => [r.c.value.replace(/^.*\//, ""), r.iso.value.toUpperCase()]));
}

/** Instance-of classes and coordinates for many items (used to type knowledge-graph entities). */
export async function classesAndCoordinates(ids: string[], cache: DiskCache, log?: Log): Promise<Map<string, { classes: string[]; lat?: number; lng?: number }>> {
  const result = new Map<string, { classes: string[]; lat?: number; lng?: number }>();
  for (const batch of chunks([...new Set(ids)].filter((x) => /^Q\d+$/.test(x)).sort(), 150)) {
    const query = `SELECT ?item (GROUP_CONCAT(DISTINCT STRAFTER(STR(?class), "entity/"); separator=" ") AS ?classes) (SAMPLE(?coord) AS ?coord) WHERE {
  VALUES ?item { ${batch.map((id) => `wd:${id}`).join(" ")} }
  OPTIONAL { ?item wdt:P31 ?class }
  OPTIONAL { ?item wdt:P625 ?coord }
} GROUP BY ?item`;
    for (const row of await sparql(query, cache, log)) {
      const id = row.item.value.replace(/^.*\//, "");
      const point = row.coord ? /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord.value) : null;
      result.set(id, {
        classes: row.classes?.value ? row.classes.value.split(" ").filter(Boolean) : [],
        lng: point ? Number(point[1]) : undefined,
        lat: point ? Number(point[2]) : undefined,
      });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ Glottolog */

export async function glottologCoordinates(glottocode: string, cache: DiskCache, log?: Log): Promise<{ lat: number; lng: number } | undefined> {
  const hit = cache.get<{ lat: number; lng: number } | null>("glottolog", glottocode);
  if (hit !== undefined) return hit ?? undefined;
  try {
    const data = await withRetry(() => getJson<{ latitude?: number; longitude?: number }>(`https://glottolog.org/resource/languoid/id/${glottocode}.json`), `glottolog ${glottocode}`, log);
    const value = typeof data.latitude === "number" && typeof data.longitude === "number" ? { lat: data.latitude, lng: data.longitude } : null;
    cache.set("glottolog", glottocode, value);
    return value ?? undefined;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      cache.set("glottolog", glottocode, null);
      return undefined;
    }
    throw error;
  }
}
