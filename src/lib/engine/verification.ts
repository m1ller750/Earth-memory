import type { Verification } from "../db/schema";

export interface ReviewInput {
  decision: "approve" | "request_changes" | "dispute";
  reviewerRole: "community" | "expert";
  createdAt: Date;
}

export const COMMUNITY_APPROVALS_REQUIRED = 2;

/**
 * Verification status from the full review history:
 * 1. The most recent expert decision wins when it approves (expert verified) or disputes (disputed).
 * 2. Otherwise disputes that are not outnumbered by approvals mark the record disputed.
 * 3. Otherwise two community approvals mark it community verified.
 */
export function computeVerification(reviews: ReviewInput[]): Verification {
  const expert = reviews.filter((r) => r.reviewerRole === "expert").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const latestExpert = expert[0];
  if (latestExpert?.decision === "approve") return "expert_verified";
  if (latestExpert?.decision === "dispute") return "disputed";

  const approvals = reviews.filter((r) => r.reviewerRole === "community" && r.decision === "approve").length;
  const disputes = reviews.filter((r) => r.decision === "dispute").length;
  if (disputes > 0 && disputes >= approvals) return "disputed";
  if (approvals >= COMMUNITY_APPROVALS_REQUIRED) return "community_verified";
  return "unverified";
}
