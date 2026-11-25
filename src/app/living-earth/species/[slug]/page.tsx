import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard } from "@/components/alerts/AlertCard";
import { RecordCard } from "@/components/record/RecordCard";
import { SourceList } from "@/components/record/Sources";
import { IucnBadge, OriginBadge, UncertaintyBadge } from "@/components/ui/Badge";
import { Container, KeyValue, SectionHeading } from "@/components/ui/layout";
import { humanizeRelation, Prose } from "@/components/ui/Prose";
import { getViewer } from "@/lib/auth/session";
import { countryName } from "@/lib/geo/countries";
import { getI18n } from "@/lib/i18n/server";
import { getSpecies } from "@/server/living";

export async function generateMetadata({ params }: PageProps<"/living-earth/species/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getSpecies(slug, null);
  return { title: data?.species.commonName ?? "Species", description: data?.species.description };
}

export default async function SpeciesPage({ params }: PageProps<"/living-earth/species/[slug]">) {
  const { slug } = await params;
  const { t, locale } = await getI18n();
  const data = await getSpecies(slug, await getViewer());
  if (!data) notFound();
  const { species: s, sources, records, neighbours, alert } = data;
  return (
    <Container>
      <Link href="/living-earth#species" className="mt-8 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.nav.living}
      </Link>
      <header className="mt-4 animate-fade-up">
        <div className="flex flex-wrap gap-2">
          <IucnBadge status={s.iucnStatus} t={t} />
          <OriginBadge origin={s.origin} t={t} />
        </div>
        <h1 className="mt-4 font-display text-5xl font-semibold text-mist-50 sm:text-6xl">{s.commonName}</h1>
        <p className="mt-2 font-display text-2xl text-mist-300 italic">{s.scientificName}</p>
      </header>
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          <section className="panel p-6 sm:p-8">
            <Prose text={s.description} />
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
              <KeyValue label={t.living.assessment}>{s.assessmentNote}</KeyValue>
              {s.habitat && <KeyValue label={t.living.habitat}>{s.habitat}</KeyValue>}
              <KeyValue label={t.living.rangeCountries}>
                <span className="flex flex-wrap gap-x-2">
                  {s.countryCodes.map((c) => (
                    <Link key={c} href={`/places/${c.toLowerCase()}`} className="text-aurora-cyan hover:underline">
                      {countryName(c, locale)}
                    </Link>
                  ))}
                </span>
              </KeyValue>
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-mist-500">{t.living.noMeasurements}</p>
          </section>
          {alert && <AlertCard alert={alert} t={t} />}
          <section className="panel p-5">
            <h2 className="eyebrow mb-4">{t.common.sources}</h2>
            <SourceList items={sources} emptyLabel={t.common.noSources} />
          </section>
        </aside>
      </div>
    </Container>
  );
}
