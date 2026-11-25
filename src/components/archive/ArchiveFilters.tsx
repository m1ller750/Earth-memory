"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Input, Select } from "@/components/ui/form";
import { DIMENSIONS, ORIGINS, RECORD_KINDS, VERIFICATIONS } from "@/lib/db/schema";
import { useI18n } from "@/lib/i18n/client";

export function ArchiveFilters({ countries }: { countries: Array<{ code: string; name: string }> }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  // Debounced free-text search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const id = window.setTimeout(() => update("q", q.trim() || null), 350);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["q", "dimension", "kind", "country", "verification", "origin", "from", "to", "region", "tag", "multi"].some((k) => params.get(k));

  return (
    <div className="panel p-4 sm:p-5" aria-busy={pending}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-mist-500" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.nav.searchPlaceholder}
          aria-label={t.archive.searchLabel}
          className="h-12 pl-10 text-base"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Select aria-label={t.archive.filterDimension} value={params.get("dimension") ?? ""} onChange={(e) => update("dimension", e.target.value || null)}>
          <option value="">{t.archive.filterDimension}: {t.common.all}</option>
          {DIMENSIONS.map((d) => (
            <option key={d} value={d}>
              {t.dimensions[d]}
            </option>
          ))}
        </Select>
        <Select aria-label={t.archive.filterKind} value={params.get("kind") ?? ""} onChange={(e) => update("kind", e.target.value || null)}>
          <option value="">{t.archive.filterKind}: {t.common.all}</option>
          {RECORD_KINDS.map((k) => (
            <option key={k} value={k}>
              {t.kinds[k]}
            </option>
          ))}
        </Select>
        <Select aria-label={t.archive.filterCountry} value={params.get("country") ?? ""} onChange={(e) => update("country", e.target.value || null)}>
          <option value="">{t.archive.filterCountry}: {t.common.all}</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select aria-label={t.archive.filterVerification} value={params.get("verification") ?? ""} onChange={(e) => update("verification", e.target.value || null)}>
          <option value="">{t.archive.filterVerification}: {t.common.all}</option>
          {VERIFICATIONS.map((v) => (
            <option key={v} value={v}>
              {t.verification[v]}
            </option>
          ))}
        </Select>
        <Select aria-label={t.archive.filterOrigin} value={params.get("origin") ?? ""} onChange={(e) => update("origin", e.target.value || null)}>
          <option value="">{t.archive.filterOrigin}: {t.common.all}</option>
          {ORIGINS.map((o) => (
            <option key={o} value={o}>
              {t.origin[o]}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          inputMode="numeric"
          aria-label={`${t.archive.filterPeriod}: ${t.explore.from}`}
          placeholder={`${t.explore.from} (−500)`}
          defaultValue={params.get("from") ?? ""}
          onBlur={(e) => update("from", e.target.value || null)}
        />
        <Input
          type="number"
          inputMode="numeric"
          aria-label={`${t.archive.filterPeriod}: ${t.explore.to}`}
          placeholder={`${t.explore.to} (2026)`}
          defaultValue={params.get("to") ?? ""}
          onBlur={(e) => update("to", e.target.value || null)}
        />
        <Select aria-label={t.common.sortBy} value={params.get("sort") ?? ""} onChange={(e) => update("sort", e.target.value || null)}>
          <option value="">{t.common.sortBy}…</option>
          <option value="relevance">{t.common.sortRelevance}</option>
          <option value="newest">{t.common.sortNewest}</option>
          <option value="oldest">{t.common.sortOldestPeriod}</option>
          <option value="title">{t.common.sortTitle}</option>
        </Select>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            startTransition(() => router.push(pathname, { scroll: false }));
          }}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-mist-300 hover:text-mist-50"
        >
          <X className="h-4 w-4" aria-hidden />
          {t.common.clearFilters}
        </button>
      )}
    </div>
  );
}
