import { ArrowLeft, Volume2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCard } from "@/components/alerts/AlertCard";
import { AddWordForm } from "@/components/languages/AddWordForm";
import { RecordCard } from "@/components/record/RecordCard";
import { SourceList } from "@/components/record/Sources";
import { LanguageStatusBadge, OriginBadge, VerificationBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container, KeyValue, SectionHeading } from "@/components/ui/layout";
import { humanizeRelation, Prose } from "@/components/ui/Prose";
import { can } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { countryName } from "@/lib/geo/countries";
import { getI18n } from "@/lib/i18n/server";
import { linksForNode, resolveNodes } from "@/server/graph";
import { getLanguage } from "@/server/languages";

export async function generateMetadata({ params }: PageProps<"/languages/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await getLanguage(slug, null);
  return { title: data?.language.name ?? "Languages", description: data?.language.description };
}

export default async function LanguagePage({ params }: PageProps<"/languages/[slug]">) {
  const { slug } = await params;
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  const data = await getLanguage(slug, viewer);
  if (!data) notFound();
  const { language, lexicon, sources, records, projects, alert } = data;
  const links = await linksForNode("language", language.id);
  const nodes = await resolveNodes(links.flatMap((l) => [l.source, l.target]).map((k) => ({ type: k.split(":")[0], id: k.split(":").slice(1).join(":") })), viewer);
  const self = `language:${language.id}`;
  const graphLinks = links.filter((l) => !l.id.startsWith("implicit:"));

  return (
    <Container>
      <Link href="/languages" className="mt-8 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.nav.languages}
      </Link>
      <header className="mt-4 max-w-4xl animate-fade-up">
        <div className="flex flex-wrap items-center gap-2">
          <LanguageStatusBadge status={language.status} t={t} />
          <OriginBadge origin={language.origin} t={t} />
          <VerificationBadge status={language.verification} t={t} />
        </div>
        <h1 className="mt-4 font-display text-5xl leading-none font-semibold text-mist-50 sm:text-6xl">{language.name}</h1>
        {language.endonym && <p className="mt-2 font-display text-2xl text-mist-300 italic">{language.endonym}</p>}
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-12">
          <section className="panel p-6 sm:p-8">
            <Prose text={language.description} />
            {language.speakersNote && <p className="mt-5 border-t border-white/[0.06] pt-4 text-sm text-mist-300">{language.speakersNote}</p>}
          </section>

          <section id="lexicon">
            <SectionHeading title={t.languages.lexicon} action={viewer && can(viewer, "lexicon:create") ? undefined : <ButtonLink href={`/login?next=/languages/${language.slug}`} variant="secondary" size="sm">{t.languages.addWord}</ButtonLink>} />
            {viewer && can(viewer, "lexicon:create") && (
              <div className="mb-5">
                <AddWordForm languageId={language.id} />
              </div>
            )}
            {lexicon.length === 0 ? (
              <p className="text-sm text-mist-500">{t.languages.lexiconEmpty}</p>
            ) : (
              <div className="panel overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-xs tracking-wide text-mist-400 uppercase">
                      <th className="px-4 py-3 font-medium">{t.languages.headword}</th>
                      <th className="px-4 py-3 font-medium">{t.languages.gloss}</th>
                      <th className="px-4 py-3 font-medium">{t.languages.pronunciation}</th>
                      <th className="px-4 py-3 font-medium">{t.common.sources}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lexicon.map((e) => (
                      <tr key={e.id} className="border-b border-white/[0.04] align-top last:border-0">
                        <td className="px-4 py-3">
                          <span className="font-display text-lg font-semibold text-mist-50">{e.headword}</span>
                          {e.transcription && <span className="block font-mono text-xs text-mist-400">/{e.transcription}/</span>}
                          {e.partOfSpeech && <span className="block text-xs text-mist-500 italic">{e.partOfSpeech}</span>}
                        </td>
                        <td className="px-4 py-3 text-mist-200">{locale === "ru" && e.glossRu ? e.glossRu : e.glossEn}</td>
                        <td className="px-4 py-3">
                          {e.audioId ? (
                            <audio controls preload="none" src={`/api/v1/media/${e.audioId}`} className="h-8 w-44" aria-label={`${t.languages.pronunciation}: ${e.headword}`} />
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-mist-500">
                              <Volume2 className="h-3.5 w-3.5" aria-hidden />
                              {t.languages.noAudio}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-mist-400">
                          {e.sourceCitation}
                          <span className="mt-1 block">
                            <VerificationBadge status={e.verification} t={t} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {records.length > 0 && (
            <section>
              <SectionHeading title={t.languages.oralHistories} />
              <div className="grid gap-5 sm:grid-cols-2">
                {records.map((r) => (
                  <RecordCard key={r.id} record={r} t={t} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {graphLinks.length > 0 && (
            <section>
              <SectionHeading title={t.record.editorialLinks} />
              <ul className="panel divide-y divide-white/[0.06]">
                {graphLinks.map((l) => {
                  const other = nodes.get(l.source === self ? l.target : l.source);
                  if (!other) return null;
                  return (
                    <li key={l.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
                      <span className="font-mono text-[11px] tracking-wider text-mist-500 uppercase sm:w-56">{humanizeRelation(l.relation)}</span>
                      <Link href={other.href} className="flex-1 font-medium text-mist-50 hover:underline">
                        {other.label}
                      </Link>
                      <span className="text-xs text-mist-400">{l.evidence[0]?.detail}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <dl>
              <KeyValue label={t.languages.family}>{language.family}</KeyValue>
              {language.iso6393 && <KeyValue label="ISO 639-3">{language.iso6393}</KeyValue>}
              <KeyValue label={t.languages.writingSystems}>{language.writingSystems.join(", ") || "—"}</KeyValue>
              <KeyValue label={t.languages.whereSpoken}>
                <span className="flex flex-wrap gap-x-2">
                  {language.countryCodes.map((c) => (
                    <Link key={c} href={`/places/${c.toLowerCase()}`} className="text-aurora-cyan hover:underline">
                      {countryName(c, locale)}
                    </Link>
                  ))}
                </span>
              </KeyValue>
              <KeyValue label={t.languages.statusSource}>
                <span className="text-xs">{language.statusSource}</span>
              </KeyValue>
            </dl>
          </section>
          {alert && <AlertCard alert={alert} t={t} />}
          {projects.length > 0 && (
            <section className="panel p-5">
              <h2 className="eyebrow mb-3">{t.languages.learning}</h2>
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
                    <p className="text-xs text-mist-400">{p.description}</p>
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
