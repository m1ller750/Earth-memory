"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

/**
 * Small chart kit following the project's data-viz rules: one hue per single-measure chart,
 * thin marks with 4px rounded data ends anchored to the baseline, 2px gaps, recessive axes,
 * a hover tooltip on every mark, and a table view for every chart.
 */

export const SERIES_HUE = "#3987e5"; // validated series slot on the dark surface

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  icon?: ReactNode;
  href?: string;
}

function TableView({ caption, rows, valueLabel }: { caption: string; rows: Array<{ label: string; value: number }>; valueLabel: string }) {
  return (
    <details className="mt-3 text-xs text-mist-400">
      <summary className="cursor-pointer select-none hover:text-mist-200">Table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="py-1.5 font-medium">{caption}</th>
            <th className="py-1.5 text-right font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-white/[0.04]">
              <td className="py-1.5 text-mist-200">{r.label}</td>
              <td className="py-1.5 text-right font-mono text-mist-100">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Horizontal bars for a single measure across categories. */
export function BarList({ data, caption, valueLabel = "Records", color = SERIES_HUE }: { data: BarDatum[]; caption: string; valueLabel?: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <ul className="space-y-2">
        {data.map((d) => {
          const pct = (d.value / max) * 100;
          const content = (
            <>
              <span className="flex w-40 shrink-0 items-center gap-2 truncate text-sm text-mist-200 sm:w-48">
                {d.icon}
                <span className="truncate">{d.label}</span>
              </span>
              <span className="relative h-3 flex-1">
                <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${Math.max(pct, d.value > 0 ? 1.5 : 0)}%`, background: color, opacity: hover && hover !== d.key ? 0.45 : 1 }} />
              </span>
              <span className="w-12 shrink-0 text-right font-mono text-xs text-mist-100">{d.value}</span>
              {hover === d.key && (
                <span role="tooltip" className="pointer-events-none absolute -top-9 left-48 z-10 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1 text-xs whitespace-nowrap text-mist-100 shadow-xl">
                  {d.label}: <strong>{d.value}</strong>
                </span>
              )}
            </>
          );
          return (
            <li key={d.key} className="relative" onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(d.key)} onBlur={() => setHover(null)}>
              {d.href ? (
                <Link href={d.href} className="flex items-center gap-3 rounded-md py-0.5 outline-offset-2">
                  {content}
                </Link>
              ) : (
                <div tabIndex={0} className="flex items-center gap-3 rounded-md py-0.5 outline-offset-2">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <TableView caption={caption} rows={data} valueLabel={valueLabel} />
    </figure>
  );
}

/** Vertical columns along an ordered axis (for example centuries). */
export function ColumnChart({ data, caption, valueLabel = "Records", color = SERIES_HUE }: { data: BarDatum[]; caption: string; valueLabel?: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { top: 16, bottom: 34, left: 28, right: 8 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 2;
  const bw = data.length ? (W - pad.left - pad.right) / data.length : 0;
  const y = (v: number) => pad.top + (1 - v / max) * (H - pad.top - pad.bottom);
  const gridValues = [0, Math.ceil(max / 2), max];
  const labelEvery = Math.max(1, Math.ceil(data.length / 10));
  return (
    <figure className="relative">
      <figcaption className="sr-only">{caption}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={caption} onMouseLeave={() => setHover(null)}>
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="#9eaec4" strokeOpacity={v === 0 ? 0.25 : 0.08} />
            <text x={pad.left - 6} y={y(v)} dominantBaseline="middle" textAnchor="end" fontSize="10" fill="#7a8ca6" fontFamily="var(--font-mono)">
              {v}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * bw + gap / 2;
          const top = y(d.value);
          const h = Math.max(0, H - pad.bottom - top);
          const r = Math.min(4, h / 2, (bw - gap) / 2);
          // Only the data end is rounded; the base sits flat on the baseline.
          const path = h > 0 ? `M${x},${H - pad.bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - gap - r} Q${x + bw - gap},${top} ${x + bw - gap},${top + r} V${H - pad.bottom} Z` : "";
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${d.value}`}>
              <rect x={x} y={pad.top} width={bw - gap} height={H - pad.top - pad.bottom} fill="transparent" />
              {path && <path d={path} fill={color} opacity={hover !== null && hover !== i ? 0.45 : 1} />}
              {i % labelEvery === 0 && (
                <text x={x + (bw - gap) / 2} y={H - pad.bottom + 16} fontSize="10" textAnchor="middle" fill="#7a8ca6" fontFamily="var(--font-mono)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-0 rounded-lg border border-white/10 bg-ink-850 px-2.5 py-1 text-xs whitespace-nowrap text-mist-100 shadow-xl"
          style={{ left: `${((pad.left + hover * bw + bw / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
        >
          {data[hover].label}: <strong>{data[hover].value}</strong>
        </div>
      )}
      <TableView caption={caption} rows={data} valueLabel={valueLabel} />
    </figure>
  );
}
