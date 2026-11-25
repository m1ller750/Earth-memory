import { desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ResolveReport } from "@/components/moderation/ResolveReport";
import { Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui/layout";
import { can } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { auditLog, records, reports, users } from "@/lib/db/schema";
import { formatDate } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.moderation.title };
}

export default async function ModerationPage() {
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/moderation");
  if (!can(viewer, "report:resolve")) {
    return (
      <Container className="py-20">
        <EmptyState title={t.errors.forbidden} />
      </Container>
    );
  }
  const db = await getDb();
  const open = await db
    .select({ report: reports, reporterName: users.name })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(desc(reports.createdAt))
    .limit(100);
  const recordIds = open.filter((r) => r.report.subjectType === "record").map((r) => r.report.subjectId);
  const subjects = recordIds.length ? await db.select({ id: records.id, slug: records.slug, title: records.title }).from(records).where(inArray(records.id, recordIds)) : [];
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const activity = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(30);

  return (
    <Container>
      <PageHeader eyebrow={t.nav.moderation} title={t.moderation.title} lede={t.moderation.lede} />
      <section>
        <SectionHeading title={`${t.moderation.open} · ${open.length}`} />
        {open.length === 0 ? (
          <EmptyState title={t.moderation.noReports} />
        ) : (
          <ul className="space-y-3">
            {open.map(({ report, reporterName }) => {
              const subject = byId.get(report.subjectId);
              return (
                <li key={report.id} className="panel p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold text-mist-50">
                      {t.report.reasons[report.reason as keyof typeof t.report.reasons] ?? report.reason}
                      {subject && (
                        <>
                          {" · "}
                          <Link href={`/archive/${subject.slug}`} className="text-aurora-cyan hover:underline">
                            {subject.title}
                          </Link>
                        </>
                      )}
                    </p>
                    <span className="text-xs text-mist-500">
                      {reporterName ?? "—"} · {formatDate(report.createdAt, locale)}
                    </span>
                  </div>
                  {report.details && <p className="mt-2 text-sm text-mist-300">{report.details}</p>}
                  <div className="mt-4">
                    <ResolveReport reportId={report.id} canRestrict={can(viewer, "record:restrict") && report.subjectType === "record"} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="mt-14">
        <SectionHeading title={t.moderation.audit} />
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {activity.map((a) => (
                <tr key={a.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-mist-500">{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td className="px-4 py-2.5 text-mist-300">{a.actorType}</td>
                  <td className="px-4 py-2.5 font-medium text-mist-100">{a.action}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-mist-500">{a.subjectType ? `${a.subjectType}:${a.subjectId?.slice(0, 8) ?? ""}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Container>
  );
}
