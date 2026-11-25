import type { Metadata } from "next";
import Link from "next/link";
import { LayerGlobe } from "@/components/globe/LayerGlobe";
import { IUCN_COLORS, IucnBadge } from "@/components/ui/Badge";
import { Container, PageHeader, SectionHeading } from "@/components/ui/layout";
import { IUCN_STATUSES, type IucnStatus } from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { format } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { listEcosystems, listProjects, listSpecies } from "@/server/living";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.living.title, description: t.living.lede };
}

const ORDER: IucnStatus[] = ["CR", "EN", "VU", "NT", "DD", "LC", "EW", "EX"];

export default async function LivingEarthPage({ searchParams }: PageProps<"/living-earth">) {
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const status = typeof sp.status === "string" && (IUCN_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as IucnStatus) : undefined;
  const [allSpecies, ecosystems, projects] = await Promise.all([listSpecies(), listEcosystems(), listProjects()]);
  const shown = (status ? allSpecies.filter((s) => s.iucnStatus === status) : allSpecies).sort((a, b) => ORDER.indexOf(a.iucnStatus) - ORDER.indexOf(b.iucnStatus) || a.commonName.localeCompare(b.commonName));
  const points = [
    ...allSpecies.filter((s) => s.lat != null).map((s) => ({ id: s.id, layer: "species" as const, lat: s.lat!, lng: s.lng!, title: s.commonName, subtitle: `${s.iucnStatus} · ${s.scientificName}`, href: `/living-earth/species/${s.slug}`, color: IUCN_COLORS[s.iucnStatus] })),
    ...ecosystems.filter((e) => e.lat != null).map((e) => ({ id: e.id, layer: "ecosystem" as const, lat: e.lat!, lng: e.lng!, title: e.name, subtitle: e.statusNote, href: `/living-earth/ecosystems/${e.slug}`, color: "#2fd8c4" })),
  ];
  const counts = Object.fromEntries(ORDER.map((s) => [s, allSpecies.filter((x) => x.iucnStatus === s).length]));

  return (
    <Container>
      <PageHeader eyebrow={t.nav.living} title={t.living.title} lede={t.living.lede} />
      <div className="panel relative h-[420px] overflow-hidden sm:h-[500px]">
        <LayerGlobe points={points} className="absolute inset-0" view={{ lat: 20, lng: 60, altitude: 2.4 }} />
      </div>

      <section className="mt-14" id="species">
        <SectionHeading title={t.living.species} lede={t.living.noMeasurements} />
        <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label={t.living.iucnLegend}>
          <Link href="/living-earth#species" className={`rounded-full border px-3 py-1 text-xs ${!status ? "border-white/30 text-mist-50" : "border-white/10 text-mist-300"}`}>
            {t.common.all} · {allSpecies.length}
          </Link>
          {ORDER.filter((s) => counts[s] > 0).map((s) => (
            <Link key={s} href={`/living-earth?status=${s}#species`} className={`rounded-full border px-3 py-1 text-xs ${status === s ? "text-mist-50" : "text-mist-300"}`} style={{ borderColor: status === s ? IUCN_COLORS[s] : "rgb(255 255 255 / 0.1)" }}>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: IUCN_COLORS[s] }} aria-hidden />
              {t.iucn[s]} · {counts[s]}
            </Link>
          ))}
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((s) => (
            <li key={s.id}>
              <Link href={`/living-earth/species/${s.slug}`} className="group panel flex h-full flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/20">
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.image.url}
                    alt=""
                    loading="lazy"
                    title={`${t.common.photo}: ${s.image.author} · ${s.image.license}`}
                    className="-mx-5 -mt-5 mb-4 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                )}
                <IucnBadge status={s.iucnStatus} t={t} />
                <h3 className="mt-3 font-display text-2xl font-semibold text-mist-50">{s.commonName}</h3>
                <p className="text-sm text-mist-400 italic">{s.scientificName}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-mist-400">{s.description}</p>
                <p className="mt-auto pt-4 font-mono text-[11px] tracking-wide text-mist-500 uppercase">{s.countryCodes.slice(0, 4).map((c) => countryName(c, locale)).join(", ")}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" id="ecosystems">
        <SectionHeading title={t.living.ecosystems} />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ecosystems.map((e) => (
            <li key={e.id}>
              <Link href={`/living-earth/ecosystems/${e.slug}`} className="group panel flex h-full flex-col overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-white/20">
                {e.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.image.url}
                    alt=""
                    loading="lazy"
                    title={`${t.common.photo}: ${e.image.author} · ${e.image.license}`}
                    className="-mx-5 -mt-5 mb-4 aspect-[16/10] w-[calc(100%+2.5rem)] max-w-none object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                )}
                <p className="eyebrow">{e.kind}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-mist-50">{e.name}</h3>
                <p className="mt-1 text-sm text-dim-natural">{e.statusNote}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-mist-400">{e.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16" id="projects">
        <SectionHeading title={t.living.projects} />
        <ul className="grid gap-4 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id} id={`project-${p.slug}`} className="panel scroll-mt-24 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {p.focus}
                    {p.startYear ? ` · ${format(t.living.startYear, { year: p.startYear })}` : ""}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-mist-50">{p.name}</h3>
                  <p className="text-xs text-mist-400">{p.organization}</p>
                </div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-aurora-cyan hover:border-aurora-cyan/40">
                    ↗
                  </a>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mist-300">{p.description}</p>
              <p className="mt-3 font-mono text-[11px] text-mist-500 uppercase">{p.countryCodes.map((c) => countryName(c, locale)).join(", ")}</p>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
