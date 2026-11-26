/**
 * Builds the self-contained server for the desktop app:
 *   1. next build with NEXT_OUTPUT=standalone (a server.js with only the files it needs);
 *   2. copies what the standalone output leaves out: static assets, public/ (incl. photos),
 *      database migrations and the world map used for country centroids;
 *   3. renders the app icon from src/app/icon.svg.
 * Then `npm run desktop:pack` wraps it in Electron and makes the Windows installer (dist-desktop/).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

function copy(from: string, to: string) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

/** 512×512 PNG of the site icon, rendered by the installed Chrome (puppeteer-core). */
async function renderIcon(svgFile: string, pngFile: string) {
  const chrome = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", process.env.CHROME_PATH ?? ""].find(
    (p) => p && fs.existsSync(p),
  );
  if (!chrome) {
    if (!fs.existsSync(pngFile)) console.warn("Chrome not found: add desktop/icon.png (512×512) yourself.");
    return;
  }
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 512, height: 512 });
    const svg = fs.readFileSync(svgFile, "utf8");
    await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:512px;height:512px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`);
    await page.screenshot({ path: pngFile as `${string}.png`, omitBackground: true });
    console.info("Rendered desktop/icon.png");
  } finally {
    await browser.close();
  }
}

console.info("Building the standalone server…");
fs.rmSync(standalone, { recursive: true, force: true });
execSync("npx next build", { stdio: "inherit", env: { ...process.env, NEXT_OUTPUT: "standalone" } });
if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("next build did not produce .next/standalone/server.js");

console.info("Copying static assets, photos, migrations and map data…");
copy(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
copy(path.join(root, "public"), path.join(standalone, "public"));
copy(path.join(root, "drizzle"), path.join(standalone, "drizzle"));
copy(path.join(root, "node_modules", "world-atlas", "countries-50m.json"), path.join(standalone, "node_modules", "world-atlas", "countries-50m.json"));
// PGlite loads its WebAssembly and data files from its package folder at runtime.
copy(path.join(root, "node_modules", "@electric-sql", "pglite"), path.join(standalone, "node_modules", "@electric-sql", "pglite"));
// Keep only what the server needs: tracing may copy source files, media and local data. Never ship secrets.
const keep = new Set(["server.js", "package.json", ".next", "node_modules", "public", "drizzle"]);
for (const entry of fs.readdirSync(standalone)) if (!keep.has(entry)) fs.rmSync(path.join(standalone, entry), { recursive: true, force: true });

(async () => {
  await renderIcon(path.join(root, "src", "app", "icon.svg"), path.join(root, "desktop", "icon.png"));

const size = (dir: string): number =>
  fs.readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
console.info(`Standalone server ready: ${(size(standalone) / 1024 / 1024).toFixed(0)} MB`);
})();
