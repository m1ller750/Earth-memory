import type { Metadata } from "next";
import Link from "next/link";
import { AlertCard } from "@/components/alerts/AlertCard";
import { ALERT_COLORS } from "@/components/ui/Badge";
import { Container, EmptyState, PageHeader } from "@/components/ui/layout";
import type { AlertSubjectType } from "@/lib/engine/alerts";
import { findRegion } from "@/lib/geo/regions";
import { getI18n } from "@/lib/i18n/server";
import { getAllAlerts } from "@/server/alerts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.alerts.title, description: t.alerts.lede };
}

const TYPES: AlertSubjectType[] = ["language", "tradition", "ecosystem", "species"];
const LEVELS = ["critical", "high", "elevated", "watch"] as const;

export default async function AlertsPage({ searchParams }: PageProps<"/alerts">) {
  const { t } = await getI18n();
  const sp = await searchParams;
  const type = typeof sp.type === "string" && (TYPES as string[]).includes(sp.type) ? (sp.type as AlertSubjectType) : null;
  const level = typeof sp.level === "string" && (LEVELS as readonly string[]).includes(sp.level) ? sp.level : null;
  const region = typeof sp.region === "string" ? findRegion(sp.region) : null;
  const all = await getAllAlerts();
  const shown = all.filter((a) => (!type || a.subjectType === type) && (!level || a.level === level) && (!region || a.countryCodes.some((c) => region.codes.includes(c))));
  const link = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { type, level, region: region?.label ?? null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/alerts?${s}` : "/alerts";
  };

  return (
    <Container>
      <PageHeader eyebrow={t.nav.alerts} title={t.alerts.title} lede={t.alerts.lede} />
      <div className="panel mb-8 border-risk-elevated/25 p-5 text-sm leading-relaxed text-mist-300">
        <p>{t.alerts.disclaimer}</p>
        <Link href="#method" className="mt-2 inline-block text-aurora-cyan hover:underline">
          {t.alerts.method} ↓
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={link({ type: null })} className={`rounded-full border px-3 py-1.5 text-xs ${!type ? "border-white/30 text-mist-50" : "border-white/10 text-mist-300"}`}>
          {t.common.all} · {all.length}
        </Link>
        {TYPES.map((x) => (
          <Link key={x} href={link({ type: x })} className={`rounded-full border px-3 py-1.5 text-xs ${type === x ? "border-white/30 text-mist-50" : "border-white/10 text-mist-300"}`}>
            {t.alerts.types[x]} · {all.filter((a) => a.subjectType === x).length}
          </Link>
        ))}
        <span className="mx-2 hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
        {LEVELS.map((l) => (
          <Link key={l} href={link({ level: level === l ? null : l })} className="rounded-full border px-3 py-1.5 text-xs text-mist-200" style={{ borderColor: level === l ? ALERT_COLORS[l] : "rgb(255 255 255 / 0.1)" }}>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: ALERT_COLORS[l] }} aria-hidden />
            {t.alertLevel[l]} · {all.filter((a) => a.level === l && (!type || a.subjectType === type)).length}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState title={t.alerts.noneMatching} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((a) => (
            <AlertCard key={`${a.subjectType}-${a.id}`} alert={a} t={t} />
          ))}
        </div>
      )}

      <section id="method" className="panel mt-14 scroll-mt-24 p-6 sm:p-8">
        <h2 className="font-display text-3xl font-semibold text-mist-50">{t.alerts.method}</h2>
        <p className="mt-4 rounded-xl border border-white/10 bg-ink-950/60 p-4 font-mono text-sm text-mist-200">
          score = 100 × (0.45 × {t.alerts.factorNames.threat.toLowerCase()} + 0.35 × {t.alerts.factorNames.documentation_gap.toLowerCase()} + 0.10 × {t.alerts.factorNames.single_source.toLowerCase()} + 0.10 × {t.alerts.factorNames.verification_gap.toLowerCase()})
        </p>
        <ul className="mt-5 grid gap-3 text-sm text-mist-300 md:grid-cols-2">
          <li>
            <strong className="text-mist-50">{t.alerts.factorNames.threat}.</strong> UNESCO Atlas (languages), IUCN Red List (species), UNESCO Urgent Safeguarding List (traditions), documented transformation events (ecosystems).
          </li>
          <li>
            <strong className="text-mist-50">{t.alerts.factorNames.documentation_gap}.</strong> 1 − min(1, documentation ÷ target). Targets: languages 40, traditions 10, ecosystems 12, species 8.
          </li>
          <li>
            <strong className="text-mist-50">{t.alerts.factorNames.single_source}.</strong> 1 when the subject rests on one cited source or none.
          </li>
          <li>
            <strong className="text-mist-50">{t.alerts.factorNames.verification_gap}.</strong> Share of linked records not yet verified by the community or an expert.
          </li>
        </ul>
        <p className="mt-5 text-xs leading-relaxed text-mist-500">{t.alerts.limitationsText}</p>
      </section>
    </Container>
  );
}
