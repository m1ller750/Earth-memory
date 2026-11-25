import { and, desc, inArray, ne, or, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { EvidenceList } from "@/components/connections/Evidence";
import { DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { ConnectionDecision } from "@/components/record/RecordActions";
import { OriginBadge, UncertaintyBadge, VerificationBadge } from "@/components/ui/Badge";
import { Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui/layout";
import { can, visibleRecordsWhere } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { records } from "@/lib/db/schema";
import { getI18n } from "@/lib/i18n/server";
import { getDiscoveries } from "@/server/connections";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.review.title };
}

export default async function ReviewPage() {
  const { t } = await getI18n();
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/review");
  const db = await getDb();
  const pending = await db
    .select({ id: records.id, slug: records.slug, title: records.title, dimension: records.dimension, verification: records.verification, origin: records.origin, summary: records.summary })
    .from(records)
    .where(and(visibleRecordsWhere(viewer), inArray(records.verification, ["unverified", "disputed"]), or(isNull(records.contributorId), ne(records.contributorId, viewer.id))))
    .orderBy(desc(records.verification), desc(records.createdAt))
    .limit(40);
  const isExpert = can(viewer, "edge:review");
  const proposals = isExpert ? await getDiscoveries({ limit: 20 }) : [];

  return (
    <Container>
      <PageHeader eyebrow={t.nav.review} title={t.review.title} lede={t.review.lede} />
      <section>
        <SectionHeading title={t.review.pendingRecords} lede={isExpert ? t.review.expertBadge : t.review.communityBadge} />
        {pending.length === 0 ? (
          <EmptyState title={t.review.noPending} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {pending.map((r) => (
              <li key={r.id}>
                <Link href={`/archive/${r.slug}#verification`} className="panel flex gap-3 p-4 hover:border-white/20">
                  <DimensionGlyph dimension={r.dimension} className="mt-1 h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-mist-50">{r.title}</span>
                    <span className="mt-1 line-clamp-2 block text-sm text-mist-400">{r.summary}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <VerificationBadge status={r.verification} t={t} />
                      <OriginBadge origin={r.origin} t={t} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <SectionHeading title={t.review.pendingConnections} lede={isExpert ? undefined : t.review.expertsOnly} />
        {isExpert &&
          (proposals.length === 0 ? (
            <EmptyState title={t.review.noPending} />
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {proposals.map((p) => (
                <li key={p.id} className="panel p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <UncertaintyBadge level={p.uncertainty} t={t} />
                    <span className="font-mono text-xs text-mist-400">{p.confidence.toFixed(2)}</span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-mist-50">
                    <Link href={`/archive/${p.a.slug}`} className="hover:underline">
                      {p.a.title}
                    </Link>{" "}
                    ↔{" "}
                    <Link href={`/archive/${p.b.slug}`} className="hover:underline">
                      {p.b.title}
                    </Link>
                  </p>
                  <EvidenceList evidence={p.evidence} limit={4} className="mt-3" />
                  <div className="mt-4 border-t border-white/[0.06] pt-3">
                    <ConnectionDecision recordId={p.a.id} otherId={p.b.id} />
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </section>
    </Container>
  );
}
