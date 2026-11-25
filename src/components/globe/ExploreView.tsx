"use client";

import { Globe2, List, Loader2, MapPin, RotateCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import { ALERT_COLORS } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { format, formatYear } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { EarthGlobe } from "./EarthGlobe";
import type { GlobeArc, GlobeLayer, GlobePoint, GlobeRing } from "./types";

interface CountryRef {
  code: string;
  name: string;
  nameRu: string;
  lat: number;
  lng: number;
}

interface PlaceSummary {
  code: string;
  name: string;
  nameRu: string;
  subregion: string | null;
  counts: { records: number; languages: number; species: number; ecosystems: number; initiatives: number };
  records: Array<{ slug: string; title: string; href: string; dimension: string }>;
  languages: Array<{ name: string; href: string }>;
  species: Array<{ name: string; href: string; iucnStatus: string }>;
  alerts: Array<{ name: string; score: number; level: string; href: string }>;
  href: string;
}

const LAYERS: GlobeLayer[] = ["record", "language", "species", "ecosystem", "project"];
const PERIOD_MIN = -3500;
const PERIOD_MAX = new Date().getFullYear();

export function ExploreView({
  points,
  rings,
  arcs,
  countryCounts,
  countries,
  initialFocus,
  initialPeriod,
}: {
  points: GlobePoint[];
  rings: GlobeRing[];
  arcs: GlobeArc[];
  countryCounts: Record<string, number>;
  countries: CountryRef[];
  initialFocus: { lat: number; lng: number } | null;
  initialPeriod?: [number, number] | null;
}) {
  const { t, locale } = useI18n();
  const [layers, setLayers] = useState<Record<GlobeLayer, boolean>>({ record: true, language: true, species: true, ecosystem: true, project: false });
  const [showAlerts, setShowAlerts] = useState(true);
  const [showArcs, setShowArcs] = useState(true);
  const [period, setPeriod] = useState<[number, number]>(initialPeriod ?? [PERIOD_MIN, PERIOD_MAX]);
  const [selectedPoint, setSelectedPoint] = useState<GlobePoint | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [place, setPlace] = useState<PlaceSummary | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; altitude?: number; key?: number } | null>(initialFocus ? { ...initialFocus, altitude: 1.2 } : null);
  const [listMode, setListMode] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");

  const periodActive = period[0] > PERIOD_MIN || period[1] < PERIOD_MAX;
  const visiblePoints = useMemo(
    () =>
      points.filter((p) => {
        if (!layers[p.layer]) return false;
        if (periodActive && p.layer === "record") {
          if (p.periodStart == null) return false;
          const end = p.periodEnd ?? p.periodStart;
          return p.periodStart <= period[1] && end >= period[0];
        }
        return true;
      }),
    [points, layers, period, periodActive],
  );

  const selectCountry = useCallback(async (code: string) => {
    setSelectedPoint(null);
    setSelectedCountry(code);
    setPlaceLoading(true);
    const c = countries.find((x) => x.code === code);
    if (c) setFocus({ lat: c.lat, lng: c.lng, altitude: 1.5, key: Date.now() });
    try {
      const res = await fetch(`/api/v1/places/${code.toLowerCase()}`);
      setPlace(res.ok ? ((await res.json()) as PlaceSummary) : null);
    } finally {
      setPlaceLoading(false);
    }
  }, [countries]);

  const selectPoint = (p: GlobePoint) => {
    setSelectedCountry(null);
    setPlace(null);
    setSelectedPoint(p);
    setFocus({ lat: p.lat, lng: p.lng, altitude: 1.3, key: Date.now() });
  };

  const countryMatches = useMemo(() => {
    const q = placeQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return countries.filter((c) => c.name.toLowerCase().includes(q) || c.nameRu.toLowerCase().includes(q) || c.code.toLowerCase() === q).slice(0, 6);
  }, [placeQuery, countries]);

  useEffect(() => {
    if (webglFailed) setListMode(true);
  }, [webglFailed]);

  const layerLabel: Record<GlobeLayer, string> = {
    record: t.explore.layerRecords,
    language: t.explore.layerLanguages,
    species: t.explore.layerSpecies,
    ecosystem: t.explore.layerEcosystems,
    project: t.explore.layerProjects,
  };
  const layerColor: Record<GlobeLayer, string> = { record: DIMENSION_COLORS.historical, language: "#f0506e", species: "#fb8a5c", ecosystem: "#2fd8c4", project: "#e3eaf3" };

  return (
    <div className="relative h-[calc(100dvh-4rem)] min-h-[560px] overflow-hidden">
      {!listMode && (
        <EarthGlobe
          className="absolute inset-0"
          points={visiblePoints}
          rings={showAlerts ? rings : []}
          arcs={showArcs ? arcs : []}
          countryCounts={countryCounts}
          selectedCountry={selectedCountry}
          focus={focus}
          autoRotate={!initialFocus}
          onPointSelect={selectPoint}
          onCountrySelect={selectCountry}
          onUnsupported={() => setWebglFailed(true)}
          loadingLabel={t.common.loading}
        />
      )}

      {/* Controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="pointer-events-auto panel w-full max-w-sm p-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-semibold text-mist-50">{t.explore.title}</h1>
            <button
              type="button"
              onClick={() => setListMode((v) => !v)}
              disabled={webglFailed}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-mist-200 hover:border-white/25 disabled:opacity-40"
            >
              {listMode ? <Globe2 className="h-3.5 w-3.5" aria-hidden /> : <List className="h-3.5 w-3.5" aria-hidden />}
              {listMode ? t.explore.globeView : t.explore.listView}
            </button>
          </div>
          {webglFailed && <p className="mt-2 text-xs text-risk-elevated">{t.explore.webglUnavailable}</p>}

          <div className="relative mt-4">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mist-500" aria-hidden />
            <input
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder={`${t.common.country}…`}
              aria-label={t.common.country}
              className="h-10 w-full rounded-xl border border-white/10 bg-ink-900/70 pr-3 pl-9 text-sm text-mist-50 placeholder:text-mist-500 focus:border-aurora-cyan/60 focus:outline-none"
            />
            {countryMatches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl">
                {countryMatches.map((c) => (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaceQuery("");
                        void selectCountry(c.code);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-mist-100 hover:bg-white/[0.06]"
                    >
                      {locale === "ru" ? c.nameRu : c.name}
                      <span className="font-mono text-[10px] text-mist-500">{countryCounts[c.code] ?? 0}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <fieldset className="mt-4">
            <legend className="eyebrow mb-2">{t.explore.layers}</legend>
            <div className="grid gap-1.5">
              {LAYERS.map((layer) => (
                <label key={layer} className="flex cursor-pointer items-center gap-2.5 text-sm text-mist-200">
                  <input type="checkbox" checked={layers[layer]} onChange={(e) => setLayers((l) => ({ ...l, [layer]: e.target.checked }))} className="h-4 w-4 accent-[#38d5f5]" />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: layerColor[layer] }} aria-hidden />
                  {layerLabel[layer]}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-mist-200">
                <input type="checkbox" checked={showAlerts} onChange={(e) => setShowAlerts(e.target.checked)} className="h-4 w-4 accent-[#38d5f5]" />
                <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: ALERT_COLORS.critical }} aria-hidden />
                {t.explore.layerAlerts}
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm text-mist-200">
                <input type="checkbox" checked={showArcs} onChange={(e) => setShowArcs(e.target.checked)} className="h-4 w-4 accent-[#38d5f5]" />
                <span className="h-0.5 w-3 rounded bg-gradient-to-r from-dim-cultural to-dim-scientific" aria-hidden />
                {t.explore.layerConnections}
              </label>
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="eyebrow mb-2 flex w-full items-center justify-between">
              <span>{t.explore.periodFilter}</span>
              {periodActive && (
                <button type="button" onClick={() => setPeriod([PERIOD_MIN, PERIOD_MAX])} className="inline-flex items-center gap-1 text-[10px] text-aurora-cyan">
                  <RotateCcw className="h-3 w-3" aria-hidden />
                  {t.explore.allPeriods}
                </button>
              )}
            </legend>
            <p className="mb-2 font-mono text-xs text-mist-300">
              {formatYear(period[0], locale)} — {formatYear(period[1], locale)}
            </p>
            <label className="sr-only" htmlFor="period-from">
              {t.explore.from}
            </label>
            <input
              id="period-from"
              type="range"
              min={PERIOD_MIN}
              max={PERIOD_MAX}
              step={10}
              value={period[0]}
              onChange={(e) => setPeriod(([, b]) => [Math.min(Number(e.target.value), b), b])}
              className="w-full accent-[#3ee6a8]"
            />
            <label className="sr-only" htmlFor="period-to">
              {t.explore.to}
            </label>
            <input
              id="period-to"
              type="range"
              min={PERIOD_MIN}
              max={PERIOD_MAX}
              step={10}
              value={period[1]}
              onChange={(e) => setPeriod(([a]) => [a, Math.max(Number(e.target.value), a)])}
              className="w-full accent-[#38d5f5]"
            />
          </fieldset>
          <p className="mt-3 text-xs text-mist-500">{format(t.explore.pointsShown, { count: visiblePoints.length })}</p>
        </div>

        {/* Selection panel */}
        {(selectedPoint || selectedCountry) && (
          <div className="pointer-events-auto panel w-full max-w-sm p-5 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <p className="eyebrow">{selectedPoint ? layerLabel[selectedPoint.layer] : t.common.country}</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedPoint(null);
                  setSelectedCountry(null);
                  setPlace(null);
                }}
                className="rounded-md p-1 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100"
                aria-label={t.nav.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {selectedPoint && (
              <>
                <h2 className="mt-2 font-display text-2xl leading-tight font-semibold text-mist-50">{selectedPoint.title}</h2>
                {selectedPoint.subtitle && <p className="mt-1 text-sm text-mist-400">{selectedPoint.subtitle}</p>}
                {selectedPoint.periodStart != null && (
                  <p className="mt-2 font-mono text-xs text-mist-400">
                    {formatYear(selectedPoint.periodStart, locale)}
                    {selectedPoint.periodEnd != null && selectedPoint.periodEnd !== selectedPoint.periodStart ? ` — ${formatYear(selectedPoint.periodEnd, locale)}` : ""}
                  </p>
                )}
                <Link href={selectedPoint.href} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-ink-950">
                  {t.explore.openRecord} →
                </Link>
                {selectedPoint.countryCode && (
                  <button type="button" onClick={() => selectCountry(selectedPoint.countryCode!)} className="mt-3 flex items-center gap-1.5 text-sm text-aurora-cyan hover:underline">
                    <MapPin className="h-4 w-4" aria-hidden />
                    {t.explore.openPlace}
                  </button>
                )}
              </>
            )}
            {selectedCountry && (
              <>
                {placeLoading && <Loader2 className="mt-4 h-5 w-5 animate-spin text-mist-400" aria-label={t.common.loading} />}
                {place && !placeLoading && (
                  <>
                    <h2 className="mt-2 font-display text-3xl font-semibold text-mist-50">{locale === "ru" ? place.nameRu : place.name}</h2>
                    {place.subregion && <p className="text-sm text-mist-400">{place.subregion}</p>}
                    <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                      {(
                        [
                          [t.place.records, place.counts.records],
                          [t.place.languages, place.counts.languages],
                          [t.place.species, place.counts.species],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/[0.06] p-2">
                          <dd className="font-display text-2xl text-mist-50">{value}</dd>
                          <dt className="text-[10px] tracking-wide text-mist-400 uppercase">{label}</dt>
                        </div>
                      ))}
                    </dl>
                    {place.records.length === 0 ? (
                      <p className="mt-4 text-sm text-mist-400">
                        {t.place.noRecords} {t.place.beFirst}
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-1.5">
                        {place.records.map((r) => (
                          <li key={r.slug}>
                            <Link href={r.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-mist-100 hover:bg-white/[0.05]">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIMENSION_COLORS[r.dimension as keyof typeof DIMENSION_COLORS] }} aria-hidden />
                              <span className="truncate">{r.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {place.alerts.length > 0 && (
                      <div className="mt-4 border-t border-white/[0.06] pt-3">
                        <p className="eyebrow mb-2">{t.place.alerts}</p>
                        <ul className="space-y-1">
                          {place.alerts.slice(0, 3).map((a) => (
                            <li key={a.href}>
                              <Link href={a.href} className="flex items-center justify-between gap-2 text-sm text-mist-200 hover:text-mist-50">
                                <span className="truncate">{a.name}</span>
                                <span className="font-mono text-xs" style={{ color: ALERT_COLORS[a.level as keyof typeof ALERT_COLORS] }}>
                                  {a.score}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Link href={place.href} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-ink-950">
                      {t.explore.openPlace} →
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!selectedPoint && !selectedCountry && !listMode && (
        <p className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-ink-950/70 px-4 py-2 text-center text-xs text-mist-300 backdrop-blur md:bottom-6">
          {t.explore.selectHint}
        </p>
      )}

      {/* Accessible list view, also the fallback without WebGL */}
      {listMode && (
        <div className="absolute inset-0 overflow-y-auto px-3 pt-[22rem] pb-24 sm:px-4 lg:pt-4 lg:pl-[26rem]">
          <ul className="grid gap-2 lg:grid-cols-2">
            {visiblePoints.map((p) => (
              <li key={`${p.layer}-${p.id}`}>
                <Link href={p.href} className={cn("panel flex items-center gap-3 p-3 text-sm hover:border-white/20")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-mist-50">{p.title}</span>
                    <span className="block truncate text-xs text-mist-400">
                      {layerLabel[p.layer]} · {p.subtitle}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
