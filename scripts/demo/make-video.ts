/**
 * Records a narrated demo video of the running app (npm run demo:video; run a production server first:
 * npm run build && npm start).
 *
 * 1. Narration: each subtitle line is spoken separately by a neural voice (Kokoro, see voice.ts), so
 *    subtitles match the voice exactly; lines are joined with short pauses.
 * 2. Footage: Chrome (puppeteer-core, headless) plays each scene at 1920×1080 for as long as its
 *    narration, recorded as high-quality JPEG frames from Chrome's screencast.
 * 3. Assembly: FFmpeg encodes each scene (x264, CRF 17) with short fades, joins them, normalises the
 *    voice to −16 LUFS and burns in the subtitles; an .srt file is written as well.
 *
 * Output: demo/earth-memory-demo.mp4 and demo/earth-memory-demo.srt (git-ignored).
 * Options: --stage=narrate|record|assemble (default: all), --only=<scene id>.
 * Env: DEMO_BASE_URL (default http://localhost:3000), DEMO_TTS (kokoro|sapi), DEMO_VOICE (default
 *      am_michael), CHROME_PATH, FFMPEG_PATH (found automatically when installed with winget).
 */
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { SCENES, SYNAPSE_SCENE_FILE, type Scene } from "./scenes";
import { buildSynapseScene } from "./synapse-scene";
import { createVoice, type Voice } from "./voice";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const WORK = path.resolve("data", "demo", "video");
const OUT = path.resolve("demo");
const WIDTH = 1920;
const HEIGHT = 1080;
/** Silence before a scene's first line, and between lines. */
const LEAD_IN = 0.35;
const GAP = 0.3;
const FADE = 0.35;
const BACKGROUND = "0x07101c";

function findBinary(name: string, envVar: string, candidates: string[]): string {
  const fromEnv = process.env[envVar];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  const which = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  const first = which.stdout?.split(/\r?\n/).find(Boolean);
  if (first && fs.existsSync(first)) return first;
  throw new Error(`${name} not found; set ${envVar}`);
}

function wingetFfmpeg(): string[] {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet");
  const out = [path.join(root, "Links", "ffmpeg.exe")];
  const packages = path.join(root, "Packages");
  if (fs.existsSync(packages)) {
    for (const dir of fs.readdirSync(packages).filter((d) => d.startsWith("Gyan.FFmpeg"))) {
      for (const sub of fs.readdirSync(path.join(packages, dir))) out.push(path.join(packages, dir, sub, "bin", "ffmpeg.exe"));
    }
  }
  return out;
}

let ffmpegPath: string | null = null;
/** Resolved only when needed, so other stages work before FFmpeg is installed. */
const FFMPEG = () => (ffmpegPath ??= findBinary("ffmpeg", "FFMPEG_PATH", wingetFfmpeg()));
const CHROME = () =>
  findBinary("chrome", "CHROME_PATH", [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ]);

const ffmpeg = (args: string[], cwd?: string) => execFileSync(FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"], cwd });

/** Length of a WAV file in seconds, read from its header. */
function wavSeconds(file: string): number {
  const buffer = fs.readFileSync(file);
  const byteRate = buffer.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") return Math.min(size, buffer.length - offset - 8) / byteRate;
    offset += 8 + size + (size % 2);
  }
  return (buffer.length - 44) / byteRate;
}

/* ------------------------------------------------------------------ subtitles */

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/** Splits a long sentence at a comma (nearest the middle first) where both halves fit on screen. */
function splitAtComma(sentence: string): [string, string] | null {
  const commas: number[] = [];
  for (let i = 0; i < sentence.length; i++) if (sentence[i] === "," || sentence[i] === ":") commas.push(i);
  commas.sort((x, y) => Math.abs(x - sentence.length / 2) - Math.abs(y - sentence.length / 2));
  for (const i of commas) {
    const [a, b] = [sentence.slice(0, i + 1).trim(), sentence.slice(i + 1).trim()];
    if (a.length <= 84 && b.length <= 84 && a.length > 15 && b.length > 15) return [a, b];
  }
  return null;
}

/** Subtitle lines of at most ~84 characters: sentences, split at a comma or a word when too long. */
export function subtitleLines(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["”’]?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const parts: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= 84) parts.push(sentence);
    else if (splitAtComma(sentence)) parts.push(...splitAtComma(sentence)!);
    else {
      let line = "";
      for (const w of sentence.split(" ")) {
        if ((line + " " + w).trim().length > 80 && line.length > 30) {
          parts.push(line.trim());
          line = w;
        } else line = `${line} ${w}`;
      }
      if (line.trim()) parts.push(line.trim());
    }
  }
  return parts;
}

/** Two balanced lines for long subtitles. */
function wrap(line: string): string {
  if (line.length <= 42) return line;
  const middle = line.length / 2;
  let best = -1;
  for (let i = 0; i < line.length; i++) if (line[i] === " " && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  return best > 0 ? `${line.slice(0, best)}\n${line.slice(best + 1)}` : line;
}

/* ------------------------------------------------------------------ narration */

interface Narration {
  scene: Scene;
  wav: string;
  seconds: number;
  cues: Array<{ from: number; to: number; text: string }>;
}

async function narrate(voice: Voice, scene: Scene): Promise<Narration> {
  const dir = path.join(WORK, `${scene.id}-audio`);
  fs.mkdirSync(dir, { recursive: true });
  const lines = subtitleLines(scene.narration);
  const cues: Narration["cues"] = [];
  const files: string[] = [];
  let t = LEAD_IN;
  for (const [i, line] of lines.entries()) {
    const key = crypto.createHash("sha1").update(`${voice.name}|${line}`).digest("hex").slice(0, 12);
    const wav = path.join(dir, `${String(i).padStart(2, "0")}-${key}.wav`);
    if (!fs.existsSync(wav)) await voice.synthesize(line, wav);
    const d = wavSeconds(wav);
    cues.push({ from: t, to: t + d, text: line });
    files.push(wav);
    t += d + GAP;
  }
  const speechEnd = t - GAP;
  const seconds = speechEnd + (scene.tailSeconds ?? 0.8);
  // One track per scene: lead-in silence, the lines with pauses, padded to the scene length.
  const sceneWav = path.join(WORK, `${scene.id}.wav`);
  const filters = files.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono${i < files.length - 1 ? `,apad=pad_dur=${GAP}` : ""}[a${i}]`);
  const concat = `${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1,adelay=${Math.round(LEAD_IN * 1000)},apad=whole_dur=${seconds.toFixed(3)}[out]`;
  ffmpeg([...files.flatMap((f) => ["-i", f]), "-filter_complex", [...filters, concat].join(";"), "-map", "[out]", "-ar", "48000", "-ac", "1", sceneWav]);
  fs.writeFileSync(path.join(WORK, `${scene.id}.cues.json`), JSON.stringify({ seconds, cues }, null, 2));
  return { scene, wav: sceneWav, seconds, cues };
}

function loadNarration(scene: Scene): Narration {
  const { seconds, cues } = JSON.parse(fs.readFileSync(path.join(WORK, `${scene.id}.cues.json`), "utf8")) as Pick<Narration, "seconds" | "cues">;
  return { scene, wav: path.join(WORK, `${scene.id}.wav`), seconds, cues };
}

/* ------------------------------------------------------------------ footage */

/**
 * Records a scene as timestamped JPEG frames from Chrome's screencast (DevTools protocol) and writes
 * an FFmpeg concat list with each frame's real duration.
 */
async function recordScene(page: Page, scene: Scene, seconds: number, dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const url = /^(?:file|https?):/.test(scene.path) ? scene.path : `${BASE}${scene.path}`;
  // "load" rather than network idle: pages keep long-lived connections (streaming, dev hot reload).
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (scene.prepare) await scene.prepare(page);
  await new Promise((r) => setTimeout(r, scene.settleMs ?? 1500));

  const session = await page.createCDPSession();
  const frames: Array<{ file: string; t: number }> = [];
  session.on("Page.screencastFrame", (event: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    const file = `f${String(frames.length).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(event.data, "base64"));
    frames.push({ file, t: event.metadata.timestamp ?? Date.now() / 1000 });
    session.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  });
  const started = Date.now() / 1000;
  await session.send("Page.startScreencast", { format: "jpeg", quality: 95, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  const t0 = Date.now();
  await scene.play(page, seconds * 1000);
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  await new Promise((r) => setTimeout(r, 300));
  await session.send("Page.stopScreencast");
  await session.detach();
  if (frames.length === 0) throw new Error(`No frames captured for ${scene.id}`);

  const lines: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const start = i === 0 ? Math.min(started, frames[0].t) : frames[i].t;
    const end = i + 1 < frames.length ? frames[i + 1].t : start + Math.max(0.1, seconds - (start - started));
    lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, end - start).toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(path.join(dir, "frames.txt"), lines.join("\n"));
  return frames.length;
}

async function record(narrations: Narration[]) {
  buildSynapseScene(SYNAPSE_SCENE_FILE);
  const chrome = CHROME();
  console.info(`Recording with ${path.basename(chrome)} at ${WIDTH}×${HEIGHT}…`);
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    defaultViewport: { width: WIDTH, height: HEIGHT },
    args: [`--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--allow-file-access-from-files"],
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "earth-memory-demo-")),
  });
  try {
    const page = await browser.newPage();
    // tsx (esbuild keepNames) wraps functions in __name(); define it so page.evaluate callbacks run in the page.
    await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn;");
    for (const n of narrations) {
      const frames = await recordScene(page, n.scene, n.seconds, path.join(WORK, n.scene.id));
      console.info(`  ${n.scene.id}: ${n.seconds.toFixed(1)} s, ${frames} frames`);
    }
  } finally {
    await browser.close();
  }
}

/* ------------------------------------------------------------------ assembly */

function assemble(narrations: Narration[], only: string | undefined) {
  console.info("Assembling…");
  const segments: string[] = [];
  const srt: string[] = [];
  let clock = 0;
  let index = 1;
  for (const n of narrations) {
    const segment = path.join(WORK, `${n.scene.id}.mp4`);
    const d = n.seconds.toFixed(3);
    ffmpeg([
      "-f", "concat", "-safe", "0", "-i", path.join(WORK, n.scene.id, "frames.txt"),
      "-i", n.wav,
      "-filter_complex",
      `[0:v]scale=${WIDTH}:${HEIGHT}:flags=lanczos:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${BACKGROUND},` +
        `fps=30,tpad=stop_mode=clone:stop_duration=5,trim=duration=${d},setpts=PTS-STARTPTS,` +
        `fade=t=in:st=0:d=${FADE}:color=${BACKGROUND},fade=t=out:st=${(n.seconds - FADE).toFixed(3)}:d=${FADE}:color=${BACKGROUND},format=yuv420p[v];` +
        `[1:a]aresample=48000,apad=whole_dur=${d},atrim=duration=${d}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-g", "60",
      "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2",
      "-t", d,
      segment.replace(/\.mp4$/, ".mkv"),
    ]);
    segments.push(segment.replace(/\.mp4$/, ".mkv"));
    for (const c of n.cues) srt.push(`${index++}\n${srtTime(clock + c.from)} --> ${srtTime(clock + c.to)}\n${wrap(c.text)}\n`);
    clock += n.seconds;
  }
  const list = path.join(WORK, "segments.txt");
  fs.writeFileSync(list, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  const joined = path.join(WORK, "joined.mkv");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);

  const name = only ? `earth-memory-demo-${only}` : "earth-memory-demo";
  const srtFile = path.join(OUT, `${name}.srt`);
  fs.writeFileSync(srtFile, srt.join("\n"), "utf8");
  fs.copyFileSync(srtFile, path.join(WORK, "subs.srt"));
  // Subtitles in a 40%-transparent box; the subtitles filter needs a relative path on Windows.
  const style = "FontName=Segoe UI,Bold=0,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BorderStyle=3,Outline=6,Shadow=0,MarginV=30,MarginL=60,MarginR=60";
  ffmpeg(
    [
      "-i", "joined.mkv",
      "-vf", `subtitles=subs.srt:force_style='${style}'`,
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-movflags", "+faststart",
      path.join(OUT, `${name}.mp4`),
    ],
    WORK,
  );
  console.info(`Done: ${path.relative(process.cwd(), path.join(OUT, `${name}.mp4`))} (${clock.toFixed(1)} s) and ${path.relative(process.cwd(), srtFile)}`);
}

/* ------------------------------------------------------------------ main */

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "all";
  const scenes = only ? SCENES.filter((s) => s.id === only) : SCENES;

  let narrations: Narration[];
  if (stage === "all" || stage === "narrate") {
    const voice = await createVoice();
    console.info(`Narrating ${scenes.length} scenes with ${voice.name}…`);
    narrations = [];
    for (const scene of scenes) {
      const n = await narrate(voice, scene);
      console.info(`  ${scene.id}: ${n.seconds.toFixed(1)} s, ${n.cues.length} lines`);
      narrations.push(n);
    }
    console.info(`Total length: ${narrations.reduce((s, n) => s + n.seconds, 0).toFixed(1)} s`);
  } else narrations = scenes.map(loadNarration);

  if (stage === "all" || stage === "record") await record(narrations);
  if (stage === "all" || stage === "assemble") assemble(narrations, only);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
