/** Scenes of the narrated demo video (see make-video.ts). Each scene plays for as long as its narration. */
import type { Page } from "puppeteer-core";

export interface Scene {
  id: string;
  path: string;
  narration: string;
  /** Extra seconds after the narration ends (lets an answer finish streaming, or a shot breathe). */
  tailSeconds?: number;
  settleMs?: number;
  prepare?: (page: Page) => Promise<void>;
  play: (page: Page, ms: number) => Promise<void>;
}

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
  const y = await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.includes(needle)) return (node.parentElement?.getBoundingClientRect().top ?? 0) + window.scrollY;
    }
    return null;
  }, text);
  if (y == null) return;
  const current = await page.evaluate(() => window.scrollY);
  await scroll(page, y - offset - current, ms);
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
      "This is Earth Memory: a living archive of humanity and planet Earth. It brings together languages, traditions, places, species and the science that records them, to preserve what makes our world unique before it disappears.",
    settleMs: 4000,
    play: async (page, ms) => {
      await wait(ms * 0.35);
      await scroll(page, 900, ms * 0.55);
    },
  },
  {
    id: "02-globe",
    path: "/explore",
    narration:
      "Every memory has a place on the globe. Points are coloured by layer: archive memories, endangered languages, threatened species and changing ecosystems. Nearly four hundred points, each one backed by a cited source.",
    settleMs: 9000,
    prepare: async (page) => {
      await page.waitForSelector("canvas", { timeout: 60_000 });
    },
    play: async (page, ms) => {
      await wait(ms * 0.15);
      await dragGlobe(page, ms * 0.4, -420);
      await wait(ms * 0.05);
      await dragGlobe(page, ms * 0.35, -380);
    },
  },
  {
    id: "03-archive",
    path: "/archive?dimension=natural",
    narration:
      "The archive holds two hundred and fifty-six records in five dimensions: human, cultural, historical, natural and scientific. Natural memory alone has forty-two: volcanic eruptions, vanished glaciers, oil spills, and the last individuals of lost species.",
    play: async (page, ms) => {
      await wait(ms * 0.2);
      await scrollToText(page, "RECORDS", ms * 0.2, 60);
      await scroll(page, 1800, ms * 0.55);
    },
  },
  {
    id: "04-record",
    path: "/archive/okjokull",
    narration:
      "Each record shows exactly where it comes from. Okjökull, the first Icelandic glacier lost to climate change, cites its Wikipedia article and Wikidata, carries its licence, and stays marked as unverified until an expert reviews it. Further down, the Memory Connection Engine proposes related records and lists the evidence for every link.",
    play: async (page, ms) => {
      await wait(ms * 0.12);
      await scroll(page, 520, ms * 0.18);
      await wait(ms * 0.08);
      await scrollToText(page, "SOURCES AND REFERENCES", ms * 0.17);
      await wait(ms * 0.13);
      await scrollToText(page, "Connection Engine", ms * 0.17, 120);
    },
  },
  {
    id: "05-graph",
    path: "/graph",
    narration:
      "A knowledge graph links people, places, cultures and events across the archive. Every link keeps its evidence and its level of certainty.",
    settleMs: 5000,
    play: async (page, ms) => {
      await wait(ms * 0.3);
      await scroll(page, 300, ms * 0.4);
    },
  },
  {
    id: "06-ecosystem",
    path: "/living-earth/ecosystems/dead-sea",
    narration:
      "Living Earth follows species and ecosystems through time. The Dead Sea's timeline lists dated observations taken straight from the sources, from the first measurements in 1930 to its rapid shrinking since the 1960s.",
    play: async (page, ms) => {
      await wait(ms * 0.2);
      await scrollToText(page, "BEFORE 1970", ms * 0.3, 160);
      await wait(ms * 0.15);
      await scroll(page, 380, ms * 0.25);
    },
  },
  {
    id: "07-language",
    path: "/languages/ket",
    narration:
      "Languages of Earth profiles fifty endangered languages. Ket, the last surviving Yeniseian language of Siberia, has fewer than thirty native speakers left.",
    play: async (page, ms) => {
      await wait(ms * 0.45);
      await scroll(page, 420, ms * 0.4);
    },
  },
  {
    id: "08-alerts",
    path: "/alerts",
    narration:
      "Memory Alert ranks languages, traditions, species and ecosystems by how urgently they need documenting. The score is transparent: documented threat, documentation gap, single-source risk and missing verification.",
    play: async (page, ms) => {
      await wait(ms * 0.2);
      await scroll(page, 1400, ms * 0.7);
    },
  },
  {
    id: "09-timeline",
    path: "/timeline",
    narration: "The timeline places every dated memory in history, from the first temples of Göbekli Tepe to the floods and fires of the last decade.",
    settleMs: 3000,
    play: async (page, ms) => {
      await wait(ms * 0.3);
      await scroll(page, 500, ms * 0.5);
    },
  },
  {
    id: "10-earth-ai",
    path: "/ai",
    narration:
      "And anyone can ask Earth AI. It answers only from the archive, cites every source by number, and says plainly what the archive does not know.",
    tailSeconds: 9,
    prepare: async (page) => {
      await page.waitForSelector("textarea", { timeout: 30_000 });
    },
    play: async (page, ms) => {
      await wait(1200);
      await page.type("textarea", "Which glaciers have disappeared or are retreating, and why does it matter?", { delay: 38 });
      await wait(500);
      await page.click('button[type="submit"]');
      const end = Date.now() + ms - 4500;
      while (Date.now() < end) {
        await wait(1500);
        await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
      }
    },
  },
  {
    id: "11-outro",
    path: "/developers",
    narration:
      "Earth Memory is open to people and to AI agents alike, through a public API and an MCP server. Because the memory of humanity belongs to humanity.",
    tailSeconds: 2,
    play: async (page, ms) => {
      await wait(ms * 0.3);
      await scroll(page, 600, ms * 0.5);
    },
  },
];
