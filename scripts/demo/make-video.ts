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

const FFMPEG = findBinary("ffmpeg", "FFMPEG_PATH", wingetFfmpeg());
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace("ffmpeg", "ffprobe"));
const CHROME = findBinary("chrome", "CHROME_PATH", [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
]);

const ffmpeg = (args: string[]) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const duration = (file: string) => Number(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim());

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

function wrap(line: string): string {
  const middle = line.length / 2;
  let best = -1;
  for (let i = 0; i < line.length; i++) if (line[i] === " " && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  return best > 0 ? `${line.slice(0, best)}\n${line.slice(best + 1)}` : line;
}

/* ------------------------------------------------------------------ footage */

export async function smoothScroll(page: Page, pixels: number, ms: number) {
  await page.evaluate(
    (px, duration) =>
      new Promise<void>((resolve) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const step = (now: number) => {
          const k = Math.min(1, (now - t0) / duration);
          const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          window.scrollTo(0, start + px * ease);
          if (k < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    pixels,
    ms,
  );
}

async function recordScene(page: Page, scene: Scene, seconds: number, file: string) {
  await page.goto(`${BASE}${scene.path}`, { waitUntil: "networkidle2", timeout: 120_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (scene.prepare) await scene.prepare(page);
  await new Promise((r) => setTimeout(r, scene.settleMs ?? 1500));
  const recorder = await page.screencast({ path: file as `${string}.webm`, ffmpegPath: FFMPEG });
  const started = Date.now();
  await scene.play(page, seconds * 1000);
  const left = seconds * 1000 - (Date.now() - started);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  await new Promise((r) => setTimeout(r, 400));
  await recorder.stop();
}

/* ------------------------------------------------------------------ main */

async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const scenes = only ? SCENES.filter((s) => s.id === only) : SCENES;

  console.info(`Narrating ${scenes.length} scenes with ${VOICE}…`);
  const timings: Array<{ scene: Scene; wav: string; seconds: number }> = [];
  for (const scene of scenes) {
    const wav = path.join(WORK, `${scene.id}.wav`);
    speak(scene.narration, wav);
    timings.push({ scene, wav, seconds: duration(wav) + (scene.tailSeconds ?? 0.8) });
  }

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
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }]);
    for (const t of timings) {
      console.info(`  ${t.scene.id} (${t.seconds.toFixed(1)} s)`);
      await recordScene(page, t.scene, t.seconds, path.join(WORK, `${t.scene.id}.webm`));
    }
  } finally {
    await browser.close();
  }

  console.info("Assembling…");
  const segments: string[] = [];
  const srt: string[] = [];
  let clock = 0;
  let index = 1;
  for (const t of timings) {
    const segment = path.join(WORK, `${t.scene.id}.mp4`);
    ffmpeg([
      "-i", path.join(WORK, `${t.scene.id}.webm`),
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
  const style = "FontName=Arial,FontSize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BackColour=&H90101010,BorderStyle=4,Outline=0,Shadow=0,MarginV=28,MarginL=60,MarginR=60";
  execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-i", "joined.mp4", "-vf", `subtitles=subs.srt:force_style='${style}'`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", path.join(OUT, `${name}.mp4`)], { cwd: WORK, stdio: ["ignore", "inherit", "inherit"] });
  console.info(`Done: ${path.relative(process.cwd(), path.join(OUT, `${name}.mp4`))} (${clock.toFixed(0)} s) and ${path.relative(process.cwd(), srtFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
