import { Award } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecordCard } from "@/components/record/RecordCard";
import { Badge } from "@/components/ui/Badge";
import { Container, EmptyState, SectionHeading } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { format, formatDate } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getContributor } from "@/server/community";

export async function generateMetadata({ params }: PageProps<"/contributors/[id]">): Promise<Metadata> {
  const { id } = await params;
  const data = await getContributor(id, null);
  return { title: data?.user.name ?? "Contributor" };
}

export default async function ContributorPage({ params }: PageProps<"/contributors/[id]">) {
  const { id } = await params;
  const { t, locale } = await getI18n();
  const data = await getContributor(id, await getViewer());
  if (!data) notFound();
  const { user, reputation, contributions, reviews, institution } = data;
  return (
    <Container className="py-12">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.roles[user.role]}</p>
          <h1 className="mt-2 font-display text-5xl font-semibold text-mist-50">{user.name}</h1>
          <p className="mt-2 text-sm text-mist-400">
            {[user.affiliation, institution?.name].filter(Boolean).join(" · ")} {format(t.community.joined, { date: formatDate(user.createdAt, locale) })}
          </p>
          {user.bio && <p className="mt-3 max-w-2xl text-mist-300">{user.bio}</p>}
          {user.isDemo && (
            <Badge tone="amber" className="mt-3">
              {t.community.demoAccount}
            </Badge>
          )}
        </div>
        <div className="panel px-6 py-4 text-right">
          <p className="font-display text-5xl text-mist-50">{reputation.score}</p>
          <p className="text-xs tracking-wide text-mist-400 uppercase">
            {t.community.reputation} · {t.community.levels[reputation.level]}
          </p>
        </div>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section>
          <SectionHeading title={t.community.history} />
          {contributions.length === 0 ? (
            <EmptyState title={t.common.noResults} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {contributions.map((r) => (
                <RecordCard key={r.id} record={r} t={t} locale={locale} />
              ))}
            </div>
          )}
        </section>
        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="eyebrow mb-3">{t.community.breakdown}</h2>
            <table className="w-full text-sm">
              <tbody>
                {reputation.breakdown.map((b) => (
                  <tr key={b.key} className="border-b border-white/[0.05] last:border-0">
                    <td className="py-2 pr-2 text-mist-300">{t.community.breakdownLabels[b.key]}</td>
                    <td className="py-2 text-right font-mono text-mist-400">{b.count}</td>
                    <td className={`py-2 pl-3 text-right font-mono ${b.points < 0 ? "text-[#ff8aa0]" : "text-mist-50"}`}>{b.points > 0 ? `+${b.points}` : b.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs leading-relaxed text-mist-500">{t.community.reputationHelp}</p>
          </section>
          <section className="panel p-5">
            <h2 className="eyebrow mb-3">{t.community.badges}</h2>
            {reputation.badges.length === 0 ? (
              <p className="text-sm text-mist-500">—</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {reputation.badges.map((b) => (
                  <li key={b}>
                    <Badge tone="emerald">
                      <Award className="h-3.5 w-3.5" aria-hidden />
                      {t.community.badgeNames[b]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel p-5">
            <h2 className="eyebrow mb-3">{t.dashboard.reviews}</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-mist-500">{t.community.noReviewsYet}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <Link href={`/archive/${r.slug}`} className="text-mist-100 hover:underline">
                      {r.title}
                    </Link>
                    <span className="block text-xs text-mist-500">
                      {r.decision === "approve" ? t.review.approve : r.decision === "dispute" ? t.review.dispute : t.review.requestChanges} · {formatDate(r.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Container>
  );
}
