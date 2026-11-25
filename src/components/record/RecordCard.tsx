import Link from "next/link";
import { CoverArt } from "@/components/brand/CoverArt";
import { DimensionBadge, OriginBadge, VerificationBadge } from "@/components/ui/Badge";
import { countryName } from "@/lib/geo/countries";
import { formatPeriod, type Dictionary, type Locale } from "@/lib/i18n";
import type { RecordListItem } from "@/server/records";

export function RecordCard({ record, t, locale }: { record: RecordListItem; t: Dictionary; locale: Locale }) {
  const period = formatPeriod(record.periodStart, record.periodEnd, locale);
  const place = record.countryCode ? countryName(record.countryCode, locale) : null;
  return (
    <Link
      href={`/archive/${record.slug}`}
      className="group panel flex flex-col overflow-hidden transition duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_30px_60px_-30px_rgba(56,213,245,0.35)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-white/[0.06]">
        {record.coverMediaId ? (
          // Uploaded media is served by an access-checked route, so next/image optimisation is not used.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/v1/media/${record.coverMediaId}`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : record.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.image.url}
            alt=""
            loading="lazy"
            title={`${t.common.photo}: ${record.image.author} · ${record.image.license}`}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <CoverArt seed={record.slug} dimension={record.dimension} className="h-full w-full transition duration-700 group-hover:scale-[1.04]" />
        )}
        <div className="absolute top-3 left-3 rounded-full bg-ink-950/70 px-2.5 py-1 backdrop-blur">
          <DimensionBadge dimension={record.dimension} t={t} short />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h3 className="font-display text-xl leading-snug font-semibold text-mist-50">{record.title}</h3>
        {record.summary && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-mist-400">{record.summary}</p>}
        <p className="mt-auto pt-4 font-mono text-[11px] tracking-wide text-mist-400 uppercase">
          {[t.kinds[record.kind], place, period].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <VerificationBadge status={record.verification} t={t} />
          <OriginBadge origin={record.origin} t={t} />
        </div>
      </div>
    </Link>
  );
}
