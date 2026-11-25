import type { Dimension, EvidenceItem } from "../db/schema";
import { haversineKm } from "../geo/distance";
import { cosine } from "./similarity";

/**
 * Memory Connection Engine.
 *
 * Scores how strongly two archive records are related from explainable signals.
 * Every point of the score is backed by an evidence line shown to the user. The
 * engine never labels a link "confirmed": that label is reserved for links a
 * human expert has accepted.
 */

export interface EngineRecord {
  id: string;
  slug: string;
  title: string;
  dimension: Dimension;
  countryCode: string | null;
  countryCodes: string[];
  lat: number | null;
  lng: number | null;
  periodStart: number | null;
  periodEnd: number | null;
  tags: string[];
  languageId: string | null;
  ecosystemId: string | null;
  speciesId: string | null;
  entityIds: string[];
  fingerprint: number[] | null;
}

export interface EngineContext {
  /** Number of records linked to each entity (for inverse-frequency weighting). */
  entityFrequency: Map<string, number>;
  entityNames: Map<string, string>;
  subjectNames: Map<string, string>; // language / ecosystem / species id → name
  totalRecords: number;
}

export type EngineUncertainty = "probable" | "speculative";

export interface ScoredConnection {
  sourceId: string;
  targetId: string;
  score: number;
  uncertainty: EngineUncertainty;
  evidence: EvidenceItem[];
  crossDimension: boolean;
}

/** Tags too generic to count as evidence. */
const GENERIC_TAGS = new Set(["world heritage", "intangible heritage", "multinational", "demo", "memory", "city", "music", "craft"]);

export const ENGINE_WEIGHTS = {
  sharedEntityMax: 0.32,
  sharedEntityCap: 0.56,
  sameSubject: 0.3,
  near50: 0.2,
  near300: 0.12,
  near1000: 0.06,
  countryJaccard: 0.12,
  periodOverlap: 0.14,
  periodNear: 0.04,
  sharedTag: 0.06,
  sharedTagCap: 0.18,
  textFloor: 0.22,
  textScale: 0.6,
  textCap: 0.2,
} as const;

/** Minimum summed evidence weight for a proposal. */
export const PROPOSAL_THRESHOLD = 0.3;
/** Saturation of summed evidence into a 0–1 strength: 0.3 → 0.38, 0.6 → 0.62, 1.0 → 0.80, 1.5 → 0.91. */
const SATURATION = 1.6;
/** Strength from which an engine link is labelled "probable" (it also needs a shared entity or subject). */
export const PROBABLE_THRESHOLD = 0.6;

function formatYear(y: number): string {
  return y < 0 ? `${-y} BCE` : `${y}`;
}

function formatPeriod(start: number, end: number): string {
  return start === end ? formatYear(start) : `${formatYear(start)}–${formatYear(end)}`;
}

export function scorePair(a: EngineRecord, b: EngineRecord, ctx: EngineContext): ScoredConnection | null {
  if (a.id === b.id) return null;
  const evidence: EvidenceItem[] = [];
  let score = 0;
  const kinds = new Set<EvidenceItem["kind"]>();
  const push = (item: EvidenceItem) => {
    evidence.push(item);
    kinds.add(item.kind);
    score += item.weight ?? 0;
  };

  // 1. Shared knowledge-graph entities, weighted by rarity.
  const bEntities = new Set(b.entityIds);
  let entityScore = 0;
  for (const id of a.entityIds) {
    if (!bEntities.has(id)) continue;
    const df = Math.max(2, ctx.entityFrequency.get(id) ?? 2);
    const weight = Math.min(ENGINE_WEIGHTS.sharedEntityMax, (ENGINE_WEIGHTS.sharedEntityMax * Math.SQRT2) / Math.sqrt(df));
    const capped = Math.max(0, Math.min(weight, ENGINE_WEIGHTS.sharedEntityCap - entityScore));
    entityScore += capped;
    push({ kind: "shared_entity", detail: `Both are linked to “${ctx.entityNames.get(id) ?? "a shared entity"}”`, weight: round(capped) });
  }

  // 2. The same language, ecosystem or species.
  for (const key of ["languageId", "ecosystemId", "speciesId"] as const) {
    const id = a[key];
    if (id && id === b[key]) {
      push({ kind: "shared_entity", detail: `Both concern ${ctx.subjectNames.get(id) ?? "the same subject"}`, weight: ENGINE_WEIGHTS.sameSubject });
    }
  }

  // 3. Geography.
  if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
    const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
    if (km < 50) push({ kind: "geography", detail: `Located within ${Math.max(1, Math.round(km))} km of each other`, weight: ENGINE_WEIGHTS.near50 });
    else if (km < 300) push({ kind: "geography", detail: `Located about ${Math.round(km)} km apart`, weight: ENGINE_WEIGHTS.near300 });
    else if (km < 1000) push({ kind: "geography", detail: `Located about ${Math.round(km / 10) * 10} km apart`, weight: ENGINE_WEIGHTS.near1000 });
  }
  const aCountries = new Set(a.countryCodes.length ? a.countryCodes : a.countryCode ? [a.countryCode] : []);
  const bCountries = new Set(b.countryCodes.length ? b.countryCodes : b.countryCode ? [b.countryCode] : []);
  const sharedCountries = [...aCountries].filter((c) => bCountries.has(c));
  if (sharedCountries.length > 0) {
    const jaccard = sharedCountries.length / new Set([...aCountries, ...bCountries]).size;
    push({
      kind: "geography",
      detail: `Shared countries: ${sharedCountries.slice(0, 4).join(", ")}${sharedCountries.length > 4 ? "…" : ""}`,
      weight: round(ENGINE_WEIGHTS.countryJaccard * jaccard),
    });
  }

  // 4. Time.
  if (a.periodStart != null && b.periodStart != null) {
    const aEnd = a.periodEnd ?? a.periodStart;
    const bEnd = b.periodEnd ?? b.periodStart;
    const overlap = Math.min(aEnd, bEnd) - Math.max(a.periodStart, b.periodStart);
    if (overlap >= 0) {
      const shorter = Math.max(1, Math.min(aEnd - a.periodStart, bEnd - b.periodStart));
      const ratio = Math.min(1, (overlap + 1) / (shorter + 1));
      push({
        kind: "period",
        detail: `Overlapping periods (${formatPeriod(a.periodStart, aEnd)} and ${formatPeriod(b.periodStart, bEnd)})`,
        weight: round(ENGINE_WEIGHTS.periodOverlap * ratio),
      });
    } else if (-overlap <= 50) {
      push({ kind: "period", detail: `Periods within ${-overlap} years of each other`, weight: ENGINE_WEIGHTS.periodNear });
    }
  }

  // 5. Shared descriptive tags.
  const bTags = new Set(b.tags.map((t) => t.toLowerCase()));
  const sharedTags = a.tags.map((t) => t.toLowerCase()).filter((t) => bTags.has(t) && !GENERIC_TAGS.has(t));
  if (sharedTags.length > 0) {
    push({
      kind: "tag",
      detail: `Shared themes: ${sharedTags.slice(0, 4).join(", ")}`,
      weight: Math.min(ENGINE_WEIGHTS.sharedTagCap, sharedTags.length * ENGINE_WEIGHTS.sharedTag),
    });
  }

  // 6. Lexical text similarity.
  const similarity = cosine(a.fingerprint, b.fingerprint);
  if (similarity >= ENGINE_WEIGHTS.textFloor) {
    push({
      kind: "text",
      detail: `Similar wording (lexical similarity ${similarity.toFixed(2)})`,
      weight: round(Math.min(ENGINE_WEIGHTS.textCap, (similarity - ENGINE_WEIGHTS.textFloor) * ENGINE_WEIGHTS.textScale + 0.04)),
    });
  }

  const hasStrongSignal = kinds.has("shared_entity");
  if (score < PROPOSAL_THRESHOLD || (!hasStrongSignal && kinds.size < 2)) return null;
  // Evidence adds up with diminishing returns, so strong pairs stay distinguishable instead of all reaching 1.
  const strength = round(1 - Math.exp(-SATURATION * score));

  return {
    sourceId: a.id,
    targetId: b.id,
    score: strength,
    uncertainty: strength >= PROBABLE_THRESHOLD && hasStrongSignal ? "probable" : "speculative",
    evidence: evidence.sort((x, y) => (y.weight ?? 0) - (x.weight ?? 0)),
    crossDimension: a.dimension !== b.dimension,
  };
}

/** Ranks the strongest connections of one record against a candidate set. */
export function rankRelated(target: EngineRecord, candidates: EngineRecord[], ctx: EngineContext, limit = 8): ScoredConnection[] {
  return candidates
    .map((c) => scorePair(target, c, ctx))
    .filter((c): c is ScoredConnection => c !== null)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

/**
 * Scans all pairs and returns the strongest proposals, favouring links that cross
 * dimensions or countries ("hidden" connections a single-topic archive would miss).
 */
export function discoverAll(records: EngineRecord[], ctx: EngineContext, limit = 40): ScoredConnection[] {
  const found: ScoredConnection[] = [];
  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const scored = scorePair(records[i], records[j], ctx);
      if (scored) found.push(scored);
    }
  }
  const interest = (c: ScoredConnection) => c.score + (c.crossDimension ? 0.12 : 0);
  return found.sort((x, y) => interest(y) - interest(x)).slice(0, limit);
}

export function buildEngineContext(
  records: EngineRecord[],
  entityNames: Map<string, string>,
  subjectNames: Map<string, string>,
): EngineContext {
  const entityFrequency = new Map<string, number>();
  for (const r of records) for (const e of r.entityIds) entityFrequency.set(e, (entityFrequency.get(e) ?? 0) + 1);
  return { entityFrequency, entityNames, subjectNames, totalRecords: records.length };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
