import { and, desc, eq, inArray } from "drizzle-orm";
import { aiSafeRecordsWhere } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { edges, records, type EvidenceItem } from "@/lib/db/schema";

export interface Discovery {
  id: string;
  confidence: number;
  uncertainty: "confirmed" | "probable" | "speculative";
  status: string;
  evidence: EvidenceItem[];
  createdAt: Date;
  a: { id: string; slug: string; title: string; dimension: (typeof records.$inferSelect)["dimension"]; countryCode: string | null };
  b: { id: string; slug: string; title: string; dimension: (typeof records.$inferSelect)["dimension"]; countryCode: string | null };
}

/** Engine proposals between public records, strongest and most cross-cutting first. */
export async function getDiscoveries(options: { status?: "proposed" | "accepted" | "rejected"; limit?: number } = {}): Promise<Discovery[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(edges)
    .where(and(eq(edges.provenance, "engine"), eq(edges.sourceType, "record"), eq(edges.targetType, "record"), eq(edges.status, options.status ?? "proposed")))
    .orderBy(desc(edges.confidence))
    .limit(200);
  const ids = [...new Set(rows.flatMap((r) => [r.sourceId, r.targetId]))];
  if (!ids.length) return [];
  const recs = await db
    .select({ id: records.id, slug: records.slug, title: records.title, dimension: records.dimension, countryCode: records.countryCode })
    .from(records)
    .where(and(inArray(records.id, ids), aiSafeRecordsWhere()));
  const byId = new Map(recs.map((r) => [r.id, r]));
  return rows
    .filter((r) => byId.has(r.sourceId) && byId.has(r.targetId))
    .map((r) => {
      const a = byId.get(r.sourceId)!;
      const b = byId.get(r.targetId)!;
      return {
        id: r.id,
        confidence: r.confidence,
        uncertainty: r.uncertainty as Discovery["uncertainty"],
        status: r.status,
        evidence: r.evidence,
        createdAt: r.createdAt,
        a,
        b,
      };
    })
    .sort((x, y) => Number(y.a.dimension !== y.b.dimension) - Number(x.a.dimension !== x.b.dimension) || y.confidence - x.confidence)
    .slice(0, options.limit ?? 12);
}
