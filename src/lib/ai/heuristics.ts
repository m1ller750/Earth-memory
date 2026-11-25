import type { Dimension, RecordKind } from "../db/schema";
import { findCountryCode, isCountryCode } from "../geo/countries";
import { tokenize } from "../text";

/**
 * Rule-based metadata suggestions used when no AI provider is configured. Every
 * suggestion states the rule that produced it, so contributors can judge it.
 */
export interface MetadataSuggestions {
  dimension: Dimension | null;
  kind: RecordKind | null;
  tags: string[];
  countryCode: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  summary: string | null;
  reasoning: string;
}

const KIND_RULES: Array<[RegExp, RecordKind]> = [
  [/\b(photo|photograph|snapshot|picture)\b|фотограф|снимок/i, "photograph"],
  [/\b(recipe|cook|ingredients?|dish)\b|рецепт|готов|блюд/i, "recipe"],
  [/\b(interview|interviewed|told me|asked (him|her|them))\b|интервью|рассказал/i, "interview"],
  [/\b(recording|recorded|audio|song|sang)\b|запис|песн/i, "audio"],
  [/\b(map|cartograph)\b|карт[аы]/i, "map"],
  [/\b(letter|document|manuscript|archive|certificate)\b|документ|рукопис|письм/i, "document"],
  [/\b(festival|ritual|ceremony|tradition|custom)\b|праздник|обряд|традиц|обыча/i, "tradition"],
  [/\b(craft|weav|felt|pottery|carv|embroider)\w*|ремесл|войлок|ткач|вышив|гончар/i, "practice"],
  [/\b(observed|observation|survey|measured|sighting)\b|наблюд|измер/i, "observation"],
  [/\b(study|research|experiment|discovery)\b|исследован|открыти/i, "research"],
  [/\b(my (grand)?(mother|father)|i remember|when i was)\b|бабушк|дедушк|я помню|в детстве/i, "story"],
];

const DIMENSION_RULES: Array<[RegExp, Dimension]> = [
  [/\b(species|forest|lake|river|sea|reef|bird|animal|plant|glacier|ecosystem|wildlife|steppe|desert)\b|лес|озер|рек[аи]|мор[ея]|птиц|животн|растени|ледник|степ|пустын/i, "natural"],
  [/\b(research|science|scientist|observatory|astronom|experiment|measurement|discovery)\b|наук|учён|обсерватор|астроном/i, "scientific"],
  [/\b(language|music|dance|song|craft|tradition|festival|recipe|epic|ritual)\b|язык|музык|танц|песн|ремесл|традиц|праздник|рецепт|эпос|обряд/i, "cultural"],
  [/\b(my (grand)?(mother|father|family)|i remember|childhood|neighbo)\w*|семь|бабушк|дедушк|детств|помню/i, "human"],
  [/\b(war|empire|city|century|ancient|archaeolog|monument|dynasty|revolution|deport)\w*|войн|импери|город|век[аеу]?\b|древн|археолог|памятник|династи|депортац/i, "historical"],
];

const STOP = new Set(["the", "and", "with", "from", "that", "this", "were", "was", "for", "his", "her", "their", "они", "это", "как", "что", "был", "была", "были", "для"]);

export function suggestMetadata(title: string, body: string): MetadataSuggestions {
  const text = `${title}\n${body}`;
  const reasons: string[] = [];

  const kind = KIND_RULES.find(([rx]) => rx.test(text))?.[1] ?? null;
  if (kind) reasons.push(`type from keywords (“${kind}”)`);

  const scores = new Map<Dimension, number>();
  for (const [rx, dim] of DIMENSION_RULES) {
    const matches = text.match(new RegExp(rx.source, "gi"))?.length ?? 0;
    if (matches) scores.set(dim, (scores.get(dim) ?? 0) + matches);
  }
  const dimension = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? (kind === "story" || kind === "interview" ? "human" : null);
  if (dimension) reasons.push(`dimension from topic words`);

  // Years: four-digit numbers between 1000 and the current year, or explicit BCE/до н. э. dates.
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (const m of text.matchAll(/\b(\d{3,4})\s*(BCE|BC|до н\.?\s*э\.?)?/gi)) {
    const value = Number(m[1]);
    if (m[2]) years.push(-value);
    else if (value >= 1000 && value <= currentYear) years.push(value);
  }
  const periodStart = years.length ? Math.min(...years) : null;
  const periodEnd = years.length > 1 ? Math.max(...years) : periodStart;
  if (years.length) reasons.push(`period from years in the text`);

  let countryCode: string | null = null;
  const words = text.split(/[\s,.;:()«»"]+/).filter(Boolean);
  for (let i = 0; i < words.length && !countryCode; i++) {
    for (const len of [3, 2, 1]) {
      const phrase = words.slice(i, i + len).join(" ");
      if (phrase.length < 4) continue;
      const code = findCountryCode(phrase);
      if (code && isCountryCode(code)) {
        countryCode = code;
        break;
      }
    }
  }
  if (countryCode) reasons.push(`country named in the text`);

  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    if (token.length < 5 || STOP.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const tags = [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);
  if (tags.length) reasons.push(`themes from repeated words`);

  const firstSentence = body.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const summary = firstSentence.length >= 20 && firstSentence.length <= 220 ? firstSentence : null;

  return {
    dimension,
    kind,
    tags,
    countryCode,
    periodStart,
    periodEnd,
    summary,
    reasoning: reasons.length ? `Rule-based: ${reasons.join("; ")}.` : "Rule-based: no strong signals found in the text.",
  };
}
