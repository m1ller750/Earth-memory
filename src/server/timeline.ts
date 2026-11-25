import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { visibleRecordsWhere } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { ecosystemObservations, ecosystems, records } from "@/lib/db/schema";

export interface TimelineRecord {
  id: string;
  slug: string;
  title: string;
  dimension: (typeof records.$inferSelect)["dimension"];
  kind: string;
  start: number;
  end: number;
  countryCode: string | null;
  countryCodes: string[];
  lat: number | null;
  lng: number | null;
  origin: string;
}

export interface TimelineObservation {
  id: string;
  ecosystemSlug: string;
  ecosystemName: string;
  year: number;
  yearEnd: number | null;
  title: string;
  reliability: string;
}

export async function getTimelineRecords(viewer: Viewer | null): Promise<TimelineRecord[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: records.id,
      slug: records.slug,
      title: records.title,
      dimension: records.dimension,
      kind: records.kind,
      start: records.periodStart,
      end: records.periodEnd,
      countryCode: records.countryCode,
      countryCodes: records.countryCodes,
      lat: records.lat,
      lng: records.lng,
      origin: records.origin,
    })
    .from(records)
    .where(and(visibleRecordsWhere(viewer), isNotNull(records.periodStart)))
    .orderBy(asc(records.periodStart));
  return rows.map((r) => ({ ...r, start: r.start!, end: r.end ?? r.start! }));
}

export async function getTimelineObservations(): Promise<TimelineObservation[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: ecosystemObservations.id,
      ecosystemSlug: ecosystems.slug,
      ecosystemName: ecosystems.name,
      year: ecosystemObservations.year,
      yearEnd: ecosystemObservations.yearEnd,
      title: ecosystemObservations.title,
      reliability: ecosystemObservations.reliability,
    })
    .from(ecosystemObservations)
    .innerJoin(ecosystems, eq(ecosystems.id, ecosystemObservations.ecosystemId))
    .orderBy(asc(ecosystemObservations.year));
  return rows;
}
