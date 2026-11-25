import { Globe2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard } from "@/components/alerts/AlertCard";
import { RecordCard } from "@/components/record/RecordCard";
import { MiniTimeline } from "@/components/timeline/MiniTimeline";
import { IucnBadge, LanguageStatusBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getPlace } from "@/server/places";

export async function generateMetadata({ params }: PageProps<"/places/[code]">): Promise<Metadata> {
  const { code } = await params;
  const { t, locale } = await getI18n();
  const place = await getPlace(code, null, 1);
  if (!place) return { title: t.explore.title };
  return { title: format(t.place.title, { name: locale === "ru" ? place.country.nameRu : place.country.name }) };
}

export default async function PlacePage({ params }: PageProps<"/places/[code]">) {
  const { code } = await params;
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  const place = await getPlace(code, viewer, 60);
  if (!place) notFound();
  const name = locale === "ru" ? place.country.nameRu : place.country.name;
  const dated = place.records.filter((r) => r.periodStart != null);

  return (
    <Container>
      <PageHeader
        eyebrow={[place.country.subregion, place.country.continent].filter(Boolean).join(" · ")}
        title={format(t.place.title, { name })}
        actions={
          <>
            {place.country.lat != null && (
              <ButtonLink href={`/explore?lat=${place.country.lat}&lng=${place.country.lng}`} variant="secondary">
                <Globe2 className="h-4 w-4" aria-hidden />
                {t.common.showOnGlobe}
              </ButtonLink>
            )}
            <ButtonLink href={`/contribute?country=${place.country.code}`} variant="primary">
              <Plus className="h-4 w-4" aria-hidden />
              {t.nav.contribute}
            </ButtonLink>
          </>
        }
      />

      {place.records.length === 0 && place.languages.length === 0 && place.species.length === 0 ? (
        <EmptyState icon={<Globe2 className="h-6 w-6" />} title={t.place.noRecords} body={t.place.beFirst} action={<ButtonLink href={`/contribute?country=${place.country.code}`} variant="primary">{t.nav.contribute}</ButtonLink>} />
      ) : null}

      {place.alerts.length > 0 && (
        <section className="mt-6">
          <SectionHeading title={t.place.alerts} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {place.alerts.slice(0, 3).map((a) => (
              <AlertCard key={`${a.subjectType}-${a.id}`} alert={a} t={t} />
            ))}
          </div>
        </section>
      )}

      {place.records.length > 0 && (
        <section className="mt-14">
          <SectionHeading
            title={`${t.place.records} · ${place.recordTotal}`}
            action={
              <ButtonLink href={`/archive?country=${place.country.code}`} variant="secondary" size="sm">
                {t.common.viewAll}
              </ButtonLink>
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {place.records.slice(0, 9).map((r) => (
              <RecordCard key={r.id} record={r} t={t} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {dated.length > 0 && (
        <section className="mt-14">
          <SectionHeading title={t.place.timeline} />
          <MiniTimeline items={dated.map((r) => ({ slug: r.slug, title: r.title, dimension: r.dimension, start: r.periodStart!, end: r.periodEnd ?? r.periodStart! }))} locale={locale} />
        </section>
      )}

      <div className="mt-14 grid gap-6 lg:grid-cols-3">
        {place.languages.length > 0 && (
          <section className="panel p-5">
            <h2 className="eyebrow mb-4">{t.place.languages}</h2>
            <ul className="space-y-2.5">
              {place.languages.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3">
                  <Link href={`/languages/${l.slug}`} className="text-sm font-medium text-mist-50 hover:underline">
                    {l.name}
                  </Link>
                  <LanguageStatusBadge status={l.status} t={t} />
                </li>
              ))}
            </ul>
          </section>
        )}
        {place.species.length > 0 && (
          <section className="panel p-5">
            <h2 className="eyebrow mb-4">{t.place.species}</h2>
            <ul className="space-y-2.5">
              {place.species.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <Link href={`/living-earth/species/${s.slug}`} className="text-sm font-medium text-mist-50 hover:underline">
                    {s.commonName}
                  </Link>
                  <IucnBadge status={s.iucnStatus} t={t} showCode />
                </li>
              ))}
            </ul>
          </section>
        )}
        {(place.ecosystems.length > 0 || place.projects.length > 0) && (
          <section className="panel p-5">
            {place.ecosystems.length > 0 && (
              <>
                <h2 className="eyebrow mb-4">{t.place.ecosystems}</h2>
                <ul className="mb-6 space-y-2">
                  {place.ecosystems.map((e) => (
                    <li key={e.id}>
                      <Link href={`/living-earth/ecosystems/${e.slug}`} className="text-sm font-medium text-mist-50 hover:underline">
                        {e.name}
                      </Link>
                      <p className="text-xs text-mist-400">{e.statusNote}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {place.projects.length > 0 && (
              <>
                <h2 className="eyebrow mb-4">{t.place.initiatives}</h2>
                <ul className="space-y-2">
                  {place.projects.map((p) => (
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
              </>
            )}
          </section>
        )}
      </div>
    </Container>
  );
}
