/** Text helpers shared by search, slugs and the connection engine. */

/** Removes combining marks: "Ōlelo" → "Olelo", "Kristiņa" → "Kristina". */
export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/** Lower-cases, strips diacritics and apostrophe-like letters (ʻokina, ʼ) for matching. */
export function foldForSearch(input: string): string {
  return stripDiacritics(input)
    .replace(/[ʻʼ'’`ʽ]/g, "")
    .toLowerCase();
}

type Part = string | null | undefined | ReadonlyArray<string | null | undefined>;

/**
 * Builds the text indexed by PostgreSQL full-text search. The original text is kept
 * (so native scripts match) and a folded copy is appended when it differs, so
 * "olelo hawaii" finds "ʻŌlelo Hawaiʻi".
 */
export function buildSearchText(...parts: Part[]): string {
  const flat = parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const folded = foldForSearch(flat);
  return folded === flat.toLowerCase() ? flat : `${flat} ${folded}`;
}

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h", ә: "a", ө: "o", ү: "u", ұ: "u",
  ң: "ng", һ: "h", і: "i", ҷ: "j", ӣ: "i", ӯ: "u", є: "ye", ї: "yi", ґ: "g",
};

export function transliterate(input: string): string {
  return input
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      return lower in CYRILLIC ? CYRILLIC[lower] : ch;
    })
    .join("");
}

/** URL slug from any script; never empty. */
/* Latin letters that Unicode normalisation does not decompose into a base letter. */
const LATIN_EXTRA: Record<string, string> = { ł: "l", Ł: "L", ø: "o", Ø: "O", đ: "d", Đ: "D", ð: "d", Ð: "D", þ: "th", Þ: "Th", æ: "ae", Æ: "Ae", œ: "oe", Œ: "Oe", ß: "ss", ı: "i" };

export function slugify(input: string, maxLength = 72): string {
  const slug = stripDiacritics(transliterate(input))
    .replace(/[łŁøØđĐðÐþÞæÆœŒßı]/g, (c) => LATIN_EXTRA[c] ?? c)
    .replace(/['’ʻʼ`]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "memory";
}

/** Splits user text into searchable terms (letters and digits in any script). */
export function tokenize(input: string): string[] {
  return foldForSearch(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}
