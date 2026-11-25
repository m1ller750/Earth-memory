/**
 * Narration voices for the demo video.
 *
 * - Kokoro (default): an open neural text-to-speech model (82M parameters) run locally through
 *   kokoro-js; natural male voices such as "am_michael". The model (~90 MB) is downloaded from
 *   Hugging Face on first use and cached.
 * - Windows (DEMO_TTS=sapi): the built-in System.Speech voice, as a fallback.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The part of kokoro-js used here (typed locally because the package may be installed outside the project). */
interface KokoroModule {
  KokoroTTS: {
    from_pretrained(model: string, options: { dtype: string; device: string }): Promise<{
      generate(text: string, options: { voice: string; speed: number }): Promise<{ save(file: string): Promise<void> | void }>;
    }>;
  };
}

export interface Voice {
  name: string;
  synthesize(text: string, wav: string): Promise<void>;
}

/** Spoken form of the text: acronyms letter by letter, names the model would otherwise mangle. */
export function spoken(text: string): string {
  return text
    .replace(/\bCLI\b/g, "C L I")
    .replace(/\bMCP\b/g, "M C P")
    .replace(/\bAPI\b/g, "A P I")
    .replace(/\bAI\b/g, "A I")
    .replace(/Göbekli Tepe/g, "Gobekli Tepay")
    .replace(/Okjökull/g, "Ok-yo-kootl")
    .replace(/–/g, " to ");
}

export async function createVoice(): Promise<Voice> {
  const engine = process.env.DEMO_TTS ?? "kokoro";
  if (engine === "kokoro") {
    try {
      // kokoro-js may live in the project or in data/demo/kokoro-env (installed separately on slow networks).
      const local = path.resolve("data", "demo", "kokoro-env", "node_modules", "kokoro-js", "dist", "kokoro.js");
      const { KokoroTTS } = (await import(fs.existsSync(local) ? pathToFileURL(local).href : "kokoro-js")) as KokoroModule;
      const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
      const voice = process.env.DEMO_VOICE ?? "am_michael";
      const speed = Number(process.env.DEMO_SPEED ?? 1.05);
      return {
        name: `Kokoro ${voice} x${speed}`,
        synthesize: async (text, wav) => {
          const audio = await tts.generate(spoken(text), { voice, speed });
          await audio.save(wav);
        },
      };
    } catch (error) {
      console.warn(`Kokoro is not available (${error instanceof Error ? error.message.split("\n")[0] : error}); using the Windows voice.`);
    }
  }
  return windowsVoice();
}

function windowsVoice(): Voice {
  const name = process.env.DEMO_SAPI_VOICE ?? "Microsoft Zira Desktop";
  return {
    name: `Windows ${name}`,
    synthesize: async (text, wav) => {
      const textFile = `${wav}.txt`;
      fs.writeFileSync(textFile, spoken(text), "utf8");
      const q = (s: string) => s.replace(/'/g, "''");
      const ps = [
        "Add-Type -AssemblyName System.Speech",
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
        `$s.SelectVoice('${q(name)}')`,
        `$s.SetOutputToWaveFile('${q(wav)}')`,
        `$s.Speak([IO.File]::ReadAllText('${q(textFile)}', [Text.Encoding]::UTF8))`,
        "$s.Dispose()",
      ].join("; ");
      execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], { stdio: "inherit" });
    },
  };
}
