/**
 * Reputation is earned through verified work and careful review, never through volume.
 * Unverified uploads earn nothing; disputed work and upheld reports cost points.
 */
export interface ContributionStats {
  totalContributions: number;
  communityVerified: number;
  expertVerified: number;
  disputed: number;
  sourcesCited: number;
  reviewsGiven: number;
  lexiconVerified: number;
  upheldReports: number;
}

export const REPUTATION_RULES = {
  communityVerified: { points: 10 },
  expertVerified: { points: 25 },
  disputed: { points: -15 },
  sourcesCited: { points: 1, cap: 20 },
  reviewsGiven: { points: 2, cap: 40 },
  lexiconVerified: { points: 4 },
  upheldReports: { points: -20 },
} as const;

export type ReputationLevel = "newcomer" | "contributor" | "keeper" | "guardian";
export type BadgeCode = "first_verified" | "expert_verified" | "reviewer" | "language_keeper" | "source_minded";

export interface Reputation {
  score: number;
  level: ReputationLevel;
  breakdown: Array<{ key: keyof typeof REPUTATION_RULES; count: number; points: number }>;
  badges: BadgeCode[];
}

export function computeReputation(stats: ContributionStats): Reputation {
  const breakdown = (Object.keys(REPUTATION_RULES) as Array<keyof typeof REPUTATION_RULES>).map((key) => {
    const rule = REPUTATION_RULES[key];
    const count = stats[key];
    const raw = count * rule.points;
    const points = "cap" in rule ? Math.min(raw, rule.cap) : raw;
    return { key, count, points };
  });
  const score = Math.max(0, breakdown.reduce((sum, b) => sum + b.points, 0));
  const level: ReputationLevel = score >= 200 ? "guardian" : score >= 80 ? "keeper" : score >= 20 ? "contributor" : "newcomer";
  const badges: BadgeCode[] = [];
  if (stats.communityVerified + stats.expertVerified >= 1) badges.push("first_verified");
  if (stats.expertVerified >= 1) badges.push("expert_verified");
  if (stats.reviewsGiven >= 10) badges.push("reviewer");
  if (stats.lexiconVerified >= 5) badges.push("language_keeper");
  if (stats.sourcesCited >= 10) badges.push("source_minded");
  return { score, level, breakdown, badges };
}
