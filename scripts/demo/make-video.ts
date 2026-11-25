/**
 * Records a narrated demo video of the running app (npm run demo:video; the dev server must be up).
 *
 * 1. Narration: each scene's text is spoken by the Windows text-to-speech voice (System.Speech).
 * 2. Footage: Chrome (via puppeteer-core) plays each scene at 1920×1080 while the screen is recorded,
 *    for exactly as long as its narration.
 * 3. Assembly: FFmpeg joins scenes and audio, burns in subtitles and also writes an .srt file.
 *
 * Output: demo/earth-memory-demo.mp4 and demo/earth-memory-demo.srt (git-ignored).
 * Env: DEMO_BASE_URL (default http://localhost:3000), DEMO_VOICE (default "Microsoft Zira Desktop"),
 *      CHROME_PATH, FFMPEG_PATH (found automatically when installed with winget).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { SCENES, type Scene } from "./scenes";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const VOICE = process.env.DEMO_VOICE ?? "Microsoft Zira Desktop";
const WORK = path.resolve("data", "demo", "video");
const OUT = path.resolve("demo");
const WIDTH = 1920;
const HEIGHT = 1080;

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
/** Resolved only when assembling, so recording works before FFmpeg is installed. */
const FFMPEG = () => (ffmpegPath ??= findBinary("ffmpeg", "FFMPEG_PATH", wingetFfmpeg()));
const CHROME = findBinary("chrome", "CHROME_PATH", [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
]);

const ffmpeg = (args: string[]) => execFileSync(FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });

/* ------------------------------------------------------------------ narration */

function speak(text: string, wav: string) {
  if (process.platform !== "win32") throw new Error("Narration uses Windows text-to-speech (System.Speech).");
  const textFile = `${wav}.txt`;
  fs.writeFileSync(textFile, text, "utf8");
  const ps = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    `$s.SelectVoice('${VOICE.replace(/'/g, "''")}')`,
    "$s.Rate = 0",
    `$s.SetOutputToWaveFile('${wav.replace(/'/g, "''")}')`,
    `$s.Speak([IO.File]::ReadAllText('${textFile.replace(/'/g, "''")}', [Text.Encoding]::UTF8))`,
    "$s.Dispose()",
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
}

/* ------------------------------------------------------------------ subtitles */

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

/** Splits narration into subtitle cues of at most ~80 characters, timed by length within the scene. */
function cues(text: string, start: number, length: number): Array<{ from: number; to: number; text: string }> {
  const sentences = text.match(/[^.!?]+[.!?]+["”’]?|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const parts: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length <= 84) parts.push(sentence);
    else if (splitAtComma(sentence)) parts.push(...splitAtComma(sentence)!);
    else {
      // Break long sentences at a comma or near the middle word.
      const words = sentence.split(" ");
      let line = "";
      for (const w of words) {
        if ((line + " " + w).trim().length > 80 && line.length > 30) {
          parts.push(line.trim());
          line = w;
        } else line = `${line} ${w}`;
      }
      if (line.trim()) parts.push(line.trim());
    }
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = start;
  return parts.map((p) => {
    const d = (p.length / total) * length;
    const cue = { from: t, to: t + d - 0.05, text: p.length > 42 ? wrap(p) : p };
    t += d;
    return cue;
  });
}

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

function wrap(line: string): string {
  const middle = line.length / 2;
  let best = -1;
  for (let i = 0; i < line.length; i++) if (line[i] === " " && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  return best > 0 ? `${line.slice(0, best)}\n${line.slice(best + 1)}` : line;
}

/* ------------------------------------------------------------------ footage */

/**
 * Records a scene as timestamped JPEG frames from Chrome's screencast (DevTools protocol) and writes
 * an FFmpeg concat list with each frame's real duration, so recording does not depend on FFmpeg.
 */
async function recordScene(page: Page, scene: Scene, seconds: number, dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // "load" rather than network idle: pages keep long-lived connections (streaming, dev hot reload).
  await page.goto(`${BASE}${scene.path}`, { waitUntil: "load", timeout: 120_000 });
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
  await session.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1 });
  const t0 = Date.now();
  await scene.play(page, seconds * 1000);
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  await new Promise((r) => setTimeout(r, 300));
  await session.send("Page.stopScreencast");
  await session.detach();
  if (frames.length === 0) throw new Error(`No frames captured for ${scene.id}`);

  // Frame durations from Chrome's timestamps; the first frame covers the time before it arrived.
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

/* ------------------------------------------------------------------ main */

/** Length of a PCM WAV file in seconds (read from its header; no FFmpeg needed). */
function wavSeconds(file: string): number {
  const buffer = fs.readFileSync(file);
  const byteRate = buffer.readUInt32LE(28);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "data") return size / byteRate;
    offset += 8 + size + (size % 2);
  }
  return (buffer.length - 44) / byteRate;
}

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "all";
  const scenes = only ? SCENES.filter((s) => s.id === only) : SCENES;

  const timings: Array<{ scene: Scene; wav: string; seconds: number }> = [];
  if (stage !== "assemble") console.info(`Narrating ${scenes.length} scenes with ${VOICE}…`);
  for (const scene of scenes) {
    const wav = path.join(WORK, `${scene.id}.wav`);
    if (stage !== "assemble" || !fs.existsSync(wav)) speak(scene.narration, wav);
    timings.push({ scene, wav, seconds: wavSeconds(wav) + (scene.tailSeconds ?? 0.8) });
  }

  if (stage !== "assemble") await record(timings);
  if (stage !== "record") assemble(timings, only);
}

async function record(timings: Array<{ scene: Scene; wav: string; seconds: number }>) {
  console.info(`Recording with ${path.basename(CHROME)} at ${WIDTH}×${HEIGHT}…`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    defaultViewport: { width: WIDTH, height: HEIGHT },
    args: [`--window-size=${WIDTH},${HEIGHT}`, "--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), "earth-memory-demo-")),
  });
  try {
    const page = await browser.newPage();
    // tsx (esbuild keepNames) wraps functions in __name(); define it so page.evaluate callbacks run in the page.
    await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn;");
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
    for (const t of timings) {
      const frames = await recordScene(page, t.scene, t.seconds, path.join(WORK, t.scene.id));
      console.info(`  ${t.scene.id}: ${t.seconds.toFixed(1)} s, ${frames} frames`);
    }
  } finally {
    await browser.close();
  }
}

function assemble(timings: Array<{ scene: Scene; wav: string; seconds: number }>, only: string | undefined) {
  console.info("Assembling…");
  const segments: string[] = [];
  const srt: string[] = [];
  let clock = 0;
  let index = 1;
  for (const t of timings) {
    const segment = path.join(WORK, `${t.scene.id}.mp4`);
    ffmpeg([
      "-f", "concat", "-safe", "0", "-i", path.join(WORK, t.scene.id, "frames.txt"),
      "-i", t.wav,
      "-filter_complex",
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x07101c,fps=30,tpad=stop_mode=clone:stop_duration=5,trim=duration=${t.seconds.toFixed(3)},format=yuv420p[v];` +
        `[1:a]aresample=48000,apad=whole_dur=${t.seconds.toFixed(3)}[a]`,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ac", "2",
      "-t", t.seconds.toFixed(3),
      segment,
    ]);
    segments.push(segment);
    const speech = t.seconds - (t.scene.tailSeconds ?? 0.8);
    for (const c of cues(t.scene.narration, clock + 0.15, speech)) srt.push(`${index++}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`);
    clock += t.seconds;
  }
  const list = path.join(WORK, "segments.txt");
  fs.writeFileSync(list, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"));
  const joined = path.join(WORK, "joined.mp4");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);

  const name = only ? `earth-memory-demo-${only}` : "earth-memory-demo";
  const srtFile = path.join(OUT, `${name}.srt`);
  fs.writeFileSync(srtFile, srt.join("\n"), "utf8");
  // Burn the subtitles in (the subtitles filter needs a relative path without a drive colon on Windows).
  fs.copyFileSync(srtFile, path.join(WORK, "subs.srt"));
  // BorderStyle=3 draws an opaque box in OutlineColour (here 40% transparent black) behind each line.
  const style = "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BorderStyle=3,Outline=6,Shadow=0,MarginV=30,MarginL=60,MarginR=60";
  execFileSync(FFMPEG(), ["-hide_banner", "-loglevel", "error", "-y", "-i", "joined.mp4", "-vf", `subtitles=subs.srt:force_style='${style}'`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", path.join(OUT, `${name}.mp4`)], { cwd: WORK, stdio: ["ignore", "inherit", "inherit"] });
  console.info(`Done: ${path.relative(process.cwd(), path.join(OUT, `${name}.mp4`))} (${clock.toFixed(0)} s) and ${path.relative(process.cwd(), srtFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
