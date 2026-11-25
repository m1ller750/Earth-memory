/**
 * Finds freely licensed photos (Wikimedia Commons) for archive records, species and ecosystems,
 * stores them in public/photos/<type>/<slug>.jpg (960 px wide JPEG, made with FFmpeg) and writes
 * their credits to src/lib/db/seed/images.json. Languages and fictional demo records get no photo.
 * Photos are served by the app itself, so pages do not depend on Wikimedia hosts being reachable.
 * Apply to an existing database with `npm run db:import` (the seed applies them automatically).
 *
 *   npm run images              (add --refresh to ignore cached lookups)
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const USER_AGENT = "EarthMemoryImporter/0.2 (heritage archive prototype; Node.js)";
const PHOTO_WIDTH = 960;

function ffmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  const packages = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(packages)) {
    for (const dir of fs.readdirSync(packages).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      for (const sub of fs.readdirSync(path.join(packages, dir))) {
        const candidate = path.join(packages, dir, sub, "bin", "ffmpeg.exe");
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8" });
  const found = which.stdout?.split(/\r?\n/).find(Boolean);
  if (found) return found;
  throw new Error("FFmpeg is needed to resize photos; set FFMPEG_PATH");
}

async function download(url: string, file: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
    if (response.ok) {
      fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (attempt >= 5 || (response.status !== 429 && response.status < 500)) throw new Error(`${response.status} for ${url}`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
}

async function main() {
  const { findImages, thumbnailUrl, CURATED_ARTICLES, NO_PHOTO, articleFromUrl } = await import("../src/lib/ingest/images");
  const { DiskCache } = await import("../src/lib/ingest/sources");
  const { RECORDS } = await import("../src/lib/db/seed/records");
  const { SPECIES, ECOSYSTEMS } = await import("../src/lib/db/seed/living-earth");
  const { IMPORTED } = await import("../src/lib/db/seed/imported");

  const wiki = (sources: Array<{ url?: string }>) => sources.map((s) => articleFromUrl(s.url)).find(Boolean);
  const subjects: Array<{ key: string; article?: string }> = [
    ...RECORDS.filter((r) => r.origin !== "demo").map((r) => ({ key: `record:${r.slug}`, article: CURATED_ARTICLES[`record:${r.slug}`] })),
    ...SPECIES.map((s) => ({ key: `species:${s.slug}`, article: CURATED_ARTICLES[`species:${s.slug}`] })),
    ...ECOSYSTEMS.map((e) => ({ key: `ecosystem:${e.slug}`, article: CURATED_ARTICLES[`ecosystem:${e.slug}`] })),
    ...IMPORTED.records.map((r) => ({ key: `record:${r.slug}`, article: wiki(r.sources) })),
    ...IMPORTED.species.map((s) => ({ key: `species:${s.slug}`, article: wiki(s.sources) })),
    ...IMPORTED.ecosystems.map((e) => ({ key: `ecosystem:${e.slug}`, article: wiki(e.sources) })),
  ];
  const withArticle = subjects.filter((s): s is { key: string; article: string } => Boolean(s.article) && !NO_PHOTO[s.key]);
  const cache = new DiskCache(path.resolve(process.env.DATA_DIR ?? "data", "ingest", "cache"), process.argv.includes("--refresh"));
  console.info(`Looking up lead images for ${withArticle.length} articles…`);
  const found = await findImages(
    withArticle.map((s) => s.article),
    cache,
    (m) => console.info(m),
  );

  const ffmpeg = ffmpegPath();
  const publicDir = path.join(process.cwd(), "public", "photos");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "earth-memory-photos-"));
  const images: Record<string, unknown> = {};
  const missing: string[] = [];
  let downloaded = 0;
  for (const s of withArticle) {
    const image = found.get(s.article);
    const source = image ? thumbnailUrl(image) : null;
    if (!image || !source) {
      missing.push(`${s.key} (${s.article})`);
      continue;
    }
    const [type, slug] = s.key.split(":");
    const relative = `photos/${type}/${slug}.jpg`;
    const target = path.join(publicDir, type, `${slug}.jpg`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!fs.existsSync(target) || process.argv.includes("--refresh")) {
      try {
        const raw = path.join(tmp, `${type}-${slug}${path.extname(new URL(source).pathname) || ".img"}`);
        await download(source, raw);
        // White background for transparent PNGs, 960 px wide, good-quality JPEG without metadata.
        execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", raw, "-vf", `scale='min(${PHOTO_WIDTH},iw)':-2:flags=lanczos,format=yuvj420p`, "-q:v", "4", "-map_metadata", "-1", target]);
        downloaded++;
      } catch (error) {
        missing.push(`${s.key} (download failed: ${error instanceof Error ? error.message.slice(0, 80) : error})`);
        continue;
      }
    }
    const probe = execFileSync(ffmpeg.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe")), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", target], { encoding: "utf8" }).trim();
    const [width, height] = probe.split(",").map(Number);
    images[s.key] = { ...image, url: `/${relative}`, width, height };
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  const target = path.join(process.cwd(), "src", "lib", "db", "seed", "images.json");
  fs.writeFileSync(target, `${JSON.stringify(images, null, 2)}\n`);
  const count = (prefix: string) => Object.keys(images).filter((k) => k.startsWith(prefix)).length;
  console.info(`Downloaded ${downloaded} new photos into public/photos.`);
  console.info(`Wrote ${path.relative(process.cwd(), target)}: ${count("record:")} records, ${count("species:")} species, ${count("ecosystem:")} ecosystems.`);
  console.info(`No free photograph for ${missing.length}: ${missing.join("; ")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
