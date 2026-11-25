import { Archive as ArchiveIcon, Lock, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArchiveFilters } from "@/components/archive/ArchiveFilters";
import { RecordCard } from "@/components/record/RecordCard";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Container, EmptyState, PageHeader } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { executeRows, getDb } from "@/lib/db/client";
import { records } from "@/lib/db/schema";
import { countryName } from "@/lib/geo/countries";
import { format, formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n/server";
import { parseArchiveParams } from "@/lib/validation/filters";
import { hiddenRecordCount, listRecords } from "@/server/records";
import { sql } from "drizzle-orm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.archive.title, description: t.archive.lede };
}

const PAGE_SIZE = 18;

async function archiveCountries(locale: "en" | "ru") {
  const db = await getDb();
  const rows = await executeRows<{ code: string }>(db, sql`select distinct unnest(array_append(${records.countryCodes}, ${records.countryCode})) as code from ${records} where ${records.visibility} = 'public'`);
  return rows
    .map((r) => r.code)
    .filter(Boolean)
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export default async function ArchivePage({ searchParams }: PageProps<"/archive">) {
  const { t, locale } = await getI18n();
  const viewer = await getViewer();
  const raw = await searchParams;
  const { filters, sort, page, region } = parseArchiveParams(raw);
  const [{ items, total }, hidden, countries] = await Promise.all([
    listRecords(filters, viewer, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, sort }),
    hiddenRecordCount(viewer),
    archiveCountries(locale),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) if (typeof value === "string" && key !== "page") sp.set(key, value);
    sp.set("page", String(p));
    return `/archive?${sp.toString()}`;
  };

  return (
    <Container>
      <PageHeader
        eyebrow={t.nav.archive}
        title={t.archive.title}
        lede={t.archive.lede}
        actions={
          <ButtonLink href="/contribute" variant="primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t.nav.contribute}
          </ButtonLink>
        }
      />
      <Suspense fallback={<div className="panel skeleton h-36" />}>
        <ArchiveFilters countries={countries} />
      </Suspense>

      <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-mist-300">
        <span className="font-mono text-xs tracking-wide text-mist-400 uppercase">{format(t.archive.count, { count: formatNumber(total, locale) })}</span>
        {region && <Badge tone="cyan">{region}</Badge>}
        {filters.multiCountry && <Badge tone="cyan">2+ {t.common.countries.toLowerCase()}</Badge>}
        {hidden > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-mist-500">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {t.archive.restrictedHidden}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<ArchiveIcon className="h-6 w-6" />} title={t.archive.empty} body={t.archive.emptyHint} />
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((r) => (
            <RecordCard key={r.id} record={r} t={t} locale={locale} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-2 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="rounded-lg border border-white/10 px-3 py-2 text-mist-200 hover:border-white/25">
              ← {t.common.previous}
            </Link>
          )}
          <span className="px-3 font-mono text-xs text-mist-400">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="rounded-lg border border-white/10 px-3 py-2 text-mist-200 hover:border-white/25">
              {t.common.next} →
            </Link>
          )}
        </nav>
      )}
    </Container>
  );
}
