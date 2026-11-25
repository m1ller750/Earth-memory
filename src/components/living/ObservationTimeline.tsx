"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatYear } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

export interface Observation {
  id: string;
  year: number;
  yearEnd: number | null;
  title: string;
  observation: string;
  metricName: string | null;
  metricValue: number | null;
  metricUnit: string | null;
  sourceCitation: string;
  sourceUrl: string | null;
  reliability: string;
}

const RELIABILITY_TONE = { high: "emerald", medium: "cyan", low: "amber" } as const;

/** Chronological observations plus a two-period comparison of what is documented. */
export function ObservationTimeline({ observations }: { observations: Observation[] }) {
  const { t, locale } = useI18n();
  const years = observations.map((o) => o.year);
  const min = Math.min(...years);
  const max = Math.max(...observations.map((o) => o.yearEnd ?? o.year));
  const [split, setSplit] = useState(() => Math.round((min + max) / 2));

  const [before, after] = useMemo(() => [observations.filter((o) => (o.yearEnd ?? o.year) < split), observations.filter((o) => (o.yearEnd ?? o.year) >= split)], [observations, split]);

  if (observations.length === 0) return <p className="text-sm text-mist-500">{t.living.noObservations}</p>;

  const width = 1000;
  const x = (y: number) => (max === min ? width / 2 : 30 + ((y - min) / (max - min)) * (width - 60));

  const card = (o: Observation) => (
    <li key={o.id} className="panel-solid p-4">
      <p className="font-mono text-xs text-aurora-cyan">
        {formatYear(o.year, locale)}
        {o.yearEnd ? ` – ${formatYear(o.yearEnd, locale)}` : ""}
      </p>
      <p className="mt-1 font-semibold text-mist-50">{o.title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-mist-300">{o.observation}</p>
      {o.metricValue != null && (
        <p className="mt-2 font-display text-3xl text-mist-50">
          {o.metricValue}
          <span className="ml-1 text-base text-mist-400">{o.metricUnit}</span>
          <span className="block font-sans text-xs text-mist-400">{o.metricName}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-mist-400">
        <Badge tone={RELIABILITY_TONE[o.reliability as keyof typeof RELIABILITY_TONE] ?? "neutral"}>
          {t.living.reliability}: {t.living.reliabilityLevels[o.reliability as keyof typeof t.living.reliabilityLevels] ?? o.reliability}
        </Badge>
        {o.sourceUrl ? (
          <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-mist-100 hover:underline">
            {o.sourceCitation} ↗
          </a>
        ) : (
          <span>{o.sourceCitation}</span>
        )}
      </div>
    </li>
  );

  return (
    <div>
      <div className="panel overflow-hidden p-4" id="observations">
        <svg viewBox={`0 0 ${width} 90`} className="h-auto w-full" role="img" aria-label={t.living.observations}>
          <line x1={20} x2={width - 20} y1={45} y2={45} stroke="#9eaec4" strokeOpacity="0.25" />
          <line x1={x(split)} x2={x(split)} y1={10} y2={80} stroke="#38d5f5" strokeDasharray="4 4" />
          {observations.map((o) => (
            <g key={o.id}>
              {o.yearEnd && <rect x={x(o.year)} y={41} width={Math.max(4, x(o.yearEnd) - x(o.year))} height={8} rx={4} fill="#4ade9b" fillOpacity="0.4" />}
              <circle cx={x(o.year)} cy={45} r={6} fill={(o.yearEnd ?? o.year) < split ? "#e9cf86" : "#4ade9b"}>
                <title>{`${o.year}: ${o.title}`}</title>
              </circle>
              <text x={x(o.year)} y={75} textAnchor="middle" fill="#7a8ca6" fontSize="12" fontFamily="var(--font-mono)">
                {o.year}
              </text>
            </g>
          ))}
        </svg>
        <label className="mt-3 block">
          <span className="eyebrow">
            {t.living.compare}: {formatYear(split, locale)}
          </span>
          <input type="range" min={min} max={max + 1} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="mt-2 w-full accent-[#38d5f5]" />
        </label>
        <p className="text-xs text-mist-500">{t.living.compareHint}</p>
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="eyebrow mb-3">
            {t.living.before} {formatYear(split, locale)}
          </h3>
          {before.length ? <ul className="space-y-3">{before.map(card)}</ul> : <p className="text-sm text-mist-500">{t.living.noObservations}</p>}
        </div>
        <div>
          <h3 className="eyebrow mb-3">
            {t.living.after} {formatYear(split, locale)}
          </h3>
          {after.length ? <ul className="space-y-3">{after.map(card)}</ul> : <p className="text-sm text-mist-500">{t.living.noObservations}</p>}
        </div>
      </div>
    </div>
  );
}
