import type { Metadata } from "next";
import Link from "next/link";
import { DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { Container, PageHeader, SectionHeading } from "@/components/ui/layout";
import { ENGINE_WEIGHTS } from "@/lib/engine/connections";
import { REPUTATION_RULES } from "@/lib/engine/reputation";
import { DIMENSIONS } from "@/lib/db/schema";
import { aiStatus } from "@/lib/ai/provider";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.about.title };
}

export default async function AboutPage() {
  const { t } = await getI18n();
  const ai = await aiStatus();
  return (
    <Container className="max-w-5xl">
      <PageHeader eyebrow={t.nav.about} title={t.about.title} lede={t.meta.description} />

      <section className="panel p-6 sm:p-8">
        <p className="font-display text-3xl leading-snug text-mist-50">“{t.footer.mission}”</p>
        <p className="mt-4 text-mist-300">
          EARTH MEMORY connects five dimensions of memory: the stories of people, living cultures, the historical record, the natural world and scientific knowledge. It is
          built for communities, researchers, archives and anyone who holds a memory worth keeping.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-5">
          {DIMENSIONS.map((d) => (
            <li key={d} className="rounded-xl border border-white/[0.06] p-3 text-center">
              <DimensionGlyph dimension={d} className="mx-auto h-6 w-6" />
              <p className="mt-2 text-xs font-medium text-mist-200">{t.dimensions[d]}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <SectionHeading title="Principles" />
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ["Consent and community control", "Every record carries a visibility level (public, community, stewards only, private) and a sensitivity flag. Sacred knowledge is always narrowed to community stewards. One access module enforces this for pages, search, the API, EARTH AI and the MCP server alike."],
            ["AI is labelled and never authoritative", "AI translations, suggestions and answers are stored apart from confirmed fields, marked as AI interpretation, and need a human to accept them. Only public, non-sensitive records are ever sent to an AI provider."],
            ["Evidence and uncertainty on every link", "Knowledge-graph links show their evidence, their provenance (editorial, contributor, engine) and an explicit certainty label. Engine links stay proposals until an expert accepts them."],
            ["Honest numbers", "Dashboards show live database counts split by provenance. Reference records compiled for this prototype are labelled as pending verification; demonstration records are labelled as fictional."],
          ].map(([title, body]) => (
            <div key={title} className="panel p-5">
              <h3 className="font-display text-xl font-semibold text-mist-50">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12" id="methodology">
        <SectionHeading title="Methodology" />
        <div className="space-y-4">
          <div className="panel p-6">
            <h3 className="font-display text-2xl font-semibold text-mist-50">Memory Connection Engine</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">
              Two records are scored from explainable signals: shared knowledge-graph entities (up to {ENGINE_WEIGHTS.sharedEntityMax} each, weighted by rarity, capped at {ENGINE_WEIGHTS.sharedEntityCap}),
              the same language, ecosystem or species ({ENGINE_WEIGHTS.sameSubject}), distance (within 50 km {ENGINE_WEIGHTS.near50}, 300 km {ENGINE_WEIGHTS.near300}, 1000 km {ENGINE_WEIGHTS.near1000}),
              overlap of shared countries (up to {ENGINE_WEIGHTS.countryJaccard}), overlapping periods (up to {ENGINE_WEIGHTS.periodOverlap}), shared themes ({ENGINE_WEIGHTS.sharedTag} each, up to {ENGINE_WEIGHTS.sharedTagCap}) and
              lexical similarity of the text (character n-gram fingerprints; up to {ENGINE_WEIGHTS.textCap}). The summed evidence is turned into a 0–1 strength with diminishing returns. Lexical similarity
              measures shared wording, not meaning.
            </p>
          </div>
          <div className="panel p-6">
            <h3 className="font-display text-2xl font-semibold text-mist-50">Memory Alert</h3>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">{t.alerts.lede}</p>
            <Link href="/alerts#method" className="mt-2 inline-block text-sm text-aurora-cyan hover:underline">
              {t.alerts.method} →
            </Link>
          </div>
          <div className="panel p-6">
            <h3 className="font-display text-2xl font-semibold text-mist-50">Reputation</h3>
            <ul className="mt-3 grid gap-1.5 text-sm text-mist-300 sm:grid-cols-2">
              {(Object.keys(REPUTATION_RULES) as Array<keyof typeof REPUTATION_RULES>).map((k) => (
                <li key={k}>
                  {t.community.breakdownLabels[k]}: <span className="font-mono text-mist-100">{REPUTATION_RULES[k].points > 0 ? "+" : ""}{REPUTATION_RULES[k].points}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-mist-400">{t.community.reputationHelp}</p>
          </div>
          <div className="panel p-6">
            <h3 className="font-display text-2xl font-semibold text-mist-50">Data and privacy</h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-mist-300">
              <li>Uploaded photos are stored with their EXIF metadata removed, so camera details and GPS positions are not published. Contributors decide whether to use a photo&apos;s location.</li>
              <li>
                AI provider: {ai.enabled ? `${ai.label}. EARTH AI sends your question and excerpts of matching public records to this provider.` : "none configured. EARTH AI answers from the archive without a language model."}
              </li>
              <li>Country shapes: Natural Earth (public domain) via the world-atlas package. No third-party map or analytics services are loaded.</li>
              <li>Reference records cite UNESCO, IUCN, NASA Earth Observatory, peer-reviewed articles and other public sources by name; facts should be checked against them.</li>
            </ul>
          </div>
        </div>
      </section>
    </Container>
  );
}
