import type { Metadata } from "next";
import Link from "next/link";
import { LayerGlobe } from "@/components/globe/LayerGlobe";
import { LANGUAGE_STATUS_COLORS, LanguageStatusBadge } from "@/components/ui/Badge";
import { Container, PageHeader } from "@/components/ui/layout";
import { LANGUAGE_STATUSES, type LanguageStatus } from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { findRegion } from "@/lib/geo/regions";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { listLanguages } from "@/server/languages";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.languages.title, description: t.languages.lede };
}

const STATUS_ORDER: LanguageStatus[] = ["critically_endangered", "severely_endangered", "definitely_endangered", "vulnerable", "extinct", "safe"];

export default async function LanguagesPage({ searchParams }: PageProps<"/languages">) {
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (LANGUAGE_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as LanguageStatus) : undefined;
  const region = typeof sp.region === "string" ? findRegion(sp.region) : null;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const [all, filtered] = await Promise.all([listLanguages(), listLanguages({ status, q, countries: region?.codes })]);
  const sorted = [...filtered].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.name.localeCompare(b.name));
  const points = all.filter((l) => l.lat != null).map((l) => ({ id: l.id, layer: "language" as const, lat: l.lat!, lng: l.lng!, title: l.name, subtitle: t.languageStatus[l.status], href: `/languages/${l.slug}`, color: LANGUAGE_STATUS_COLORS[l.status] }));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, all.filter((l) => l.status === s).length]));

  return (
    <Container>
      <PageHeader eyebrow={t.nav.languages} title={t.languages.title} lede={t.languages.lede} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="panel relative h-[420px] overflow-hidden sm:h-[480px]">
          <LayerGlobe points={points} className="absolute inset-0" view={{ lat: 40, lng: 30, altitude: 2.4 }} />
        </div>
        <div className="panel p-5">
          <p className="eyebrow mb-4">{t.languages.statusLegend}</p>
          <ul className="space-y-2">
            <li>
              <Link href="/languages" className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${!status ? "bg-white/[0.06] text-mist-50" : "text-mist-300 hover:bg-white/[0.04]"}`}>
                {t.common.all}
                <span className="font-mono text-xs">{all.length}</span>
              </Link>
            </li>
            {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <li key={s}>
                <Link href={`/languages?status=${s}`} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${status === s ? "bg-white/[0.06] text-mist-50" : "text-mist-300 hover:bg-white/[0.04]"}`}>
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: LANGUAGE_STATUS_COLORS[s] }} aria-hidden />
                    {t.languageStatus[s]}
                  </span>
                  <span className="font-mono text-xs">{counts[s]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <form className="mt-5" action="/languages">
            {status && <input type="hidden" name="status" value={status} />}
            <input
              name="q"
              defaultValue={q}
              placeholder={`${t.nav.search}…`}
              aria-label={t.nav.search}
              className="h-10 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 text-sm text-mist-50 placeholder:text-mist-500 focus:border-aurora-cyan/60 focus:outline-none"
            />
          </form>
          <p className="mt-5 text-xs leading-relaxed text-mist-500">{t.languages.aiTranslationNotice}</p>
        </div>
      </div>

      <p className="mt-8 font-mono text-xs tracking-wide text-mist-400 uppercase">{format(t.languages.count, { count: sorted.length })}</p>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((l) => (
          <li key={l.id}>
            <Link href={`/languages/${l.slug}`} className="group panel flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-white/20">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-mist-50">{l.name}</h2>
                  {l.endonym && l.endonym !== l.name && <p className="text-sm text-mist-400 italic">{l.endonym}</p>}
                </div>
                <LanguageStatusBadge status={l.status} t={t} />
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-mist-400">{l.description}</p>
              <p className="mt-auto pt-4 font-mono text-[11px] tracking-wide text-mist-500 uppercase">
                {l.family} · {l.countryCodes.slice(0, 3).map((c) => countryName(c, locale)).join(", ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}
