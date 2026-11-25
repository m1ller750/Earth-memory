import type { IucnStatus, LanguageStatus } from "../db/schema";

/**
 * MEMORY ALERT: a transparent preservation-priority indicator.
 *
 * score = 100 × (0.45 · threat + 0.35 · documentation gap + 0.10 · single-source risk + 0.10 · verification gap)
 *
 * - threat: a documented category from a named external source (UNESCO Atlas, IUCN Red List,
 *   UNESCO Urgent Safeguarding List, documented ecosystem transformation).
 * - documentation gap: how little Earth Memory itself holds, relative to a target per subject type.
 * - single-source risk: knowledge that rests on at most one cited source.
 * - verification gap: share of linked records not yet verified.
 *
 * It describes the archive's coverage. It is not a prediction of extinction.
 */

export type AlertSubjectType = "language" | "tradition" | "ecosystem" | "species";
export type AlertLevel = "critical" | "high" | "elevated" | "watch";
export type AlertConfidence = "low" | "medium" | "high";

export const ALERT_WEIGHTS = { threat: 0.45, documentationGap: 0.35, singleSource: 0.1, verificationGap: 0.1 } as const;

export const LANGUAGE_THREAT: Record<LanguageStatus, number> = {
  critically_endangered: 1,
  severely_endangered: 0.85,
  extinct: 0.7,
  definitely_endangered: 0.65,
  vulnerable: 0.45,
  safe: 0.1,
};

export const IUCN_THREAT: Record<IucnStatus, number> = {
  CR: 1,
  EW: 0.9,
  EN: 0.8,
  VU: 0.6,
  DD: 0.5,
  NT: 0.35,
  EX: 0.3,
  LC: 0.1,
};

/** Documentation that would count as "well documented" inside Earth Memory, per subject type. */
export const DOCUMENTATION_TARGET: Record<AlertSubjectType, number> = {
  language: 40,
  tradition: 10,
  ecosystem: 12,
  species: 8,
};

export interface AlertInput {
  subjectType: AlertSubjectType;
  id: string;
  slug: string;
  name: string;
  href: string;
  lat: number | null;
  lng: number | null;
  countryCodes: string[];
  /** Threat on a 0–1 scale with a human-readable category and the source it comes from. */
  threat: { score: number; category: string; source: string };
  documentation: {
    linkedRecords: number;
    verifiedRecords: number;
    media: number;
    audio: number;
    lexicon: number;
    observations: number;
    sources: number;
  };
  flags?: { noFirstLanguageSpeakers?: boolean; urgentSafeguarding?: boolean; archiveAtRisk?: boolean };
}

export type MissingCode =
  | "no_audio"
  | "few_lexicon"
  | "no_oral_history"
  | "no_verified"
  | "single_source"
  | "no_media"
  | "no_observations"
  | "few_observations"
  | "no_practitioner_accounts"
  | "no_linked_records";

export type ActionCode =
  | "record_speakers"
  | "build_lexicon"
  | "collect_oral_histories"
  | "support_revitalization"
  | "digitize_archive"
  | "document_practitioners"
  | "add_media"
  | "add_sources"
  | "invite_review"
  | "monitor_observations"
  | "connect_organizations";

export interface AlertFactor {
  key: "threat" | "documentation_gap" | "single_source" | "verification_gap";
  /** Raw value on a 0–1 scale. */
  value: number;
  weight: number;
  /** Points added to the 0–100 score. */
  points: number;
  /** Values for the explanation template of this factor. */
  detail: Record<string, string | number>;
}

export interface MemoryAlert {
  subjectType: AlertSubjectType;
  id: string;
  slug: string;
  name: string;
  href: string;
  lat: number | null;
  lng: number | null;
  countryCodes: string[];
  score: number;
  level: AlertLevel;
  factors: AlertFactor[];
  missing: MissingCode[];
  actions: ActionCode[];
  confidence: AlertConfidence;
  threatCategory: string;
  threatSource: string;
  documentation: AlertInput["documentation"];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function documentationScore(type: AlertSubjectType, d: AlertInput["documentation"]): number {
  switch (type) {
    case "language":
      return d.linkedRecords * 2 + d.lexicon + d.audio * 3 + d.media;
    case "tradition":
      return d.linkedRecords + d.media * 2 + d.audio * 2;
    case "ecosystem":
      return d.observations + d.linkedRecords + d.media;
    case "species":
      return d.linkedRecords + d.media * 2;
  }
}

export function levelFor(score: number): AlertLevel {
  if (score >= 75) return "critical";
  if (score >= 58) return "high";
  if (score >= 40) return "elevated";
  return "watch";
}

export function computeAlert(input: AlertInput): MemoryAlert {
  const d = input.documentation;
  const threat = clamp01(input.threat.score);
  const docScore = documentationScore(input.subjectType, d);
  const target = DOCUMENTATION_TARGET[input.subjectType];
  const gap = clamp01(1 - docScore / target);
  const singleSource = d.sources <= 1 ? 1 : 0;
  const verificationGap = d.linkedRecords > 0 ? clamp01(1 - d.verifiedRecords / d.linkedRecords) : 1;

  const raw: Array<Omit<AlertFactor, "points">> = [
    { key: "threat", value: threat, weight: ALERT_WEIGHTS.threat, detail: { category: input.threat.category, source: input.threat.source } },
    { key: "documentation_gap", value: gap, weight: ALERT_WEIGHTS.documentationGap, detail: { have: docScore, target } },
    { key: "single_source", value: singleSource, weight: ALERT_WEIGHTS.singleSource, detail: { sources: d.sources } },
    { key: "verification_gap", value: verificationGap, weight: ALERT_WEIGHTS.verificationGap, detail: { verified: d.verifiedRecords, linked: d.linkedRecords } },
  ];
  const factors: AlertFactor[] = raw.map((f) => ({ ...f, value: round2(f.value), points: Math.round(f.value * f.weight * 1000) / 10 }));

  const score = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0) * 100);

  const missing: MissingCode[] = [];
  const actions: ActionCode[] = [];
  const add = <T>(list: T[], item: T) => {
    if (!list.includes(item)) list.push(item);
  };

  if (input.subjectType === "language") {
    if (d.audio === 0) {
      add(missing, "no_audio");
      add(actions, "record_speakers");
    }
    if (d.lexicon < 10) {
      add(missing, "few_lexicon");
      add(actions, "build_lexicon");
    }
    if (d.linkedRecords === 0) {
      add(missing, "no_oral_history");
      add(actions, "collect_oral_histories");
    }
    if (input.flags?.noFirstLanguageSpeakers) add(actions, "support_revitalization");
  }
  if (input.subjectType === "tradition") {
    if (d.media + d.audio === 0) {
      add(missing, "no_media");
      add(actions, "add_media");
    }
    if (d.linkedRecords < 2) {
      add(missing, "no_practitioner_accounts");
      add(actions, "document_practitioners");
    }
    if (input.flags?.archiveAtRisk) add(actions, "digitize_archive");
  }
  if (input.subjectType === "ecosystem") {
    if (d.observations === 0) add(missing, "no_observations");
    else if (d.observations < 4) add(missing, "few_observations");
    add(actions, "monitor_observations");
  }
  if (input.subjectType === "species") {
    if (d.linkedRecords === 0) add(missing, "no_linked_records");
    if (d.media === 0) {
      add(missing, "no_media");
      add(actions, "add_media");
    }
    add(actions, "monitor_observations");
  }
  if (singleSource) {
    add(missing, "single_source");
    add(actions, "add_sources");
  }
  if (d.verifiedRecords === 0) {
    add(missing, "no_verified");
    add(actions, "invite_review");
  }
  add(actions, "connect_organizations");

  const confidence: AlertConfidence = d.sources >= 3 && d.verifiedRecords > 0 ? "high" : d.sources >= 2 ? "medium" : "low";

  return {
    subjectType: input.subjectType,
    id: input.id,
    slug: input.slug,
    name: input.name,
    href: input.href,
    lat: input.lat,
    lng: input.lng,
    countryCodes: input.countryCodes,
    score,
    level: levelFor(score),
    factors,
    missing,
    actions,
    confidence,
    threatCategory: input.threat.category,
    threatSource: input.threat.source,
    documentation: d,
  };
}

export function rankAlerts(alerts: MemoryAlert[]): MemoryAlert[] {
  return [...alerts].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
