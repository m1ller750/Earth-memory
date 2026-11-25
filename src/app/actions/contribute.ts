"use server";

import { refresh } from "next/cache";
import { getViewer } from "@/lib/auth/session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { recordInputSchema } from "@/lib/validation/schemas";
import { ContributionError, createRecord } from "@/server/contributions";

export type ContributeResult =
  | { ok: true; slug: string }
  | { ok: false; error: "auth" | "rate_limited" | "validation" | "forbidden" | "community" | "server"; issues?: Array<{ path: string; message: string }>; message?: string };

export async function submitContributionAction(input: unknown): Promise<ContributeResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "auth" };
  if (!rateLimit(`write:${viewer.id}`, LIMITS.write.limit, LIMITS.write.windowMs).ok) return { ok: false, error: "rate_limited" };
  const parsed = recordInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  }
  try {
    const row = await createRecord(viewer, parsed.data);
    refresh();
    return { ok: true, slug: row.slug };
  } catch (error) {
    if (error instanceof ContributionError) return { ok: false, error: error.code, message: error.message };
    console.error(JSON.stringify({ level: "error", event: "contribute.failed", message: error instanceof Error ? error.message : String(error) }));
    return { ok: false, error: "server" };
  }
}
