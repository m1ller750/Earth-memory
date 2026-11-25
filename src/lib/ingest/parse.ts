/**
 * Pure parsing helpers for the reference-data importer: no network and no database.
 *
 * Inputs are Jina Reader output (Wikipedia articles as markdown, read through Jina's MCP server)
 * and Wikipedia / Wikidata API payloads. Everything here is deterministic: text is selected and
 * cleaned, never generated, so every sentence that reaches the archive exists in the source.
 */
import { findCountryCode, isCountryCode } from "../geo/countries";
import type { IucnStatus, LanguageStatus } from "../db/schema";

/* ------------------------------------------------------------------ Jina documents */

export interface JinaDocument {
  url: string;
  title: string;
  /** Unfolded markdown paragraphs in page order (infobox rows, captions, prose, references). */
  paragraphs: string[];
}

/** Parses the YAML-style document returned by the `read_url` tool of Jina's MCP server. */
export function parseJinaDocument(raw: string): JinaDocument {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  let url = "";
  let title = "";
  let content = "";
  for (let i = 0; i < lines.length; i++) {
    const match = /^([A-Za-z_]+):\s?(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, key, value] = match;
    if (key === "url") url = unquote(value);
    else if (key === "title") title = unquote(value);
    else if (key === "content") {
      content = readYamlValue(value, lines.slice(i + 1));
      break;
    }
  }
  const paragraphs = content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { url, title, paragraphs };
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

/** Reads a YAML scalar: folded/literal block (`>-`, `|-`), double- or single-quoted, or plain. */
function readYamlValue(first: string, rest: string[]): string {
  const head = first.trim();
  if (/^[>|][+-]?\d*$/.test(head)) {
    const folded = head.startsWith(">");
    const block: string[] = [];
    let indent = -1;
    for (const line of rest) {
      if (line.trim() === "") {
        block.push("");
        continue;
      }
      const lead = line.length - line.trimStart().length;
      if (indent < 0) indent = lead;
      if (lead < indent) break;
      block.push(line.slice(indent));
    }
    if (!folded) return block.join("\n");
    // Folded style: single line breaks become spaces, blank lines separate paragraphs.
    const paragraphs: string[] = [];
    let current: string[] = [];
    for (const line of block) {
      if (line === "") {
        if (current.length) paragraphs.push(current.join(" "));
        current = [];
      } else current.push(line);
    }
    if (current.length) paragraphs.push(current.join(" "));
    return paragraphs.join("\n");
  }
  if (head.startsWith('"') || head.startsWith("'")) {
    const quote = head[0];
    let text = head;
    for (const line of rest) {
      if (endsQuoted(text, quote)) break;
      text += line.trim() === "" ? "\n" : ` ${line.trim()}`;
    }
    if (quote === "'") return text.slice(1, -1).replace(/''/g, "'");
    try {
      return JSON.parse(text.replace(/\\ /g, " ").replace(/\n/g, "\\n")) as string;
    } catch {
      return text.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }
  }
  return head;
}

function endsQuoted(text: string, quote: string): boolean {
  if (text.length < 2 || !text.endsWith(quote)) return false;
  if (quote === "'") return true;
  let backslashes = 0;
  for (let i = text.length - 2; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 0;
}

/* ------------------------------------------------------------------ inline cleanup */

/** Removes markdown, links and citation markers from a Jina/Wikipedia fragment. */
export function cleanInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))*\)/g, "$1")
    .replace(/\[(?:\d+|[a-z]|note \d+|[a-z]+ \d+|_?[a-z][a-z ,]*?(?:needed|clarification|verification|dubious|discuss|citation)[a-z ,]*_?)\]/gi, "")
    .replace(/\*\*/g, "")
    .replace(/(^|[\s("'†])_+([^_]+?)_+(?=[\s.,;:)'"!?]|$)/g, "$1$2")
    .replace(/`/g, "")
    .replace(/[†‡]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

const IPA_CHARS = /[ˈˌəɪʊɛɔæʃʒθðŋɯɕçʔːɐɑɒɜɞʌɤɨʉɵøœɶʁʀɾɽɻɭʎʟɲɳʂʐʈɖɟɢʕħɦɮɬʍɥʜʢʡǀǁǂǃ˥˦˧˨˩ꜜ̥̃]/;

/**
 * Cleans a Wikipedia lead paragraph from the TextExtracts API: drops pronunciation guides,
 * respellings and audio leftovers, keeps native names and scientific names.
 */
export function cleanLeadParagraph(text: string): string {
  let t = text
    .replace(/\b[A-Z][a-z]+ pronunciation:\s*\[[^\]]*\]/g, "")
    .replace(/\bpronounced\s*\[[^\]]*\](?:\s*or\s*\[[^\]]*\])*/gi, "")
    .replace(/\bpronounced\s*\/[^/]+\/(?:\s*or\s*\/[^/]+\/)*/gi, "")
    .replace(/\[[^\]]*\]/g, (m) => (IPA_CHARS.test(m) ? "" : m))
    .replace(/\/[^/\s][^/]{0,40}\//g, (m) => (IPA_CHARS.test(m) ? "" : m))
    // Respellings such as "( THY-luh-seen;", "(NAH-mib;" or "( KET)" left by audio/IPA templates.
    .replace(/\(\s+(?:(?:[a-z]+-)*[A-Z]{2,}(?:-[A-Za-z]+)*(?:\s+|(?=[;),])))+/g, "(")
    .replace(/\((?:(?:[a-zəɪʊ]+-)*[A-Z]{2,}(?:-[A-Za-zəɪʊ]+)+(?:\s+|(?=[;),])))+/g, "(")
    .replace(/\(\s*(?:or|listen|ⓘ)\s*(?=[;),])/gi, "(");
  // Hidden sort keys of date templates, e.g. "((1931-10-23)October 23, 1931 – …".
  t = tidyParentheticals(t.replace(/\(\d{4}-\d{2}-\d{2}\)/g, ""));
  // Tidy separators left behind.
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(/\(\s*[;,]\s*/g, "(")
      .replace(/\s*[;,]\s*\)/g, ")")
      .replace(/\(\s*(?:or\s*)?\)/g, "")
      .replace(/\s+\)/g, ")");
  }
  return t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

const RESPELLING_TOKEN = String.raw`(?:[a-zəɪʊæɒʌ]+-)*[A-Z]{2,}[a-zəɪʊæɒʌ]*(?:-[A-Za-zəɪʊæɒʌ]*)+|(?:[a-zəɪʊæɒʌ]+-)+[A-Z]{2,}[a-zəɪʊæɒʌ]*-?`;
const RESPELLING = new RegExp(
  String.raw`^(?:(?:English|US|UK|American|British)(?:\s+English)?(?:\s+also)?:?\s+)?(?:${RESPELLING_TOKEN})(?:\s+(?:${RESPELLING_TOKEN}))*$`,
);
const LABEL_ONLY = /^(?:[\p{L}][\p{L} .'’-]{0,40}:|IPA|listen|ⓘ)$/u;
const PRONOUNCED_IPA = new RegExp(String.raw`\bpronounced\s+(?:\S*${IPA_CHARS.source}\S*\s*)+`, "u");

/**
 * Cleans the parentheses that follow a subject at the start of a lead ("Mariachi (US:, UK:, Spanish:)",
 * "Lascaux (English: la-SKOH; French: Grotte de Lascaux)"): drops respellings, bare language labels
 * whose pronunciation was stripped, and unbracketed IPA; keeps names, translations and dates.
 */
export function tidyParentheticals(text: string, within = 260): string {
  return text
    .replace(/\(([^()]*)\)/g, (match, inner: string, offset: number) => {
      if (offset > within) return match;
      const tidy = inner
        .split(";")
        .map((part) =>
          part
            .split(/,(?!\d)/)
            .map((s) => s.replace(PRONOUNCED_IPA, "").trim())
            .filter((s) => s.length > 0 && !LABEL_ONLY.test(s) && !RESPELLING.test(s))
            .join(", "),
        )
        .filter((p) => p.length > 0)
        .join("; ");
      return tidy ? `(${tidy})` : "";
    })
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1");
}

/* ------------------------------------------------------------------ sentences */

const ABBREVIATIONS = new Set([
  "c", "ca", "cf", "st", "mt", "mts", "dr", "mr", "mrs", "ms", "jr", "sr", "no", "nos", "vs", "approx", "lt", "gen", "col", "capt",
  "rev", "prof", "fl", "b", "d", "e.g", "i.e", "etc", "al", "u.s", "u.k", "u.n", "inc", "ltd", "co", "fig", "vol", "ed", "eds", "est",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "ft", "km", "mi", "sq", "pp", "ad", "bc", "bce", "ce",
]);

/** Splits prose into sentences without breaking on common abbreviations or initials. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?]["”’)]*\s+(?=["“‘(]?[A-Z0-9À-ÖØ-Þ])/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const end = match.index + 1;
    const before = text.slice(start, end);
    const lastWord = /(\S+)\.$/.exec(before)?.[1]?.toLowerCase().replace(/^[("“‘]+/, "") ?? "";
    const isInitial = /^[a-z]$/i.test(lastWord) || /^(?:[a-z]\.)+[a-z]$/i.test(lastWord);
    if (text[match.index] === "." && (ABBREVIATIONS.has(lastWord) || isInitial)) continue;
    out.push(text.slice(start, match.index + match[0].trimEnd().length).trim());
    start = match.index + match[0].length;
  }
  const tail = text.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

/** Shortens text to whole sentences within `max` characters (or a word boundary as a last resort). */
export function clipToSentences(text: string, max: number): string {
  if (text.length <= max) return text;
  let result = "";
  for (const sentence of splitSentences(text)) {
    const next = result ? `${result} ${sentence}` : sentence;
    if (next.length > max) break;
    result = next;
  }
  if (result) return result;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}…`;
}

/** Keeps whole paragraphs (blank-line separated) within `max` characters, ending on a sentence. */
export function clipParagraphs(paragraphs: string[], max: number): string {
  const kept: string[] = [];
  let length = 0;
  for (const p of paragraphs) {
    if (length + p.length > max) {
      const clipped = clipToSentences(p, max - length);
      if (kept.length === 0 || (clipped.length > 80 && !clipped.endsWith("…"))) kept.push(clipped);
      break;
    }
    kept.push(p);
    length += p.length + 2;
  }
  return kept.join("\n\n");
}

/* ------------------------------------------------------------------ summary and body */

export interface LeadText {
  summary: string;
  body: string;
}

/**
 * Builds a record summary (the opening sentence or two) and body (the rest of the lead, extended
 * with following article paragraphs when the lead is short) from cleaned paragraphs.
 */
export function summaryAndBody(lead: string[], continuation: string[] = [], options: { maxSummary?: number; maxBody?: number; minBody?: number } = {}): LeadText {
  const maxSummary = options.maxSummary ?? 340;
  const maxBody = options.maxBody ?? 2400;
  const minBody = options.minBody ?? 700;
  const paragraphs = lead.map(cleanLeadParagraph).filter((p) => p.length > 0);
  if (paragraphs.length === 0) return { summary: "", body: "" };

  const firstSentences = splitSentences(paragraphs[0]);
  let summary = firstSentences[0] ?? paragraphs[0];
  let used = 1;
  while (summary.length < 110 && used < firstSentences.length && `${summary} ${firstSentences[used]}`.length <= maxSummary) {
    summary = `${summary} ${firstSentences[used]}`;
    used++;
  }
  if (summary.length > maxSummary) summary = clipToSentences(summary, maxSummary);

  // The body continues after the summary so the record page does not repeat it.
  const restOfFirst = firstSentences.slice(used).join(" ");
  const bodyParagraphs = [restOfFirst, ...paragraphs.slice(1)].filter((p) => p.length > 0);
  const leadKey = alnum(paragraphs.join(" "));
  for (const extra of continuation) {
    if (bodyParagraphs.join("\n\n").length >= minBody) break;
    // A paragraph that opens like text already used is a repeat (the article and the API differ in spacing).
    const key = alnum(extra).slice(0, 50);
    if (!leadKey.includes(key) && !bodyParagraphs.some((p) => alnum(p).includes(key))) bodyParagraphs.push(extra);
  }
  const kept: string[] = [];
  let length = 0;
  for (const p of bodyParagraphs) {
    if (length + p.length > maxBody) {
      const clipped = clipToSentences(p, maxBody - length);
      if (clipped.length > 80 && !clipped.endsWith("…")) kept.push(clipped);
      break;
    }
    kept.push(p);
    length += p.length + 2;
  }
  let body = kept.join("\n\n");
  // A very short lead: show the whole lead as the body rather than a fragment.
  if (body.length < 160) body = paragraphs.join("\n\n");
  return { summary, body };
}

/* ------------------------------------------------------------------ article structure */

export interface InfoboxRow {
  cells: string[];
}

function isTableRow(p: string): boolean {
  const t = p.trim();
  return t.length > 1 && t.endsWith("|") && t.slice(0, -1).includes("|");
}

/** Infobox rows: the table rows before the first long prose paragraph of the article. */
export function parseInfobox(paragraphs: string[]): InfoboxRow[] {
  const rows: InfoboxRow[] = [];
  for (const p of paragraphs) {
    if (!isTableRow(p)) {
      if (p.length > 200) break;
      continue;
    }
    if (/^\|?\s*-{3}/.test(p.trim())) continue;
    const cells = p
      .split("|")
      .map((c) => cleanInline(c))
      .filter((c) => c.length > 0);
    if (cells.length) rows.push({ cells });
  }
  return rows;
}

const keyOf = (cell: string) => cell.replace(/:$/, "").trim();

/** Value of the first infobox row whose label matches. */
export function infoboxField(rows: InfoboxRow[], label: RegExp): string | undefined {
  for (const r of rows) if (r.cells.length >= 2 && label.test(keyOf(r.cells[0]))) return r.cells.slice(1).join(" | ");
  return undefined;
}

/** Text of the rows following a single-cell heading row, up to the next heading. */
export function infoboxSection(rows: InfoboxRow[], heading: RegExp, maxRows = 3): string | undefined {
  const index = rows.findIndex((r) => r.cells.length === 1 && heading.test(keyOf(r.cells[0])));
  if (index < 0) return undefined;
  return rows
    .slice(index + 1, index + 1 + maxRows)
    .map((r) => r.cells.join(" "))
    .join(" ");
}

/** Every infobox cell joined, for loose pattern matching (status sentences and the like). */
export function infoboxText(rows: InfoboxRow[]): string {
  return rows.map((r) => r.cells.join(" ")).join(" \n ");
}

/**
 * Prose paragraphs of the article body, cleaned, in order. Stops at the reference list and skips
 * table rows, list items, captions and boilerplate.
 */
export function articleProse(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    const t = p.trim();
    if (/^\d+\.\s+(?:↑|\^|\d+\s+\d+)/.test(t) || /^(?:References|Notes|Bibliography|Further reading|External links)$/i.test(t)) break;
    if (isTableRow(t) || /^(?:[*•-]|\d+\.)\s/.test(t) || /^#{1,6}\s/.test(t)) continue;
    if (/Retrieved \d|Archived from the original|ISBN|doi:/i.test(t)) continue;
    const cleaned = cleanInline(t);
    if (cleaned.length < 120 || !/[.!?]["”’)]?$/.test(cleaned)) continue;
    out.push(cleaned);
  }
  return out;
}

/** Letters and digits only, lower-cased: compares texts that differ in spacing or punctuation. */
export function alnum(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/** Paragraphs that follow the lead in the article (located by matching the lead's last paragraph). */
export function continuationAfterLead(prose: string[], lead: string[]): string[] {
  if (lead.length === 0) return [];
  const probe = alnum(cleanLeadParagraph(lead[lead.length - 1])).slice(0, 40);
  if (probe.length < 20) return [];
  const index = prose.findIndex((p) => alnum(p).includes(probe));
  return index >= 0 ? prose.slice(index + 1) : [];
}

/* ------------------------------------------------------------------ coordinates and countries */

/** Decimal coordinates from text such as "19°24′S 22°54′E / 19.400°S 22.900°E". */
export function parseCoordinates(text: string | undefined): { lat: number; lng: number } | undefined {
  if (!text) return undefined;
  const decimal = /(\d{1,2}(?:\.\d+)?)°\s*([NS])[\s,;]+(\d{1,3}(?:\.\d+)?)°\s*([EW])/g;
  let found: { lat: number; lng: number } | undefined;
  for (const m of text.matchAll(decimal)) {
    if (!m[1].includes(".") && !m[3].includes(".") && found) continue;
    const lat = Number(m[1]) * (m[2] === "S" ? -1 : 1);
    const lng = Number(m[3]) * (m[4] === "W" ? -1 : 1);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) found = { lat, lng };
    if (m[1].includes(".")) break;
  }
  return found;
}

/** ISO alpha-2 codes for country names listed in free text ("Russia, Turkey and Georgia"). */
export function countriesFromText(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const part of text.split(/[,;/|•*]|\band\b|\bformerly\b|\(|\)/)) {
    const name = part.replace(/\b(?:the|northern|southern|eastern|western|central)\b/gi, "").trim();
    if (name.length < 3 || name.length > 40) continue;
    const code = findCountryCode(name);
    if (code && isCountryCode(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/* ------------------------------------------------------------------ status vocabularies */

// "Critically Endangered (Possibly Extinct in the Wild)" is a CR assessment, so CR is checked first.
const IUCN_PATTERNS: Array<[RegExp, IucnStatus]> = [
  [/critically endangered/i, "CR"],
  [/extinct in the wild/i, "EW"],
  [/\bextinct\b/i, "EX"],
  [/\bendangered\b/i, "EN"],
  [/\bvulnerable\b/i, "VU"],
  [/near threatened/i, "NT"],
  [/least concern/i, "LC"],
  [/data deficient/i, "DD"],
];

/** IUCN category from a label or infobox text ("Critically Endangered (IUCN 3.1)"). */
export function iucnStatusFrom(text: string | undefined): IucnStatus | undefined {
  if (!text) return undefined;
  for (const [re, status] of IUCN_PATTERNS) if (re.test(text)) return status;
  return undefined;
}

/** The IUCN entry of a taxobox's conservation-status section, with the assessment year if shown. */
export function iucnFromInfobox(rows: InfoboxRow[]): { status: IucnStatus; text: string; year?: number } | undefined {
  const section = infoboxSection(rows, /^conservation status$/i, 4);
  if (!section) return undefined;
  const iucnPart = /([^|]*?)\(IUCN\s*\d(?:\.\d)?\)/i.exec(section)?.[1] ?? (/\bIUCN\b/i.test(section) ? section : undefined);
  const status = iucnStatusFrom(iucnPart);
  if (!status) return undefined;
  const year = /\((\d{4})\)/.exec(iucnPart ?? "")?.[1];
  const text = cleanInline((iucnPart ?? "").replace(/([a-z])\(/gi, "$1 (")).replace(/\s+$/, "");
  return { status, text, year: year ? Number(year) : undefined };
}

const LANGUAGE_PATTERNS: Array<[RegExp, LanguageStatus]> = [
  [/critically endangered/i, "critically_endangered"],
  [/severely endangered/i, "severely_endangered"],
  [/definitely endangered/i, "definitely_endangered"],
  [/\bvulnerable\b/i, "vulnerable"],
  [/\bextinct\b/i, "extinct"],
  [/\bsafe\b/i, "safe"],
];

/** UNESCO language vitality category from a Wikidata label or an infobox sentence. */
export function languageStatusFrom(text: string | undefined): LanguageStatus | undefined {
  if (!text) return undefined;
  for (const [re, status] of LANGUAGE_PATTERNS) if (re.test(text)) return status;
  return undefined;
}

/** The UNESCO Atlas sentence of a language infobox ("Ket is classified as Severely Endangered by the UNESCO Atlas…"). */
export function unescoSentence(rows: InfoboxRow[]): string | undefined {
  return rows.map((r) => r.cells.join(" ")).find((t) => /classified as .+ by (?:the )?UNESCO/i.test(t));
}

export type TaxonGroup = "mammal" | "bird" | "reptile" | "amphibian" | "fish" | "invertebrate" | "plant";

const CLASS_GROUPS: Array<[RegExp, TaxonGroup]> = [
  [/^mammalia/i, "mammal"],
  [/^aves/i, "bird"],
  [/^(?:reptilia|sauropsida)/i, "reptile"],
  [/^amphibia/i, "amphibian"],
  [/^(?:actinopterygii|chondrichthyes|sarcopterygii|elasmobranchii|teleostei|cephalaspidomorphi|myxini|hyperoartia)/i, "fish"],
  [/^(?:insecta|arachnida|gastropoda|bivalvia|anthozoa|hexacorallia|malacostraca|cephalopoda|hydrozoa|scyphozoa|clitellata|chilopoda|diplopoda|merostomata)/i, "invertebrate"],
];

/** Broad taxon group from a taxobox's Kingdom / Class / Order rows. */
export function taxonGroupFrom(rows: InfoboxRow[]): TaxonGroup | undefined {
  const kingdom = infoboxField(rows, /^kingdom$/i) ?? "";
  if (/plantae/i.test(kingdom)) return "plant";
  const cls = infoboxField(rows, /^class$/i);
  if (cls) for (const [re, group] of CLASS_GROUPS) if (re.test(cls)) return group;
  const order = infoboxField(rows, /^order$/i) ?? "";
  if (/^(?:testudines|squamata|crocodilia|rhynchocephalia)/i.test(order)) return "reptile";
  if (/^(?:anura|caudata|urodela|gymnophiona)/i.test(order)) return "amphibian";
  if (/^(?:phasmatodea|lepidoptera|coleoptera|odonata|orthoptera|hymenoptera|diptera)/i.test(order)) return "invertebrate";
  const phylum = infoboxField(rows, /^(?:phylum|division)$/i) ?? "";
  if (/^(?:mollusca|arthropoda|cnidaria|annelida|echinodermata|porifera)/i.test(phylum)) return "invertebrate";
  if (/^(?:tracheophyta|pinophyta|magnoliophyta|angiosperms)/i.test(phylum) || /^(?:tracheophytes|angiosperms|gymnosperms)$/i.test(infoboxField(rows, /^clade$/i) ?? "")) return "plant";
  return undefined;
}

const DESCRIPTION_GROUPS: Array<[RegExp, TaxonGroup]> = [
  [/\b(?:mammal|marsupial|rhinoceros|primate|whale|dolphin|porpoise|rodent|bat|antelope|oryx|ibex|deer|wolf|canine|canid|cat|felid|feline|bovine|bovid|cattle|equine|zebra|sea cow|sirenian)\b/i, "mammal"],
  [/\b(?:bird|parrot|macaw|pigeon|dove|eagle|crow|auk|parakeet|honeycreeper|songbird|wattlebird)\b/i, "bird"],
  [/\b(?:reptile|tortoise|turtle|lizard|snake|crocodile|gecko|iguana)\b/i, "reptile"],
  [/\b(?:amphibian|frog|toad|salamander|newt|axolotl)\b/i, "amphibian"],
  [/\b(?:fish|shark|ray|sturgeon|angelshark|eel)\b/i, "fish"],
  [/\b(?:insect|stick insect|phasmid|snail|mollusc|coral|crab|spider|beetle|butterfly)\b/i, "invertebrate"],
  [/\b(?:plant|tree|conifer|pine|shrub|flower|flowering|fern|palm)\b/i, "plant"],
];

/** Broad taxon group from a Wikipedia short description ("Extinct species of marsupial"). */
export function taxonGroupFromDescription(description: string | undefined): TaxonGroup | undefined {
  if (!description) return undefined;
  for (const [re, group] of DESCRIPTION_GROUPS) if (re.test(description)) return group;
  return undefined;
}

/* ------------------------------------------------------------------ ecosystem observations */

export interface DatedObservation {
  year: number;
  yearEnd?: number;
  title: string;
  observation: string;
}

const CHANGE_RULES: Array<[RegExp, string]> = [
  [/\bbleach/i, "Coral bleaching"],
  [/\b(?:collaps|disintegrat|broke (?:up|apart))/i, "Collapse"],
  [/\b(?:glaciers?|ice|icefield|ice sheet|ice shelf|isbr\w*)\b[^.]*\b(?:retreat|melt|thinn)|\b(?:retreat|melt|thinn)\w*\b[^.]*\b(?:glaciers?|ice)\b/i, "Ice retreat"],
  [/\b(?:dried up|dry up|dries up|desiccat|shr[au]nk|shrinking|shrinkage|water level (?:fell|dropped|declined))/i, "Water loss"],
  [/\bflood control/i, "Flood control"],
  [/\bflood/i, "Flood"],
  [/\bdrought/i, "Drought"],
  [/\b(?:wildfire|fires\b|burn(?:ed|t|ing)?\b)/i, "Fire"],
  [/\b(?:deforest|logging|clear-?cut|cleared)/i, "Forest loss"],
  [/\b(?:oil spill|pollut|contaminat|toxic)/i, "Pollution"],
  [/\b(?:dams?\b|diver(?:sion|ted)|irrigation)/i, "Water diversion"],
  [/\b(?:restor|recover|rewild|reintroduc|replant|re-?flood)/i, "Recovery"],
  [/\b(?:designated|inscribed|declared|listed as|became a (?:national park|reserve)|ramsar|biosphere reserve|world heritage)/i, "Protection"],
  [/\b(?:declin|decreas|reduced|disappear)/i, "Decline"],
  [
    /\b(?:surveyed|measured|monitored|satellite|recorded)\b[^.]*\b(?:km|m|ft|mi|ha|hectares|acres|per ?cent|level|area|volume|extent|speed|temperature)\b|\b(?:km|ha|acres)\b[^.]*\b(?:surveyed|measured|monitored|satellite|recorded)\b/i,
    "Measurement",
  ],
];

/** Statements that are not observations: plans and forecasts, literature citations, population censuses. */
const NOT_AN_OBSERVATION = /\bet al\.|\b(?:should|will|would|could|might|may) (?:be|begin|start|reach|become)\b|\bis expected\b|\bplanned\b|\bcensus\b/i;

/**
 * Dated statements about change, selected verbatim from article prose (one or two years between
 * 1850 and the current year, plus a change keyword). Used as observations for ecosystems.
 */
export function datedObservations(prose: string[], options: { max?: number; currentYear?: number } = {}): DatedObservation[] {
  const max = options.max ?? 6;
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const found: DatedObservation[] = [];
  const seen = new Set<string>();
  for (const paragraph of prose) {
    for (const sentence of splitSentences(paragraph)) {
      if (sentence.length < 60 || sentence.length > 320 || NOT_AN_OBSERVATION.test(sentence)) continue;
      const years = [...new Set([...sentence.matchAll(/\b(1[89]\d{2}|20\d{2})\b(?!s)/g)].map((m) => Number(m[1])))].filter((y) => y >= 1850 && y <= currentYear);
      if (years.length === 0 || years.length > 2) continue;
      const rule = CHANGE_RULES.find(([re]) => re.test(sentence));
      if (!rule) continue;
      const year = Math.min(...years);
      const yearEnd = years.length === 2 && Math.max(...years) - year <= 60 ? Math.max(...years) : undefined;
      const key = `${year}|${rule[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ year, yearEnd, title: rule[1], observation: sentence });
    }
  }
  found.sort((a, b) => a.year - b.year);
  if (found.length <= max) return found;
  // Keep the spread over time: evenly spaced picks including the first and the last.
  const picks: DatedObservation[] = [];
  for (let i = 0; i < max; i++) picks.push(found[Math.round((i * (found.length - 1)) / (max - 1))]);
  return [...new Set(picks)];
}

/* ------------------------------------------------------------------ language fields */

/** "Yeniseian * Ketic * Ket" → "Yeniseian, Ketic". */
export function languageFamily(field: string | undefined): string | undefined {
  if (!field) return undefined;
  const parts = field
    .split(/\s*[*•>]\s*|\s{2,}/)
    .map((p) => cleanInline(p).replace(/\(.*?\)/g, "").trim())
    .filter((p) => p.length > 0 && !/^(?:proposed|disputed)/i.test(p));
  if (parts.length === 0) return undefined;
  if (/isolate/i.test(parts[0])) return "Language isolate";
  if (/primary language famil|independent (?:language )?famil/i.test(parts[0])) return "Independent language family";
  return parts.slice(0, 2).join(", ");
}

/** "<30(2024)[2] 153 (2020 census)[3]" → "<30 (2024); 153 (2020 census)". */
export function speakersNote(field: string | undefined): string | undefined {
  if (!field) return undefined;
  const cleaned = cleanInline(field)
    .replace(/(\S)\(/g, "$1 (")
    .replace(/\)\s+(?=[<>~≈c\d])/g, "); ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned.length > 0 && cleaned.length <= 200 ? cleaned : undefined;
}

/** "Latin (Cyrillic formerly)" / "Cyrillic * Latin" → ["Latin", "Cyrillic"]. */
export function writingSystems(field: string | undefined): string[] {
  if (!field) return [];
  return [
    ...new Set(
      field
        .split(/\s*[*•,;]\s*|\s+and\s+|\|/)
        .map((p) => cleanInline(p).replace(/\(.*?\)/g, "").replace(/\bscript\b|\balphabet\b/gi, "").trim())
        .filter((p) => p.length > 1 && p.length < 30 && !/^(?:none|unwritten|formerly)$/i.test(p)),
    ),
  ].slice(0, 3);
}

/* ------------------------------------------------------------------ Wikidata */

export interface WikidataSnak {
  snaktype: string;
  datavalue?: { type: string; value: unknown };
}

export interface WikidataClaim {
  mainsnak: WikidataSnak;
  rank: "preferred" | "normal" | "deprecated";
  qualifiers?: Record<string, WikidataSnak[]>;
}

export interface WikidataEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, WikidataClaim[]>;
  sitelinks?: Record<string, { title: string }>;
}

function liveClaims(entity: WikidataEntity | undefined, property: string): WikidataClaim[] {
  const claims = (entity?.claims?.[property] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak.snaktype === "value");
  const preferred = claims.filter((c) => c.rank === "preferred");
  return preferred.length ? [...preferred, ...claims.filter((c) => c.rank !== "preferred")] : claims;
}

export function claimIds(entity: WikidataEntity | undefined, property: string): string[] {
  return liveClaims(entity, property)
    .map((c) => (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id)
    .filter((id): id is string => Boolean(id));
}

export function claimStrings(entity: WikidataEntity | undefined, property: string): string[] {
  return liveClaims(entity, property)
    .map((c) => {
      const v = c.mainsnak.datavalue?.value;
      if (typeof v === "string") return v;
      if (v && typeof v === "object" && "text" in v) return String((v as { text: string }).text);
      return undefined;
    })
    .filter((s): s is string => Boolean(s));
}

export interface WikidataYear {
  year: number;
  /** Wikidata precision: 6 millennium, 7 century, 8 decade, 9 year, 10 month, 11 day. */
  precision: number;
}

export function parseWikidataTime(value: unknown): WikidataYear | undefined {
  const v = value as { time?: string; precision?: number } | undefined;
  const m = v?.time ? /^([+-])(\d+)-/.exec(v.time) : null;
  if (!m) return undefined;
  const year = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  if (!Number.isFinite(year) || year === 0) return undefined;
  return { year, precision: v?.precision ?? 9 };
}

export function claimYears(entity: WikidataEntity | undefined, property: string): WikidataYear[] {
  return liveClaims(entity, property)
    .map((c) => parseWikidataTime(c.mainsnak.datavalue?.value))
    .filter((y): y is WikidataYear => Boolean(y));
}

export function claimCoordinate(entity: WikidataEntity | undefined): { lat: number; lng: number } | undefined {
  const v = liveClaims(entity, "P625")[0]?.mainsnak.datavalue?.value as { latitude?: number; longitude?: number; globe?: string } | undefined;
  if (!v || typeof v.latitude !== "number" || typeof v.longitude !== "number") return undefined;
  if (v.globe && !v.globe.endsWith("/Q2")) return undefined; // Earth only
  return { lat: v.latitude, lng: v.longitude };
}

/** Value ids of a property together with the year of a time qualifier (e.g. P1435 with P580). */
export function claimIdsWithYear(entity: WikidataEntity | undefined, property: string, qualifier = "P580"): Array<{ id: string; year: number | undefined }> {
  const out: Array<{ id: string; year: number | undefined }> = [];
  for (const c of liveClaims(entity, property)) {
    const id = (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id;
    if (id) out.push({ id, year: parseWikidataTime(c.qualifiers?.[qualifier]?.[0]?.datavalue?.value)?.year });
  }
  return out;
}

/** Integer quantity of a property with its point-in-time (P585) qualifier, e.g. P1098 speakers. */
export function claimQuantities(entity: WikidataEntity | undefined, property: string): Array<{ amount: number; year: number | undefined }> {
  const out: Array<{ amount: number; year: number | undefined }> = [];
  for (const c of liveClaims(entity, property)) {
    const v = c.mainsnak.datavalue?.value as { amount?: string } | undefined;
    const amount = v?.amount ? Number(v.amount) : NaN;
    if (Number.isFinite(amount)) out.push({ amount, year: parseWikidataTime(c.qualifiers?.P585?.[0]?.datavalue?.value)?.year });
  }
  return out;
}

export function label(entity: WikidataEntity | undefined, lang = "en"): string | undefined {
  return entity?.labels?.[lang]?.value;
}

/** Formats a year for labels: negative years as BCE, coarse precisions with "c.". */
export function formatYear(y: WikidataYear | number): string {
  const { year, precision } = typeof y === "number" ? { year: y, precision: 9 } : y;
  const text = year < 0 ? `${Math.abs(year)} BCE` : String(year);
  return precision < 9 ? `c. ${text}` : text;
}
