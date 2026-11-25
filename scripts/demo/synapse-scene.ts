/**
 * Builds the "How Synapse CLI was used" scene: a terminal-style page that types real Synapse
 * commands and shows their real output, captured when the video is made (nothing is staged).
 * Superseded memories are left out; long lines are shortened the way Synapse itself shortens them.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** Full path of the synapse executable (so it can run without a shell). */
function synapseBinary(): string {
  try {
    const found = execFileSync(process.platform === "win32" ? "where" : "which", ["synapse"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    return found.find((f) => /\.exe$/i.test(f)) ?? found[0] ?? "synapse";
  } catch {
    return "synapse";
  }
}

function run(args: string[]): string {
  try {
    return execFileSync(synapseBinary(), args, { encoding: "utf8", timeout: 30_000 }).trim();
  } catch (error) {
    return `synapse ${args.join(" ")} failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`;
  }
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const shorten = (s: string, n = 104) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Replaces this machine's project path with a short form (it carries no meaning for viewers). */
function tidyPath(line: string): string {
  return line
    .replace(/"?[A-Z]:\\\\?(?:[^"\\]+\\\\?)*?Earth memory\\\\?node_modules\\\\?tsx\\\\?dist\\\\?cli\.mjs"?/gi, "tsx")
    .replace(/"?[A-Z]:\\\\?(?:[^"\\]+\\\\?)*?Earth memory\\\\?/gi, "")
    .replace(/\\\\/g, "/")
    .replace(/"/g, "");
}

export function buildSynapseScene(file: string) {
  const version = run(["--version"]);
  const mcp = run(["mcp", "list"])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => tidyPath(l).replace(/\t/g, "   "));
  const memories = run(["memory", "list", "Earth Memory"])
    .split(/\r?\n/)
    .filter((l) => l && !/superseded by/i.test(l))
    .map((l) => {
      const [id, , , text] = l.split("\t");
      return `#${id.padStart(2, " ")}  ${shorten(text ?? l, 96)}`;
    })
    .sort((a, b) => Number(a.slice(1, 3)) - Number(b.slice(1, 3)));

  const blocks: Array<{ cmd: string; out: string[] }> = [
    { cmd: "synapse --version", out: [version] },
    { cmd: "synapse mcp list", out: mcp },
    { cmd: 'synapse memory list "Earth Memory"', out: memories },
  ];

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Synapse CLI · Earth Memory</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: grid; place-items: center; background: radial-gradient(1200px 700px at 30% 20%, #0f2a3a 0%, #07101c 55%, #050a12 100%); font-family: "Cascadia Mono", Consolas, "Courier New", monospace; }
  .wrap { width: 1500px; }
  .title { font-family: Georgia, "Times New Roman", serif; color: #e8f1f8; font-size: 46px; margin: 0 0 6px; }
  .lede { color: #8fb3c6; font-family: Inter, "Segoe UI", sans-serif; font-size: 22px; margin: 0 0 26px; }
  .term { background: rgba(6, 14, 24, 0.92); border: 1px solid rgba(120, 220, 200, 0.18); border-radius: 18px; box-shadow: 0 30px 80px rgba(0,0,0,.55); overflow: hidden; }
  .bar { display: flex; gap: 9px; padding: 14px 18px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.06); }
  .bar i { width: 13px; height: 13px; border-radius: 50%; display: block; background: #2b3a48; }
  .bar span { margin-left: 12px; color: #6f8ba0; font-size: 15px; }
  pre { margin: 0; padding: 26px 30px 34px; min-height: 600px; color: #cfe3ee; font-size: 21px; line-height: 1.55; white-space: pre-wrap; }
  .p { color: #2fd8c4; } .c { color: #f2f7fb; } .o { color: #9ab7c8; } .hi { color: #f5c26b; }
  .cursor { display: inline-block; width: 11px; height: 22px; background: #2fd8c4; vertical-align: -3px; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
</style></head>
<body><div class="wrap">
  <h1 class="title">How Synapse CLI was used</h1>
  <p class="lede">Project memory across sessions and the MCP library, captured from this machine while the video was made.</p>
  <div class="term"><div class="bar"><i></i><i></i><i></i><span>synapse — Earth Memory</span></div><pre id="out"></pre></div>
</div>
<script>
const blocks = ${JSON.stringify(blocks.map((b) => ({ cmd: escape(b.cmd), out: b.out.map(escape) })))};
const out = document.getElementById("out");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function play() {
  for (const b of blocks) {
    out.insertAdjacentHTML("beforeend", '<span class="p">$ </span><span class="c"></span>');
    const cmd = out.lastElementChild;
    for (const ch of b.cmd.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")) { cmd.textContent += ch; await sleep(38); }
    out.insertAdjacentHTML("beforeend", "\\n");
    await sleep(260);
    for (const line of b.out) {
      const html = line.replace(/^(#\\s?\\d+)/, '<span class="hi">$1</span>').replace(/^(earth-memory)/, '<span class="hi">$1</span>');
      out.insertAdjacentHTML("beforeend", '<span class="o">' + html + "</span>\\n");
      await sleep(170);
    }
    out.insertAdjacentHTML("beforeend", "\\n");
    await sleep(500);
  }
  out.insertAdjacentHTML("beforeend", '<span class="p">$ </span><span class="cursor"></span>');
}
window.startScene = play;
</script></body></html>`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf8");
  return blocks;
}

if (process.argv[1]?.endsWith("synapse-scene.ts")) {
  const target = path.resolve("data", "demo", "synapse.html");
  const blocks = buildSynapseScene(target);
  console.info(`Wrote ${target}`);
  for (const b of blocks) console.info(`$ ${b.cmd}\n${b.out.join("\n")}\n`);
}
