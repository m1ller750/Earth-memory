import { ArrowRight, Globe2, Plus, ShieldCheck, Sparkles, Scale, Users } from "lucide-react";
import Link from "next/link";
import { AlertCard } from "@/components/alerts/AlertCard";
import { DimensionGlyph, DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import { DiscoveryCard } from "@/components/connections/DiscoveryCard";
import { HomeGlobe } from "@/components/globe/HomeGlobe";
import { MiniTimeline } from "@/components/timeline/MiniTimeline";
import { ButtonLink } from "@/components/ui/Button";
import { Container, SectionHeading } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { DIMENSIONS } from "@/lib/db/schema";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getAllAlerts } from "@/server/alerts";
import { getDiscoveries } from "@/server/connections";
import { getGlobeData } from "@/server/globe";
import { getGlobalStats } from "@/server/stats";
import { getTimelineRecords } from "@/server/timeline";

export default async function HomePage() {
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  const [stats, globe, alerts, discoveries, timeline] = await Promise.all([
    getGlobalStats(),
    getGlobeData(viewer),
    getAllAlerts(),
    getDiscoveries({ limit: 3 }),
    getTimelineRecords(viewer),
  ]);
  const topAlerts = alerts.slice(0, 4);
  const n = (v: number) => formatNumber(v, locale);

  const statItems = [
    { label: t.dashboard.totalRecords, value: stats.totalRecords },
    { label: t.dashboard.countries, value: stats.countries },
    { label: t.dashboard.languages, value: stats.languages },
    { label: t.dashboard.discoveries, value: stats.connections.engineProposed + stats.connections.engineAccepted },
    { label: t.dashboard.verified, value: stats.verified },
  ];

  return (
    <>
      {/* Hero */}
      <section className="grain relative -mt-16 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_500px_at_70%_45%,rgba(56,213,245,0.10),transparent_70%)]" />
        <div className="relative mx-auto grid min-h-[100svh] max-w-[1600px] items-center gap-6 px-4 pt-24 pb-10 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:px-8 lg:pt-16">
          <div className="relative z-10 max-w-2xl animate-fade-up">
            <p className="eyebrow mb-5 flex items-center gap-2">
              <span className="h-px w-8 bg-aurora-emerald/70" aria-hidden />
              {t.home.eyebrow}
            </p>
            <h1 className="font-display text-5xl leading-[1.02] font-semibold text-mist-50 sm:text-6xl xl:text-7xl">{t.home.title}</h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-300 sm:text-lg">{t.home.lede}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/explore" variant="primary" size="lg">
                <Globe2 className="h-5 w-5" aria-hidden />
                {t.home.ctaExplore}
              </ButtonLink>
              <ButtonLink href="/contribute" variant="secondary" size="lg">
                <Plus className="h-5 w-5" aria-hidden />
                {t.home.ctaContribute}
              </ButtonLink>
              <ButtonLink href="/ai" variant="ghost" size="lg">
                <Sparkles className="h-5 w-5" aria-hidden />
                {t.home.ctaAsk}
              </ButtonLink>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-5 gap-y-2" aria-label={t.explore.layers}>
              {DIMENSIONS.map((d) => (
                <li key={d} className="flex items-center gap-2 text-xs text-mist-400">
                  <span className="h-2 w-2 rounded-full" style={{ background: DIMENSION_COLORS[d] }} aria-hidden />
                  {t.dimensionsShort[d]}
                </li>
              ))}
              <li className="flex items-center gap-2 text-xs text-mist-400">
                <span className="h-2 w-2 rounded-full border border-risk-critical" aria-hidden />
                {t.nav.alerts}
              </li>
            </ul>
          </div>
          <div className="relative h-[58svh] min-h-[360px] lg:h-[86svh]">
            <HomeGlobe points={globe.points} rings={globe.rings} arcs={globe.arcs} countryCounts={globe.countryCounts} />
          </div>
        </div>
      </section>

      {/* Live statistics */}
      <Container className="relative z-10 -mt-6">
        <div className="panel grid grid-cols-2 divide-white/[0.06] sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
          {statItems.map((s) => (
            <div key={s.label} className="px-5 py-5 sm:px-6">
              <p className="font-display text-4xl leading-none font-semibold text-mist-50">{n(s.value)}</p>
              <p className="mt-2 text-xs leading-snug text-mist-400">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-mist-500">
          {t.home.statsNote}{" "}
          <Link href="/dashboard" className="text-mist-300 underline-offset-4 hover:underline">
            {t.nav.dashboard} →
          </Link>
        </p>
      </Container>

      {/* Dimensions */}
      <Container className="mt-24">
        <SectionHeading eyebrow="01" title={t.home.dimensionsTitle} lede={t.home.dimensionsLede} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DIMENSIONS.map((d) => (
            <Link key={d} href={`/archive?dimension=${d}`} className="group panel flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-white/20">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
                <DimensionGlyph dimension={d} className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-mist-50">{t.dimensions[d]}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-mist-400">{t.dimensionBlurb[d]}</p>
              <p className="mt-5 flex items-center justify-between font-mono text-xs text-mist-400">
                <span>{n(stats.byDimension[d])}</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </p>
            </Link>
          ))}
        </div>
      </Container>

      {/* Memory Alert */}
      <Container className="mt-24">
        <SectionHeading
          eyebrow="02"
          title={t.home.alertsTitle}
          lede={t.home.alertsLede}
          action={
            <ButtonLink href="/alerts" variant="secondary" size="sm">
              {t.common.viewAll} <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topAlerts.map((a) => (
            <AlertCard key={`${a.subjectType}-${a.id}`} alert={a} t={t} />
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-mist-500">{t.alerts.disclaimer}</p>
      </Container>

      {/* Discoveries */}
      {discoveries.length > 0 && (
        <Container className="mt-24">
          <SectionHeading
            eyebrow="03"
            title={t.home.discoveriesTitle}
            lede={t.home.discoveriesLede}
            action={
              <ButtonLink href="/graph" variant="secondary" size="sm">
                {t.nav.graph} <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            }
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {discoveries.map((d) => (
              <DiscoveryCard key={d.id} discovery={d} t={t} />
            ))}
          </div>
        </Container>
      )}

      {/* Timeline */}
      <Container className="mt-24">
        <SectionHeading
          eyebrow="04"
          title={t.home.timelineTitle}
          lede={t.home.timelineLede}
          action={
            <ButtonLink href="/timeline" variant="secondary" size="sm">
              {t.nav.timeline} <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          }
        />
        <MiniTimeline items={timeline.map((r) => ({ slug: r.slug, title: r.title, dimension: r.dimension, start: r.start, end: r.end }))} locale={locale} />
      </Container>

      {/* Principles */}
      <Container className="mt-24">
        <SectionHeading eyebrow="05" title={t.home.principlesTitle} />
        <div className="grid gap-4 md:grid-cols-3">
          {t.home.principles.map((p, i) => {
            const Icon = [Users, Scale, ShieldCheck][i] ?? ShieldCheck;
            return (
              <div key={p.title} className="panel p-6">
                <Icon className="h-6 w-6 text-aurora-cyan" aria-hidden />
                <h3 className="mt-4 font-display text-xl font-semibold text-mist-50">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-400">{p.body}</p>
              </div>
            );
          })}
        </div>
        <div className="panel mt-10 flex flex-col items-start gap-6 overflow-hidden p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <p className="font-display text-3xl font-semibold text-mist-50">{t.footer.mission}</p>
            <p className="mt-2 text-sm text-mist-400">{t.contribute.lede}</p>
          </div>
          <ButtonLink href="/contribute" variant="primary" size="lg">
            <Plus className="h-5 w-5" aria-hidden />
            {t.home.ctaContribute}
          </ButtonLink>
        </div>
      </Container>
    </>
  );
}
