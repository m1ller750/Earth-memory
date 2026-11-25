import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { Role, Sensitivity, Visibility } from "../db/schema";
import { records } from "../db/schema";

/**
 * Access policy: the single source of truth for who may see and do what.
 * Pages, API routes, AI retrieval and the MCP server all go through these functions.
 */

export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: Role;
  isDemo: boolean;
  communities: Array<{ id: string; role: "member" | "steward" }>;
  /** Set when the request is authenticated with an API key rather than a session. */
  apiKeyScopes?: string[];
}

export type Permission =
  | "record:create"
  | "record:edit:own"
  | "record:edit:any"
  | "record:restrict"
  | "review:community"
  | "review:expert"
  | "edge:review"
  | "report:create"
  | "report:resolve"
  | "lexicon:create"
  | "collection:create"
  | "apikey:create"
  | "ai:annotate"
  | "ai:review"
  | "user:manage";

const CONTRIBUTOR: Permission[] = [
  "record:create",
  "record:edit:own",
  "review:community",
  "report:create",
  "lexicon:create",
  "collection:create",
  "apikey:create",
  "ai:annotate",
];

const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  contributor: new Set(CONTRIBUTOR),
  expert: new Set<Permission>([...CONTRIBUTOR, "review:expert", "edge:review", "ai:review"]),
  moderator: new Set<Permission>([...CONTRIBUTOR, "record:edit:any", "record:restrict", "report:resolve", "ai:review"]),
  admin: new Set<Permission>([
    ...CONTRIBUTOR,
    "record:edit:any",
    "record:restrict",
    "review:expert",
    "edge:review",
    "report:resolve",
    "ai:review",
    "user:manage",
  ]),
};

/** Scopes an API key may carry and the permissions each one unlocks. */
export const API_SCOPES = {
  read: [] as Permission[],
  contribute: ["record:create", "lexicon:create", "report:create"] as Permission[],
  verify: ["review:community", "review:expert"] as Permission[],
} as const;
export type ApiScope = keyof typeof API_SCOPES;

export function can(viewer: Viewer | null | undefined, permission: Permission): boolean {
  if (!viewer) return false;
  if (!PERMISSIONS[viewer.role].has(permission)) return false;
  if (viewer.apiKeyScopes) {
    return viewer.apiKeyScopes.some((scope) => (API_SCOPES[scope as ApiScope] ?? []).includes(permission));
  }
  return true;
}

export interface AccessControlled {
  visibility: Visibility;
  sensitivity: Sensitivity;
  contributorId: string | null;
  communityId: string | null;
}

function membership(viewer: Viewer, communityId: string | null) {
  return communityId ? viewer.communities.find((c) => c.id === communityId) : undefined;
}

/** Whether a viewer may read a record. Sacred knowledge is always treated as restricted. */
export function canViewRecord(viewer: Viewer | null | undefined, record: AccessControlled): boolean {
  return effectiveCheck(viewer, record, effectiveVisibility(record));
}

/** Sacred knowledge shared publicly or with the whole community is narrowed to stewards. */
export function effectiveVisibility(record: Pick<AccessControlled, "visibility" | "sensitivity">): Visibility {
  if (record.sensitivity === "sacred" && (record.visibility === "public" || record.visibility === "community")) return "restricted";
  return record.visibility;
}

function effectiveCheck(viewer: Viewer | null | undefined, record: AccessControlled, effective: Visibility): boolean {
  if (effective === "public") return true;
  if (!viewer) return false;
  if (viewer.apiKeyScopes) return false; // agents only ever see public material
  if (record.contributorId === viewer.id) return true;
  if (viewer.role === "admin") return true;
  const member = membership(viewer, record.communityId);
  switch (effective) {
    case "community":
      return Boolean(member) || viewer.role === "moderator";
    case "restricted":
      return member?.role === "steward";
    case "private":
      return false;
  }
}

/** SQL condition equivalent to canViewRecord, for list queries. */
export function visibleRecordsWhere(viewer: Viewer | null | undefined): SQL {
  const publicRecords = and(eq(records.visibility, "public"), ne(records.sensitivity, "sacred"))!;
  if (!viewer || viewer.apiKeyScopes) return publicRecords;
  if (viewer.role === "admin") return sql`true`;
  const memberOf = viewer.communities.map((c) => c.id);
  const stewardOf = viewer.communities.filter((c) => c.role === "steward").map((c) => c.id);
  const conditions: SQL[] = [publicRecords, eq(records.contributorId, viewer.id)];
  if (memberOf.length) conditions.push(and(eq(records.visibility, "community"), ne(records.sensitivity, "sacred"), inArray(records.communityId, memberOf))!);
  if (viewer.role === "moderator") conditions.push(and(eq(records.visibility, "community"), ne(records.sensitivity, "sacred"))!);
  if (stewardOf.length) conditions.push(and(inArray(records.visibility, ["community", "restricted", "public"]), inArray(records.communityId, stewardOf))!);
  return or(...conditions)!;
}

/** Records that may be sent to an AI model or exposed to agents: public and not sensitive at all. */
export function aiSafeRecordsWhere(): SQL {
  return and(eq(records.visibility, "public"), eq(records.sensitivity, "none"))!;
}

export function isAiSafe(record: Pick<AccessControlled, "visibility" | "sensitivity">): boolean {
  return record.visibility === "public" && record.sensitivity === "none";
}

export function canEditRecord(viewer: Viewer | null | undefined, record: Pick<AccessControlled, "contributorId">): boolean {
  if (!viewer) return false;
  if (can(viewer, "record:edit:any")) return true;
  return can(viewer, "record:edit:own") && record.contributorId === viewer.id;
}

export function reviewerRoleFor(viewer: Viewer): "expert" | "community" {
  return can(viewer, "review:expert") ? "expert" : "community";
}

export function canReviewRecord(viewer: Viewer | null | undefined, record: Pick<AccessControlled, "contributorId">): boolean {
  if (!viewer) return false;
  if (record.contributorId === viewer.id) return false;
  return can(viewer, "review:community") || can(viewer, "review:expert");
}
