/** Scenes of the narrated demo video (see make-video.ts). Each scene plays for as long as its narration. */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "puppeteer-core";

export interface Scene {
  id: string;
  /** Path on the app, or an absolute file:// URL for generated pages. */
  path: string;
  narration: string;
  /** Extra seconds after the narration ends (lets an answer finish streaming, or a shot breathe). */
  tailSeconds?: number;
  settleMs?: number;
  prepare?: (page: Page) => Promise<void>;
  play: (page: Page, ms: number) => Promise<void>;
}

export const SYNAPSE_SCENE_FILE = path.resolve("data", "demo", "synapse.html");

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Eased page scroll by `pixels` over `ms`. */
async function scroll(page: Page, pixels: number, ms: number) {
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

/** Scrolls so that the element containing `text` sits near the top of the screen. */
async function scrollToText(page: Page, text: string, ms: number, offset = 140) {
  // Case-insensitive: headings are often upper-cased by CSS only.
  const y = await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.toLowerCase().includes(needle.toLowerCase())) return (node.parentElement?.getBoundingClientRect().top ?? 0) + window.scrollY;
    }
    return null;
  }, text);
  if (y == null) return;
  const current = await page.evaluate(() => window.scrollY);
  await scroll(page, y - offset - current, ms);
}

/** Waits until every photo in view has loaded (so cards never appear empty). */
async function photosLoaded(page: Page) {
  await page
    .waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight * 2).every((i) => i.complete), { timeout: 20_000 })
    .catch(() => {});
}

/** Drags the globe slowly sideways so it turns. */
async function dragGlobe(page: Page, ms: number, dx: number) {
  const box = await (await page.$("canvas"))?.boundingBox();
  if (!box) return;
  const x = box.x + box.width * 0.62;
  const y = box.y + box.height * 0.5;
  const steps = 90;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x + (dx * i) / steps, y + Math.sin((i / steps) * Math.PI) * 25);
    await wait(ms / steps);
  }
  await page.mouse.up();
}

export const SCENES: Scene[] = [
  {
    id: "01-intro",
    path: "/",
    narration:
      "This is Earth Memory, a living archive of humanity and planet Earth: languages, traditions, places, species and science, preserved before they disappear.",
    settleMs: 4500,
    play: async (page, ms) => {
      await wait(ms * 0.4);
      await scroll(page, 900, ms * 0.5);
    },
  },
  {
    id: "02-globe",
    path: "/explore",
    narration:
      "Every memory has a place on the globe: archive records, endangered languages, threatened species and changing ecosystems. Nearly four hundred points, each one backed by a cited source.",
    settleMs: 9000,
    prepare: async (page) => {
      await page.waitForSelector("canvas", { timeout: 60_000 });
    },
    play: async (page, ms) => {
      await wait(ms * 0.12);
      await dragGlobe(page, ms * 0.4, -420);
      await wait(ms * 0.06);
      await dragGlobe(page, ms * 0.34, -380);
    },
  },
  {
    id: "03-archive",
    path: "/archive?dimension=natural",
    narration:
      "The archive holds two hundred and fifty-six records in five dimensions. Natural memory alone has forty-two, from eruptions to vanished glaciers. Cards show free photographs from Wikimedia Commons, with credit.",
    prepare: photosLoaded,
    play: async (page, ms) => {
      await wait(ms * 0.15);
      await scrollToText(page, "records", ms * 0.15, 60);
      await photosLoaded(page);
      await scroll(page, 1700, ms * 0.6);
    },
  },
  {
    id: "04-record",
    path: "/archive/martha-pigeon",
    narration:
      "Every record shows where it comes from. Martha, the last passenger pigeon, cites her Wikipedia article and Wikidata, credits the photographer, and stays unverified until an expert reviews it. Below, the Connection Engine proposes related memories and shows its evidence.",
    prepare: photosLoaded,
    play: async (page, ms) => {
      await wait(ms * 0.14);
      await scroll(page, 520, ms * 0.18);
      await wait(ms * 0.08);
      await scrollToText(page, "Sources and references", ms * 0.16);
      await wait(ms * 0.12);
      await scrollToText(page, "Connected memories", ms * 0.17, 120);
    },
  },
  {
    id: "05-living-earth",
    path: "/living-earth",
    narration:
      "Living Earth follows fifty-one species and thirty ecosystems, from the thylacine to the Dead Sea, with dated observations of how each one has changed.",
    settleMs: 3000,
    play: async (page, ms) => {
      await wait(ms * 0.12);
      await scrollToText(page, "Species", ms * 0.18, 90);
      await photosLoaded(page);
      await scroll(page, 1300, ms * 0.6);
    },
  },
  {
    id: "06-language",
    path: "/languages/ket",
    narration: "Languages of Earth profiles fifty endangered languages. Ket, the last Yeniseian language, has fewer than thirty speakers left.",
    play: async (page, ms) => {
      await wait(ms * 0.45);
      await scroll(page, 420, ms * 0.4);
    },
  },
  {
    id: "07-alerts",
    path: "/alerts",
    narration:
      "Memory Alert ranks what most urgently needs documenting, with a transparent score: documented threat, documentation gap, single-source risk and missing verification.",
    play: async (page, ms) => {
      await wait(ms * 0.2);
      await scroll(page, 1300, ms * 0.7);
    },
  },
  {
    id: "08-timeline",
    path: "/timeline",
    narration: "The timeline places every dated memory in history, from Göbekli Tepe to the last decade.",
    settleMs: 3000,
    play: async (page, ms) => {
      await wait(ms * 0.3);
      await scroll(page, 500, ms * 0.5);
    },
  },
  {
    id: "09-earth-ai",
    path: "/ai",
    narration: "Ask Earth AI anything. It answers only from the archive, cites every source, and says plainly what the archive does not know.",
    tailSeconds: 7,
    prepare: async (page) => {
      await page.waitForSelector("textarea", { timeout: 30_000 });
    },
    play: async (page, ms) => {
      await wait(1000);
      await page.type("textarea", "Which glaciers have disappeared or are retreating, and why does it matter?", { delay: 36 });
      await wait(400);
      await page.click('button[type="submit"]');
      const end = Date.now() + ms - 4500;
      while (Date.now() < end) {
        await wait(1500);
        // Keep the growing answer in view with the question box at the bottom of the screen (not the footer).
        await page.evaluate(() => {
          const box = document.querySelector("textarea")?.getBoundingClientRect();
          if (box) window.scrollTo({ top: Math.max(0, box.bottom + window.scrollY - window.innerHeight + 90), behavior: "smooth" });
        });
      }
    },
  },
  {
    id: "10-synapse",
    path: pathToFileURL(SYNAPSE_SCENE_FILE).href,
    narration:
      "Behind the scenes, Synapse CLI was the project's memory. Every decision, from the stack to the data importer and the AI provider, was stored with Synapse and recalled in later sessions. The Earth Memory MCP server is registered in the Synapse library for any connected AI tool.",
    settleMs: 800,
    play: async (page, ms) => {
      // Start the typing animation without waiting for it; the scene lasts as long as the narration.
      await page.evaluate(() => {
        void (window as unknown as { startScene: () => Promise<void> }).startScene();
      });
      await wait(ms);
    },
  },
  {
    id: "11-outro",
    path: "/developers",
    narration: "Earth Memory is open to people and AI agents, through a public API and an MCP server. The memory of humanity belongs to humanity.",
    tailSeconds: 2.2,
    play: async (page, ms) => {
      await wait(ms * 0.3);
      await scroll(page, 600, ms * 0.5);
    },
  },
];
