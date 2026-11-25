import type { Viewer } from "./access/policy";
import type { Database } from "./db/client";
import { auditLog } from "./db/schema";

export interface AuditEntry {
  action: string;
  subjectType?: string;
  subjectId?: string;
  details?: Record<string, unknown>;
}

/** Records every write. Agents acting through API keys are logged as api_key actors. */
export async function audit(db: Database, viewer: Viewer | null, entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorType: viewer ? (viewer.apiKeyScopes ? "api_key" : "user") : "system",
    actorId: viewer?.id ?? null,
    action: entry.action,
    subjectType: entry.subjectType ?? null,
    subjectId: entry.subjectId ?? null,
    details: entry.details ?? null,
  });
  console.info(JSON.stringify({ level: "info", event: "audit", action: entry.action, subject: entry.subjectId, actor: viewer?.id ?? "system" }));
}
