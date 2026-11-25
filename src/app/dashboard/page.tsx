import type { Metadata } from "next";
import { DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { BarList, ColumnChart } from "@/components/charts/Charts";
import { OriginBadge, VerificationBadge } from "@/components/ui/Badge";
import { Container, EmptyState, PageHeader, SectionHeading, Stat } from "@/components/ui/layout";
import { DIMENSIONS, ORIGINS, VERIFICATIONS } from "@/lib/db/schema";
import { centuryLabel, formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { getGlobalStats } from "@/server/stats";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dashboard.title, description: t.dashboard.lede };
}

export default async function DashboardPage() {
  const { t, locale } = await getI18n();
  const s = await getGlobalStats();
  const n = (v: number) => formatNumber(v, locale);

  const centuries = (() => {
    if (!s.byCentury.length) return [];
    const map = new Map(s.byCentury.map((c) => [c.century, c.n]));
    const out = [];
    for (let c = s.byCentury[0].century; c <= s.byCentury[s.byCentury.length - 1].century; c++) {
      out.push({ key: String(c), label: centuryLabel(c * 100, locale), value: map.get(c) ?? 0 });
    }
    return out;
  })();

  return (
    <Container>
      <PageHeader eyebrow={t.nav.dashboard} title={t.dashboard.title} lede={t.dashboard.lede} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label={t.dashboard.totalRecords} value={n(s.totalRecords)} />
        <Stat label={t.dashboard.countries} value={n(s.countries)} />
        <Stat label={t.dashboard.languages} value={n(s.languages)} />
        <Stat label={t.dashboard.environmental} value={n(s.environmentalRecords)} note={`${s.species} species · ${s.ecosystems} ecosystems · ${s.byDimension.natural} records`} />
        <Stat label={t.dashboard.cultural} value={n(s.culturalRecords)} />
        <Stat label={t.dashboard.verified} value={n(s.verified)} />
        <Stat label={t.dashboard.discoveries} value={n(s.connections.engineProposed + s.connections.engineAccepted)} note={`${s.connections.engineAccepted} accepted · ${s.connections.engineProposed} awaiting review`} />
        <Stat label={t.dashboard.initiatives} value={n(s.activeInitiatives)} />
      </div>

      <section className="mt-12">
        <SectionHeading title={t.dashboard.byOrigin} lede={t.footer.dataNotice} />
        <div className="grid gap-4 md:grid-cols-3">
          {ORIGINS.map((o) => (
            <div key={o} className="panel p-5">
              <OriginBadge origin={o} t={t} />
              <p className="mt-4 font-display text-4xl text-mist-50">{n(s.byOrigin[o])}</p>
              <p className="mt-1 text-xs text-mist-400">{t.originHelp[o]}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.byDimension}</h2>
          <div className="mt-5">
            <BarList
              caption={t.dashboard.byDimension}
              data={DIMENSIONS.map((d) => ({ key: d, label: t.dimensions[d], value: s.byDimension[d], icon: <DimensionGlyph dimension={d} className="h-4 w-4 shrink-0" />, href: `/archive?dimension=${d}` }))}
            />
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.verificationFunnel}</h2>
          <ul className="mt-5 space-y-3">
            {VERIFICATIONS.map((v) => (
              <li key={v} className="flex items-center justify-between gap-3">
                <VerificationBadge status={v} t={t} />
                <span className="font-mono text-sm text-mist-100">{n(s.byVerification[v])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mist-500">
            {t.dashboard.reviews}: {n(s.reviews)} · {t.dashboard.participants}: {n(s.communityMembers)}
          </p>
        </section>
        <section className="panel p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.byPeriod}</h2>
          <div className="mt-5">{centuries.length ? <ColumnChart caption={t.dashboard.byPeriod} data={centuries} /> : <p className="text-sm text-mist-500">{t.common.noResults}</p>}</div>
        </section>
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.byContinent}</h2>
          <div className="mt-5">
            <BarList caption={t.dashboard.byContinent} data={[...s.byContinent].sort((a, b) => b.n - a.n).map((c) => ({ key: c.continent, label: c.continent, value: c.n }))} />
          </div>
        </section>
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.discoveryStatus}</h2>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            {(
              [
                [t.review.pendingConnections, s.connections.engineProposed],
                [t.review.accept, s.connections.engineAccepted],
                [t.review.reject, s.connections.engineRejected],
                [t.record.editorialLinks, s.connections.editorial],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] p-3">
                <dd className="font-display text-3xl text-mist-50">{n(value)}</dd>
                <dt className="mt-1 text-xs text-mist-400">{label}</dt>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.dashboard.contributionsOverTime}</h2>
          <div className="mt-5">
            {s.contributionsByMonth.length ? (
              <ColumnChart caption={t.dashboard.contributionsOverTime} data={s.contributionsByMonth.map((m) => ({ key: m.month, label: m.month, value: m.n }))} valueLabel="Contributions" />
            ) : (
              <EmptyState title={t.dashboard.noContributions} />
            )}
          </div>
        </section>
      </div>
    </Container>
  );
}
