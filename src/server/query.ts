import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { tokenize } from "@/lib/text";

/**
 * Builds a PostgreSQL tsquery string from free text. Tokens are restricted to letters
 * and digits (any script), so the result is always syntactically valid and safe to pass
 * as a bound parameter. Each token is prefix-matched.
 */
export function buildTsQuery(text: string, mode: "and" | "or" = "and", maxTerms = 12): string | null {
  const tokens = [...new Set(tokenize(text))].filter((t) => t.length > 1 || /\p{N}/u.test(t)).slice(0, maxTerms);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(mode === "and" ? " & " : " | ");
}

export function ftsMatch(column: SQLWrapper, tsquery: string): SQL {
  return sql`to_tsvector('simple', ${column}) @@ to_tsquery('simple', ${tsquery})`;
}

export function ftsRank(column: SQLWrapper, tsquery: string): SQL<number> {
  return sql<number>`ts_rank(to_tsvector('simple', ${column}), to_tsquery('simple', ${tsquery}))`;
}

/** Trigram word similarity for typo tolerance ("Samarqand" → "Samarkand"). */
export function fuzzyMatch(query: string, column: SQLWrapper, threshold = 0.45): SQL {
  return sql`word_similarity(${query}, ${column}) > ${threshold}`;
}

export function fuzzyScore(query: string, column: SQLWrapper): SQL<number> {
  return sql<number>`word_similarity(${query}, ${column})`;
}
