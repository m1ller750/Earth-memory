/**
 * End-to-end check of the MCP server: spawns it over stdio with the official SDK client,
 * lists its tools and calls the read tools against a running Earth Memory server.
 * Usage: npm run mcp:check   (EARTH_MEMORY_URL defaults to http://localhost:3000)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", "mcp/server.ts"],
    env: { ...process.env, EARTH_MEMORY_URL: process.env.EARTH_MEMORY_URL ?? "http://localhost:3000" } as Record<string, string>,
    stderr: "pipe",
  });
  const client = new Client({ name: "earth-memory-check", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.info(`Tools (${tools.length}): ${tools.map((t) => t.name).join(", ")}`);

  const calls: Array<[string, Record<string, unknown>]> = [
    ["search_archive", { query: "silk road", limit: 3 }],
    ["get_archive_record", { slug: "ancient-merv" }],
    ["search_languages", { region: "Central Asia" }],
    ["explore_location", { country: "Uzbekistan" }],
    ["find_related_records", { slug: "moynaq-former-fishing-port" }],
    ["search_species", { region: "Central Asia", status: "CR" }],
    ["get_preservation_status", { type: "language", limit: 3 }],
  ];
  let failures = 0;
  for (const [name, args] of calls) {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    const ok = !result.isError && text.length > 2;
    if (!ok) failures++;
    console.info(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(24)} ${text.replace(/\s+/g, " ").slice(0, 110)}…`);
  }
  // Write tools must not exist without an API key.
  const writeToolsPresent = tools.some((t) => t.name === "submit_contribution" || t.name === "verify_record");
  if (!process.env.EARTH_MEMORY_API_KEY && writeToolsPresent) {
    failures++;
    console.info("FAIL  write tools are registered without an API key");
  } else {
    console.info(`PASS  write tools ${writeToolsPresent ? "registered (API key set)" : "not registered without an API key"}`);
  }
  await client.close();
  console.info(failures ? `${failures} failure(s)` : "MCP server OK");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
