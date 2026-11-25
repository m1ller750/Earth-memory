import { ArrowLeft, ArrowRight, CircleAlert, ListChecks, ShieldQuestion } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreRing } from "@/components/alerts/AlertCard";
import { factorDetail, threatLabel } from "@/components/alerts/labels";
import { AlertLevelBadge, Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/layout";
import type { AlertSubjectType } from "@/lib/engine/alerts";
import { countryName } from "@/lib/geo/countries";
import { getI18n } from "@/lib/i18n/server";
import { getAlert, organizationsFor } from "@/server/alerts";

const TYPES: AlertSubjectType[] = ["language", "tradition", "ecosystem", "species"];

export async function generateMetadata({ params }: PageProps<"/alerts/[type]/[slug]">): Promise<Metadata> {
  const { type, slug } = await params;
  const alert = (TYPES as string[]).includes(type) ? await getAlert(type as AlertSubjectType, slug) : null;
  return { title: alert ? `Memory Alert · ${alert.name}` : "Memory Alert" };
}

export default async function AlertDetailPage({ params }: PageProps<"/alerts/[type]/[slug]">) {
  const { type, slug } = await params;
  if (!(TYPES as string[]).includes(type)) notFound();
  const { t, locale } = await getI18n();
  const alert = await getAlert(type as AlertSubjectType, slug);
  if (!alert) notFound();
  const organizations = await organizationsFor(alert);
  const d = alert.documentation;
  const available = [
    [t.place.records, d.linkedRecords],
    [t.record.verificationTitle, d.verifiedRecords],
    [t.record.media, d.media + d.audio],
    [t.languages.lexicon, d.lexicon],
    [t.living.observations, d.observations],
    [t.common.sources, d.sources],
  ] as const;

  return (
    <Container className="max-w-5xl">
      <Link href="/alerts" className="mt-8 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.nav.alerts}
      </Link>

      <header className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">{t.alerts.typeSingular[alert.subjectType]}</p>
          <h1 className="mt-2 font-display text-5xl font-semibold text-mist-50">{alert.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AlertLevelBadge level={alert.level} t={t} />
            <Badge tone="neutral">
              {t.common.confidence}: {t.alerts.confidenceLevels[alert.confidence]}
            </Badge>
            {alert.countryCodes.slice(0, 5).map((c) => (
              <Link key={c} href={`/places/${c.toLowerCase()}`} className="text-xs text-aurora-cyan hover:underline">
                {countryName(c, locale)}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <ScoreRing score={alert.score} level={alert.level} size={112} />
          <ButtonLink href={alert.href} variant="secondary">
            {t.common.openPage} <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </div>
      </header>

      <section className="panel mt-10 overflow-x-auto p-0" aria-labelledby="why">
        <h2 id="why" className="flex items-center gap-2 px-6 pt-6 font-display text-2xl font-semibold text-mist-50">
          <CircleAlert className="h-5 w-5 text-risk-elevated" aria-hidden />
          {t.alerts.why}
        </h2>
        <table className="mt-4 w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-y border-white/[0.06] text-xs tracking-wide text-mist-400 uppercase">
              <th className="px-6 py-3 font-medium">{t.alerts.factor}</th>
              <th className="px-3 py-3 font-medium">{t.alerts.value}</th>
              <th className="px-3 py-3 font-medium">{t.alerts.weight}</th>
              <th className="px-6 py-3 text-right font-medium">{t.alerts.contribution}</th>
            </tr>
          </thead>
          <tbody>
            {alert.factors.map((f) => (
              <tr key={f.key} className="border-b border-white/[0.04] align-top">
                <td className="px-6 py-4">
                  <p className="font-medium text-mist-50">{t.alerts.factorNames[f.key]}</p>
                  <p className="mt-1 text-xs leading-relaxed text-mist-400">{factorDetail(alert, f, t)}</p>
                </td>
                <td className="px-3 py-4 font-mono text-mist-200">{f.value.toFixed(2)}</td>
                <td className="px-3 py-4 font-mono text-mist-400">× {f.weight}</td>
                <td className="px-6 py-4 text-right font-mono text-mist-50">{f.points.toFixed(1)}</td>
              </tr>
            ))}
            <tr>
              <td className="px-6 py-4 font-semibold text-mist-50" colSpan={3}>
                {t.alerts.total}
              </td>
              <td className="px-6 py-4 text-right font-display text-2xl text-mist-50">
                {alert.score} <span className="text-sm text-mist-400">{t.alerts.ofHundred}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="px-6 pb-6 text-xs text-mist-500">
          {threatLabel(alert, t)} — {alert.threatSource}
        </p>
      </section>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.alerts.missing}</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-mist-300">
            {alert.missing.map((m) => (
              <li key={m} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-risk-elevated" aria-hidden />
                {t.alerts.missingItems[m]}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.alerts.available}</h2>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            {available.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/[0.06] p-3 text-center">
                <dd className="font-display text-3xl text-mist-50">{value}</dd>
                <dt className="mt-1 text-[10px] tracking-wide text-mist-400 uppercase">{label}</dt>
              </div>
            ))}
          </dl>
        </section>
        <section className="panel p-6">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-mist-50">
            <ListChecks className="h-5 w-5 text-aurora-emerald" aria-hidden />
            {t.alerts.actions}
          </h2>
          <ol className="mt-4 space-y-2.5 text-sm text-mist-300">
            {alert.actions.map((a, i) => (
              <li key={a} className="flex gap-3">
                <span className="font-mono text-xs text-aurora-emerald">{String(i + 1).padStart(2, "0")}</span>
                {t.alerts.actionItems[a]}
              </li>
            ))}
          </ol>
          <ButtonLink href="/contribute" variant="primary" size="sm" className="mt-5">
            {t.nav.contribute}
          </ButtonLink>
        </section>
        <section className="panel p-6">
          <h2 className="font-display text-xl font-semibold text-mist-50">{t.alerts.organizations}</h2>
          {organizations.length === 0 ? (
            <p className="mt-4 text-sm text-mist-500">—</p>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {organizations.map((o) => (
                <li key={o.slug}>
                  {o.url ? (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="font-medium text-mist-50 hover:underline">
                      {o.name} ↗
                    </a>
                  ) : (
                    <Link href={`/living-earth#project-${o.slug}`} className="font-medium text-mist-50 hover:underline">
                      {o.name}
                    </Link>
                  )}
                  <p className="text-xs text-mist-400">{o.organization}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel mt-8 flex gap-4 p-6">
        <ShieldQuestion className="h-6 w-6 shrink-0 text-mist-400" aria-hidden />
        <div>
          <h2 className="font-semibold text-mist-50">
            {t.common.confidence}: {t.alerts.confidenceLevels[alert.confidence]} · {t.common.limitations}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">{t.alerts.confidenceHelp}</p>
          <p className="mt-2 text-sm leading-relaxed text-mist-400">{t.alerts.limitationsText}</p>
        </div>
      </section>
    </Container>
  );
}
