"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/access/policy";
import { audit } from "@/lib/audit";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { records, reports } from "@/lib/db/schema";
import type { ActionState } from "./records";

const schema = z.object({
  reportId: z.uuid(),
  decision: z.enum(["resolve", "dismiss", "restrict"]),
  note: z.string().trim().max(1000).default(""),
});

export async function resolveReportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "report:resolve")) return { error: "forbidden" };
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "validation" };
  const db = await getDb();
  const [report] = await db.select().from(reports).where(eq(reports.id, parsed.data.reportId)).limit(1);
  if (!report || report.status !== "open") return { error: "not_found" };

  if (parsed.data.decision === "restrict" && report.subjectType === "record") {
    if (!can(viewer, "record:restrict")) return { error: "forbidden" };
    await db.update(records).set({ visibility: "restricted", updatedAt: new Date() }).where(eq(records.id, report.subjectId));
  }
  await db
    .update(reports)
    .set({ status: parsed.data.decision === "dismiss" ? "dismissed" : "resolved", resolutionNote: parsed.data.note, resolvedBy: viewer.id, resolvedAt: new Date() })
    .where(eq(reports.id, report.id));
  await audit(db, viewer, { action: `report.${parsed.data.decision}`, subjectType: report.subjectType, subjectId: report.subjectId, details: { reportId: report.id } });
  refresh();
  return { ok: true };
}
