import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard } from "@/components/alerts/AlertCard";
import { ObservationTimeline } from "@/components/living/ObservationTimeline";
import { RecordCard } from "@/components/record/RecordCard";
import { SourceList } from "@/components/record/Sources";
import { OriginBadge, UncertaintyBadge } from "@/components/ui/Badge";
import { Container, KeyValue, SectionHeading } from "@/components/ui/layout";
import { humanizeRelation, Prose } from "@/components/ui/Prose";
import { getViewer } from "@/lib/auth/session";
import { countryName } from "@/lib/geo/countries";
import { getI18n } from "@/lib/i18n/server";
import { getEcosystem } from "@/server/living";

export async function generateMetadata({ params }: PageProps<"/living-earth/ecosystems/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getEcosystem(slug, null);
  return { title: data?.ecosystem.name ?? "Ecosystem", description: data?.ecosystem.description };
}

export default async function EcosystemPage({ params }: PageProps<"/living-earth/ecosystems/[slug]">) {
  const { slug } = await params;
  const { t, locale } = await getI18n();
  const data = await getEcosystem(slug, await getViewer());
  if (!data) notFound();
  const { ecosystem: e, sources, observations, records, neighbours, alert, projects } = data;
  return (
    <Container>
      <Link href="/living-earth#ecosystems" className="mt-8 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.nav.living}
      </Link>
      <header className="mt-4 animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">{e.kind}</span>
          <OriginBadge origin={e.origin} t={t} />
        </div>
        <h1 className="mt-4 font-display text-5xl font-semibold text-mist-50 sm:text-6xl">{e.name}</h1>
        <p className="mt-2 text-lg text-dim-natural">{e.statusNote}</p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-12">
          <section className="panel p-6 sm:p-8">
            <Prose text={e.description} />
          </section>
          <section>
            <SectionHeading title={t.living.observations} lede={t.living.noMeasurements} />
            <ObservationTimeline
              observations={observations.map((o) => ({
                id: o.id,
                year: o.year,
                yearEnd: o.yearEnd,
                title: o.title,
                observation: o.observation,
                metricName: o.metricName,
                metricValue: o.metricValue,
                metricUnit: o.metricUnit,
                sourceCitation: o.sourceCitation,
                sourceUrl: o.sourceUrl,
                reliability: o.reliability,
              }))}
            />
          </section>
          {neighbours.length > 0 && (
            <section>
              <SectionHeading title={t.record.editorialLinks} />
              <ul className="panel divide-y divide-white/[0.06]">
                {neighbours.map(({ link, node }) => (
                  <li key={link.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                    <span className="font-mono text-[11px] tracking-wider text-mist-500 uppercase sm:w-48">{humanizeRelation(link.relation)}</span>
                    <Link href={node.href} className="flex-1 font-medium text-mist-50 hover:underline">
                      {node.label}
                    </Link>
                    <UncertaintyBadge level={link.uncertainty} t={t} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {records.length > 0 && (
            <section>
              <SectionHeading title={t.place.records} />
              <div className="grid gap-5 sm:grid-cols-2">
                {records.map((r) => (
                  <RecordCard key={r.id} record={r} t={t} locale={locale} />
                ))}
              </div>
            </section>
          )}
        </div>
        <aside className="space-y-6">
          <section className="panel p-5">
            <dl>
              <KeyValue label={t.common.countries}>
                <span className="flex flex-wrap gap-x-2">
                  {e.countryCodes.map((c) => (
                    <Link key={c} href={`/places/${c.toLowerCase()}`} className="text-aurora-cyan hover:underline">
                      {countryName(c, locale)}
                    </Link>
                  ))}
                </span>
              </KeyValue>
            </dl>
          </section>
          {alert && <AlertCard alert={alert} t={t} />}
          {projects.length > 0 && (
            <section className="panel p-5">
              <h2 className="eyebrow mb-3">{t.place.initiatives}</h2>
              <ul className="space-y-3">
                {projects.map((p) => (
                  <li key={p.id} className="text-sm">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-mist-50 hover:underline">
                        {p.name} ↗
                      </a>
                    ) : (
                      <span className="font-medium text-mist-50">{p.name}</span>
                    )}
                    <p className="text-xs text-mist-400">{p.organization}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="panel p-5">
            <h2 className="eyebrow mb-4">{t.common.sources}</h2>
            <SourceList items={sources} emptyLabel={t.common.noSources} />
          </section>
        </aside>
      </div>
    </Container>
  );
}
