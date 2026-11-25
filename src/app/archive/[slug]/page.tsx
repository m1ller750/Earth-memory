import { ArrowLeft, Globe2, Lock, MapPin, Network, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverArt } from "@/components/brand/CoverArt";
import { EvidenceList } from "@/components/connections/Evidence";
import { DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { ConnectionDecision, ReportForm, ReviewForm } from "@/components/record/RecordActions";
import { MediaGallery } from "@/components/record/MediaGallery";
import { RecordCard } from "@/components/record/RecordCard";
import { SourceList } from "@/components/record/Sources";
import { AiBadge, Badge, DimensionBadge, IucnBadge, LanguageStatusBadge, OriginBadge, UncertaintyBadge, VerificationBadge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container, EmptyState, KeyValue, SectionHeading } from "@/components/ui/layout";
import { humanizeRelation, Prose } from "@/components/ui/Prose";
import { can, canReviewRecord, isAiSafe } from "@/lib/access/policy";
import { getViewer } from "@/lib/auth/session";
import { countryName } from "@/lib/geo/countries";
import { formatDate, formatPeriod } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { relatedRecords } from "@/server/engine";
import { linksForNode, resolveNodes } from "@/server/graph";
import { getRecordBySlug, nearbyRecords } from "@/server/records";
import { AiTranslatePanel } from "@/components/record/AiTranslatePanel";
import { aiStatus } from "@/lib/ai/provider";

export async function generateMetadata({ params }: PageProps<"/archive/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const viewer = await getViewer();
  const result = await getRecordBySlug(slug, viewer);
  if (result.status !== "ok") return { title: "Archive" };
  return { title: result.record.title, description: result.record.summary };
}

export default async function RecordPage({ params }: PageProps<"/archive/[slug]">) {
  const { slug } = await params;
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  const result = await getRecordBySlug(slug, viewer);
  if (result.status === "not_found") notFound();
  if (result.status === "restricted") {
    return (
      <Container className="py-20">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title={t.record.restrictedTitle}
          body={t.record.restrictedBody}
          action={
            !viewer ? (
              <ButtonLink href={`/login?next=/archive/${slug}`} variant="primary">
                {t.nav.signIn}
              </ButtonLink>
            ) : undefined
          }
        />
      </Container>
    );
  }

  const { record, contributor, community, sources, media, entities, reviews, annotations, language, ecosystem, species } = result;
  const [related, storedLinks, nearby, ai] = await Promise.all([
    relatedRecords(record.id, viewer, 6),
    linksForNode("record", record.id, { includeProposed: false }),
    record.lat != null && record.lng != null ? nearbyRecords(record.lat, record.lng, viewer, record.id, 600, 3) : Promise.resolve([]),
    aiStatus(),
  ]);
  const editorialLinks = storedLinks.filter((l) => !l.id.startsWith("implicit:") && l.provenance === "editorial");
  const linkNodes = await resolveNodes(
    editorialLinks.flatMap((l) => [l.source, l.target]).map((k) => ({ type: k.split(":")[0], id: k.split(":").slice(1).join(":") })),
    viewer,
  );
  const selfKey = `record:${record.id}`;
  const period = formatPeriod(record.periodStart, record.periodEnd, locale);
  const countries = [...new Set([record.countryCode, ...record.countryCodes].filter(Boolean) as string[])];
  const canReview = canReviewRecord(viewer, record);
  const isExpert = can(viewer, "edge:review");
  const aiAllowed = isAiSafe(record) && ai.enabled;

  return (
    <article>
      {/* Hero */}
      <div className="relative h-[34vh] min-h-[240px] overflow-hidden border-b border-white/[0.06]">
        {media.find((m) => m.kind === "image") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/media/${media.find((m) => m.kind === "image")!.id}`} alt="" className="h-full w-full object-cover opacity-70" />
        ) : (
          <CoverArt seed={record.slug} dimension={record.dimension} width={1600} height={480} className="h-full w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/30 to-transparent" />
      </div>

      <Container className="relative -mt-28">
        <Link href="/archive" className="inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.nav.archive}
        </Link>
        <header className="mt-4 max-w-4xl animate-fade-up">
          <div className="flex flex-wrap items-center gap-3">
            <DimensionBadge dimension={record.dimension} t={t} />
            <span className="font-mono text-xs tracking-wider text-mist-400 uppercase">{t.kinds[record.kind]}</span>
          </div>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] font-semibold text-mist-50 sm:text-5xl lg:text-6xl">{record.title}</h1>
          {record.summary && <p className="mt-4 max-w-3xl text-lg leading-relaxed text-mist-300">{record.summary}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <VerificationBadge status={record.verification} t={t} />
            <OriginBadge origin={record.origin} t={t} />
            {record.visibility !== "public" && (
              <Badge tone="amber">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                {t.visibility[record.visibility]}
              </Badge>
            )}
            {record.sensitivity !== "none" && <Badge tone="rose">{t.sensitivity[record.sensitivity]}</Badge>}
          </div>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Main column */}
          <div className="min-w-0 space-y-10">
            <section aria-labelledby="about" className="panel p-6 sm:p-8">
              <h2 id="about" className="eyebrow mb-5">
                {t.record.about}
              </h2>
              <Prose text={record.body} />
            </section>

            <section aria-labelledby="media">
              <SectionHeading title={<span id="media">{t.record.media}</span>} />
              <MediaGallery items={media} emptyLabel={t.record.noMedia} />
            </section>

            {(annotations.length > 0 || aiAllowed) && (
              <section aria-labelledby="ai" className="ai-surface rounded-[var(--radius-panel)] p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="ai" className="flex items-center gap-2 font-display text-2xl font-semibold text-mist-50">
                    <Sparkles className="h-5 w-5 text-ai" aria-hidden />
                    {t.record.aiTitle}
                  </h2>
                  <AiBadge label={t.record.aiNotice} />
                </div>
                <div className="mt-5 space-y-4">
                  {annotations.length === 0 && <p className="text-sm text-mist-400">{t.record.aiNone}</p>}
                  {annotations.map((a) => (
                    <div key={a.id} className="rounded-xl border border-ai/20 bg-ink-900/60 p-4">
                      <p className="font-mono text-[11px] tracking-wider text-ai uppercase">
                        {a.kind.replace("_", " ")}
                        {a.targetLanguage ? ` · ${a.targetLanguage}` : ""} · {a.model} · {formatDate(a.createdAt, locale)}
                      </p>
                      {typeof a.content.title === "string" && <p className="mt-2 font-semibold text-mist-50">{a.content.title}</p>}
                      {typeof a.content.text === "string" && <Prose text={a.content.text} className="mt-2 space-y-3 text-sm leading-relaxed text-mist-200" />}
                    </div>
                  ))}
                </div>
                {aiAllowed && <AiTranslatePanel recordId={record.id} provider={ai.label} />}
              </section>
            )}

            <section aria-labelledby="related">
              <SectionHeading title={<span id="related">{t.record.relatedTitle}</span>} lede={t.record.relatedLede} />
              {related.length === 0 ? (
                <p className="text-sm text-mist-500">{t.record.relatedNone}</p>
              ) : (
                <ul className="grid gap-4 md:grid-cols-2">
                  {related.map((c) => (
                    <li key={c.targetId} className="panel flex flex-col p-5">
                      <div className="flex items-start gap-3">
                        <DimensionGlyph dimension={c.dimension} className="mt-1 h-5 w-5 shrink-0" />
                        <Link href={`/archive/${c.slug}`} className="min-w-0 flex-1 font-semibold text-mist-50 hover:underline">
                          {c.title}
                        </Link>
                        <span className="font-mono text-xs text-mist-400">{c.score.toFixed(2)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <UncertaintyBadge level={c.reviewStatus === "accepted" ? "confirmed" : c.uncertainty} t={t} />
                        <Badge tone="neutral">{c.reviewStatus === "accepted" ? t.provenance.editorial : t.provenance.engine}</Badge>
                      </div>
                      <EvidenceList evidence={c.evidence} limit={4} className="mt-4" />
                      {isExpert && c.reviewStatus !== "accepted" && (
                        <div className="mt-4 border-t border-white/[0.06] pt-3">
                          <ConnectionDecision recordId={record.id} otherId={c.targetId} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {editorialLinks.length > 0 && (
              <section aria-labelledby="links">
                <SectionHeading title={<span id="links">{t.record.editorialLinks}</span>} />
                <ul className="divide-y divide-white/[0.06] panel">
                  {editorialLinks.map((l) => {
                    const otherKey = l.source === selfKey ? l.target : l.source;
                    const other = linkNodes.get(otherKey);
                    if (!other) return null;
                    return (
                      <li key={l.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                        <span className="font-mono text-[11px] tracking-wider text-mist-500 uppercase sm:w-56">{humanizeRelation(l.relation)}</span>
                        <Link href={other.href} className="flex-1 font-medium text-mist-50 hover:underline">
                          {other.label}
                        </Link>
                        <UncertaintyBadge level={l.uncertainty} t={t} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <section className="panel p-5" aria-labelledby="details">
              <h2 id="details" className="eyebrow mb-3">
                {t.record.details}
              </h2>
              <dl>
                {(record.placeName || countries.length > 0) && (
                  <KeyValue label={t.record.place}>
                    {record.placeName && <span className="block">{record.placeName}</span>}
                    <span className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                      {countries.map((c) => (
                        <Link key={c} href={`/places/${c.toLowerCase()}`} className="text-aurora-cyan hover:underline">
                          {countryName(c, locale)}
                        </Link>
                      ))}
                    </span>
                  </KeyValue>
                )}
                {record.lat != null && record.lng != null && (
                  <KeyValue label={t.common.coordinates}>
                    <span className="font-mono text-xs">
                      {record.lat.toFixed(3)}, {record.lng.toFixed(3)}
                    </span>
                    <Link href={`/explore?lat=${record.lat}&lng=${record.lng}`} className="mt-1 flex items-center gap-1 text-xs text-aurora-cyan hover:underline">
                      <Globe2 className="h-3.5 w-3.5" aria-hidden />
                      {t.common.showOnGlobe}
                    </Link>
                  </KeyValue>
                )}
                {(period || record.dateLabel) && (
                  <KeyValue label={t.record.date}>
                    {period && <span className="block">{period}</span>}
                    {record.dateLabel && <span className="mt-1 block text-xs text-mist-400">{record.dateLabel}</span>}
                  </KeyValue>
                )}
                <KeyValue label={t.record.contentLanguage}>{record.contentLanguage.toUpperCase()}</KeyValue>
                <KeyValue label={t.common.license}>{t.licenses[record.license]}</KeyValue>
                <KeyValue label={t.common.visibility}>{t.visibility[record.visibility]}</KeyValue>
                {community && <KeyValue label={t.contribute.communityLabel}>{community.name}</KeyValue>}
                {contributor && (
                  <KeyValue label={t.record.editsBy}>
                    <Link href={`/contributors/${contributor.id}`} className="text-aurora-cyan hover:underline">
                      {contributor.name}
                    </Link>
                  </KeyValue>
                )}
                <KeyValue label={t.common.attribution}>
                  <span className="text-xs leading-relaxed text-mist-300">{record.attribution}</span>
                </KeyValue>
                <KeyValue label={t.record.sharedOn}>{formatDate(record.createdAt, locale)}</KeyValue>
              </dl>
              {(language || ecosystem || species) && (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  {language && (
                    <Link href={`/languages/${language.slug}`} className="flex items-center justify-between gap-2 text-sm text-mist-100 hover:text-white">
                      <span>
                        {t.record.linkedLanguage}: {language.name}
                      </span>
                      <LanguageStatusBadge status={language.status} t={t} />
                    </Link>
                  )}
                  {ecosystem && (
                    <Link href={`/living-earth/ecosystems/${ecosystem.slug}`} className="block text-sm text-mist-100 hover:text-white">
                      {t.record.linkedEcosystem}: {ecosystem.name}
                    </Link>
                  )}
                  {species && (
                    <Link href={`/living-earth/species/${species.slug}`} className="flex items-center justify-between gap-2 text-sm text-mist-100 hover:text-white">
                      <span>
                        {t.record.linkedSpecies}: {species.name}
                      </span>
                      <IucnBadge status={species.status} t={t} />
                    </Link>
                  )}
                </div>
              )}
              {record.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-4">
                  {record.tags.map((tag) => (
                    <Link key={tag} href={`/archive?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-mist-300 hover:border-white/25">
                      {tag}
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {entities.length > 0 && (
              <section className="panel p-5" aria-labelledby="entities">
                <h2 id="entities" className="eyebrow mb-3 flex items-center gap-2">
                  <Network className="h-3.5 w-3.5" aria-hidden />
                  {t.record.entities}
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {entities.map((e) => (
                    <Link key={e.id} href={`/graph?node=entity:${e.slug}`} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-mist-100 hover:border-aurora-cyan/40">
                      {e.name}
                    </Link>
                  ))}
                </div>
                <Link href={`/graph?node=record:${record.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-xs text-aurora-cyan hover:underline">
                  {t.record.viewInGraph} →
                </Link>
              </section>
            )}

            <section className="panel p-5" aria-labelledby="sources">
              <h2 id="sources" className="eyebrow mb-4">
                {t.record.sourcesTitle}
              </h2>
              <SourceList items={sources} emptyLabel={t.common.noSources} />
            </section>

            <section className="panel p-5" aria-labelledby="verification">
              <h2 id="verification" className="eyebrow mb-3">
                {t.record.verificationTitle}
              </h2>
              <VerificationBadge status={record.verification} t={t} />
              <p className="mt-2 text-xs leading-relaxed text-mist-400">{t.verificationHelp[record.verification]}</p>
              <h3 className="mt-5 mb-2 text-sm font-semibold text-mist-100">{t.record.reviewHistory}</h3>
              {reviews.length === 0 ? (
                <p className="text-sm text-mist-500">{t.record.noReviews}</p>
              ) : (
                <ul className="space-y-3">
                  {reviews.map((r) => (
                    <li key={r.id} className="text-sm">
                      <p className="text-mist-100">
                        <span className="font-medium">{r.reviewerName}</span>{" "}
                        <span className="text-xs text-mist-400">
                          ({r.reviewerRole === "expert" ? t.roles.expert : t.roles.contributor}) · {formatDate(r.createdAt, locale)}
                        </span>
                      </p>
                      <p className="text-xs text-mist-300">
                        {r.decision === "approve" ? t.review.approve : r.decision === "dispute" ? t.review.dispute : t.review.requestChanges}
                        {r.note ? ` — ${r.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 border-t border-white/[0.06] pt-5">
                {canReview ? (
                  <ReviewForm recordId={record.id} asExpert={isExpert} />
                ) : !viewer ? (
                  <ButtonLink href={`/login?next=/archive/${record.slug}`} variant="secondary" size="sm">
                    {t.record.review}
                  </ButtonLink>
                ) : (
                  <p className="text-xs text-mist-500">{record.contributorId === viewer.id ? t.review.ownRecord : null}</p>
                )}
              </div>
            </section>

            <section className="panel p-5">
              {viewer ? (
                <ReportForm subjectId={record.id} />
              ) : (
                <Link href={`/login?next=/archive/${record.slug}`} className="text-sm text-mist-400 hover:text-mist-100">
                  {t.record.report}
                </Link>
              )}
            </section>
          </aside>
        </div>

        {nearby.length > 0 && (
          <section className="mt-16" aria-labelledby="nearby">
            <SectionHeading
              title={
                <span id="nearby" className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-mist-400" aria-hidden />
                  {t.record.nearby}
                </span>
              }
            />
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {nearby.map((r) => (
                <RecordCard key={r.id} record={r} t={t} locale={locale} />
              ))}
            </div>
          </section>
        )}
      </Container>
    </article>
  );
}
