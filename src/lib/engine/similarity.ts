import { foldForSearch } from "../text";

/**
 * Lexical fingerprints for the Memory Connection Engine and duplicate detection.
 *
 * Each text is mapped to a fixed-size vector by hashing character trigrams and
 * content words (feature hashing), then L2-normalized. Cosine similarity between
 * fingerprints measures *lexical* overlap. It is not semantic understanding, and
 * the UI labels it as text similarity.
 */
export const FINGERPRINT_DIMENSIONS = 256;

const STOPWORDS = new Set(
  (
    "the and for with from that this was were are its into over also has have had been which their they them his her " +
    "who whom whose what when where while about after before between during under through than then there these those " +
    "such some most more many much other only very can could would should may might will shall not but nor yet one two " +
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет " +
    "о из ему теперь когда даже ну ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей " +
    "может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот"
  ).split(" "),
);

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function fingerprint(text: string): number[] {
  const vector = new Float64Array(FINGERPRINT_DIMENSIONS);
  const normalized = foldForSearch(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!normalized) return Array.from(vector);

  const add = (feature: string, weight: number) => {
    const h = fnv1a(feature);
    // The sign bit reduces bias from hash collisions.
    vector[h % FINGERPRINT_DIMENSIONS] += h & 0x80000000 ? -weight : weight;
  };

  const padded = ` ${normalized} `;
  for (let i = 0; i + 3 <= padded.length; i++) add(padded.slice(i, i + 3), 1);
  for (const word of normalized.split(" ")) {
    if (word.length > 2 && !STOPWORDS.has(word)) add(`w:${word}`, 2.5);
  }

  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (v) => Math.round((v / norm) * 10000) / 10000);
}

export function cosine(a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** Text used to fingerprint a record. Titles count twice because they are the most distinctive. */
export function recordFingerprintText(r: { title: string; summary?: string | null; body?: string | null; tags?: readonly string[] | null }): string {
  return [r.title, r.title, r.summary ?? "", (r.tags ?? []).join(" "), (r.body ?? "").slice(0, 1200)].join(" ");
}
