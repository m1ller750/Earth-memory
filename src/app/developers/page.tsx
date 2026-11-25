import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageHeader, SectionHeading } from "@/components/ui/layout";
import { getI18n } from "@/lib/i18n/server";
import { publicBaseUrl } from "@/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.developers };
}

const ENDPOINTS: Array<[string, string, string]> = [
  ["GET", "/api/v1/search?q=", "Unified search across records, languages, species, ecosystems, entities and places"],
  ["GET", "/api/v1/records", "Search and filter the archive (q, dimension, kind, country, region, verification, origin, from, to, tag, page, limit)"],
  ["POST", "/api/v1/records", "Create a contribution. Scope: contribute. Agents may only publish public, non-sensitive records"],
  ["GET", "/api/v1/records/{slug}", "Full record: sources, media, entities, reviews, labelled AI annotations"],
  ["GET", "/api/v1/records/{slug}/related", "Memory Connection Engine results with evidence and certainty"],
  ["POST", "/api/v1/records/{slug}/reviews", "Submit a review. Scope: verify"],
  ["GET", "/api/v1/languages", "Endangered language profiles (q, status, region)"],
  ["GET", "/api/v1/languages/{slug}", "Language profile, vocabulary, pronunciations, Memory Alert"],
  ["GET", "/api/v1/species", "Threatened species (q, status, region)"],
  ["GET", "/api/v1/ecosystems/{slug}", "Ecosystem with dated, sourced observations"],
  ["GET", "/api/v1/places/{code}", "What the archive holds about a country (ISO alpha-2)"],
  ["GET", "/api/v1/alerts", "Memory Alert indicators with factors (type, region, limit)"],
  ["GET", "/api/v1/graph?node=", "Knowledge-graph neighbourhood (node=entity:silk-road, depth, proposed)"],
  ["GET", "/api/v1/stats", "Live counts split by provenance"],
  ["POST", "/api/v1/ai/chat", "EARTH AI, streamed as newline-delimited JSON"],
  ["POST", "/api/v1/media", "Upload a file (multipart, field 'file')"],
];

const TOOLS: Array<[string, string, string]> = [
  ["search_archive", "read", "Search archive records with filters"],
  ["get_archive_record", "read", "Full record with sources, verification and labelled AI annotations"],
  ["search_languages", "read", "Find language profiles by name, status or region"],
  ["explore_location", "read", "Summarise what the archive holds about a country"],
  ["find_related_records", "read", "Connection Engine results with evidence"],
  ["search_species", "read", "Threatened species by region or IUCN category"],
  ["get_preservation_status", "read", "Memory Alert scores, gaps and recommended actions"],
  ["submit_contribution", "write · contribute", "Create a public, non-sensitive record (starts unverified)"],
  ["verify_record", "write · verify", "Submit a community or expert review"],
];

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-xl border border-white/10 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-mist-100">{children}</pre>;
}

export default async function DevelopersPage() {
  const { t } = await getI18n();
  const base = publicBaseUrl();
  return (
    <Container className="max-w-5xl">
      <PageHeader
        eyebrow={t.nav.developers}
        title="API and MCP"
        lede="Earth Memory exposes the archive to integrators and AI agents through a documented REST API and a Model Context Protocol server. Both go through the same permission checks, validation, rate limits and audit log as the website."
      />

      <section>
        <SectionHeading title="Authentication" />
        <div className="panel space-y-3 p-6 text-sm leading-relaxed text-mist-300">
          <p>Read endpoints are public and only ever return public records. Community-restricted and sacred material is never returned to API keys or agents.</p>
          <p>
            Writes need a signed-in session or an API key: <code className="font-mono text-mist-100">Authorization: Bearer em_…</code>. Create and revoke keys on{" "}
            <Link href="/account#api-keys" className="text-aurora-cyan hover:underline">
              your account page
            </Link>
            . Scopes: <code className="font-mono">read</code>, <code className="font-mono">contribute</code>, <code className="font-mono">verify</code>. Keys are stored only as SHA-256 hashes.
          </p>
          <p>Rate limits per client: 240 API reads per minute, 30 writes per 10 minutes, 20 AI requests per 10 minutes. Exceeding them returns HTTP 429 with Retry-After.</p>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading title="REST endpoints" />
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {ENDPOINTS.map(([method, path, description]) => (
                <tr key={`${method} ${path}`} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-aurora-cyan">{method}</td>
                  <td className="px-4 py-3 font-mono text-xs text-mist-100">{path}</td>
                  <td className="px-4 py-3 text-mist-400">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <Code>{`curl "${base}/api/v1/languages?region=Central%20Asia"

curl -X POST "${base}/api/v1/records" \\
  -H "Authorization: Bearer $EARTH_MEMORY_API_KEY" -H "Content-Type: application/json" \\
  -d '{"title":"…","body":"…","dimension":"cultural","kind":"story","consent":true}'`}</Code>
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading title="MCP server" lede="mcp/server.ts is a stdio Model Context Protocol server. It calls the REST API above, so permissions are enforced in one place. Write tools are only registered when an API key is configured." />
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <tbody>
              {TOOLS.map(([name, access, description]) => (
                <tr key={name} className="border-b border-white/[0.05] last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-mist-100">{name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-mist-400">{access}</td>
                  <td className="px-4 py-3 text-mist-400">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">Claude Code (.mcp.json in this repository)</p>
            <Code>{`{
  "mcpServers": {
    "earth-memory": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "env": { "EARTH_MEMORY_URL": "${base}" }
    }
  }
}`}</Code>
          </div>
          <div>
            <p className="eyebrow mb-2">Synapse library</p>
            <Code>{`synapse mcp add earth-memory \\
  --description "Earth Memory archive tools" \\
  -- npx tsx "<project folder>/mcp/server.ts"
synapse mcp secret earth-memory EARTH_MEMORY_API_KEY
synapse mcp install earth-memory`}</Code>
          </div>
        </div>
      </section>
    </Container>
  );
}
