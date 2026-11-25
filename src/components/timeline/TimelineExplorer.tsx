"use client";

import { Globe2, Maximize2, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { DIMENSION_COLORS, DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { DIMENSIONS, type Dimension } from "@/lib/db/schema";
import { format, formatYear } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { TimelineObservation, TimelineRecord } from "@/server/timeline";
import { AXIS_TICKS, timeToUnit, unitToTime } from "./scale";

const W = 1200;
const LANE_H = 46;
const TOP = 24;
const LANES: Array<Dimension | "ecosystem"> = [...DIMENSIONS, "ecosystem"];
const H = TOP + LANES.length * LANE_H + 34;

function niceTicks(a: number, b: number): number[] {
  const span = b - a;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => span / s <= 10) ?? 1000;
  const first = Math.ceil(a / step) * step;
  const ticks: number[] = [];
  for (let y = first; y <= b; y += step) ticks.push(y);
  return ticks;
}

export function TimelineExplorer({ records, observations }: { records: TimelineRecord[]; observations: TimelineObservation[] }) {
  const { t, locale } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [range, setRange] = useState<[number, number] | null>(null); // zoomed range (linear scale)
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [brush, setBrush] = useState<{ start: number; current: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const toX = (year: number) => (range ? ((year - range[0]) / (range[1] - range[0])) * W : timeToUnit(year) * W);
  const toYear = (x: number) => (range ? Math.round(range[0] + (x / W) * (range[1] - range[0])) : unitToTime(x / W));
  const laneY = (lane: Dimension | "ecosystem") => TOP + LANES.indexOf(lane) * LANE_H + LANE_H / 2;
  const ticks = range ? niceTicks(range[0], range[1]) : AXIS_TICKS;

  const svgX = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(W, ((clientX - rect.left) / rect.width) * W));
  };

  const inSelection = useMemo(() => {
    const [a, b] = selection ?? [-Infinity, Infinity];
    return records.filter((r) => r.start <= b && r.end >= a);
  }, [records, selection]);
  const obsInSelection = useMemo(() => {
    const [a, b] = selection ?? [-Infinity, Infinity];
    return observations.filter((o) => o.year <= b && (o.yearEnd ?? o.year) >= a);
  }, [observations, selection]);

  const brushRange = brush ? ([Math.min(brush.start, brush.current), Math.max(brush.start, brush.current)] as const) : null;

  return (
    <div>
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <p className="text-sm text-mist-300">
            {selection ? (
              <>
                <span className="eyebrow mr-2">{t.timeline.selection}</span>
                {formatYear(selection[0], locale)} — {formatYear(selection[1], locale)} · {format(t.timeline.inPeriod, { count: inSelection.length })}
              </>
            ) : (
              <span className="text-mist-400">{t.timeline.lede}</span>
            )}
          </p>
          <div className="flex gap-2">
            {selection && (
              <>
                <button type="button" onClick={() => setRange(selection)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-mist-100 hover:border-white/25">
                  <ZoomIn className="h-3.5 w-3.5" aria-hidden />
                  {t.timeline.zoomIn}
                </button>
                <Link href={`/explore?from=${selection[0]}&to=${selection[1]}`} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-mist-100 hover:border-white/25">
                  <Globe2 className="h-3.5 w-3.5" aria-hidden />
                  {t.common.showOnGlobe}
                </Link>
              </>
            )}
            {(range || selection) && (
              <button
                type="button"
                onClick={() => {
                  setRange(null);
                  setSelection(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-mist-100 hover:border-white/25"
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                {t.timeline.reset}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="h-auto w-full min-w-[720px] touch-none select-none"
            role="img"
            aria-label={t.timeline.title}
            onPointerDown={(e) => {
              if ((e.target as Element).closest("[data-item]")) return;
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              const x = svgX(e.clientX);
              setBrush({ start: x, current: x });
            }}
            onPointerMove={(e) => brush && setBrush({ ...brush, current: svgX(e.clientX) })}
            onPointerUp={() => {
              if (brush && Math.abs(brush.current - brush.start) > 6) {
                const a = toYear(Math.min(brush.start, brush.current));
                const b = toYear(Math.max(brush.start, brush.current));
                setSelection([a, b]);
              }
              setBrush(null);
            }}
            onWheel={(e) => {
              const x = svgX(e.clientX);
              const center = toYear(x);
              const [a, b] = range ?? [-3500, 2030];
              const span = Math.max(20, Math.min(5530, (b - a) * (e.deltaY < 0 ? 0.8 : 1.25)));
              const ratio = x / W;
              const na = Math.round(Math.max(-3500, center - span * ratio));
              setRange(span >= 5530 ? null : [na, Math.min(2030, na + span)]);
            }}
          >
            {/* Lanes */}
            {LANES.map((lane) => (
              <g key={lane}>
                <rect x={0} y={laneY(lane) - LANE_H / 2} width={W} height={LANE_H} fill={LANES.indexOf(lane) % 2 ? "rgb(255 255 255 / 0.015)" : "transparent"} />
                <line x1={0} x2={W} y1={laneY(lane)} y2={laneY(lane)} stroke={lane === "ecosystem" ? "#2fd8c4" : DIMENSION_COLORS[lane]} strokeOpacity="0.15" />
              </g>
            ))}
            {/* Axis */}
            {ticks.map((year) => {
              const x = toX(year);
              if (x < 0 || x > W) return null;
              return (
                <g key={year}>
                  <line x1={x} x2={x} y1={TOP - 10} y2={H - 30} stroke="#9eaec4" strokeOpacity="0.08" />
                  <text x={x} y={H - 12} fill="#7a8ca6" fontSize="12" textAnchor="middle" fontFamily="var(--font-mono)">
                    {formatYear(year, locale)}
                  </text>
                </g>
              );
            })}
            {/* Selection */}
            {selection && <rect x={toX(selection[0])} y={TOP - 12} width={Math.max(2, toX(selection[1]) - toX(selection[0]))} height={H - TOP - 18} fill="#38d5f5" fillOpacity="0.07" stroke="#38d5f5" strokeOpacity="0.4" />}
            {brushRange && <rect x={brushRange[0]} y={TOP - 12} width={brushRange[1] - brushRange[0]} height={H - TOP - 18} fill="#3ee6a8" fillOpacity="0.1" stroke="#3ee6a8" strokeDasharray="4 3" />}
            {/* Records */}
            {records.map((r) => {
              const x1 = toX(r.start);
              const x2 = Math.max(x1 + 4, toX(r.end));
              if (x2 < 0 || x1 > W) return null;
              const y = laneY(r.dimension);
              const color = DIMENSION_COLORS[r.dimension];
              const label = range && x2 - x1 > 60;
              return (
                <a key={r.id} href={`/archive/${r.slug}`} data-item onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)}>
                  <rect x={x1} y={y - 5} width={x2 - x1} height={10} rx={5} fill={color} fillOpacity={hover === r.id ? 0.95 : 0.55} />
                  <circle cx={x1} cy={y} r={hover === r.id ? 6 : 4.5} fill={color} stroke="#050a13" strokeWidth={1.5} />
                  {label && (
                    <text x={x1 + 8} y={y - 9} fontSize="11" fill="#e3eaf3" stroke="#050a13" strokeWidth={3} paintOrder="stroke">
                      {r.title.length > 40 ? `${r.title.slice(0, 38)}…` : r.title}
                    </text>
                  )}
                  <title>{`${r.title} (${formatYear(r.start, locale)}${r.end !== r.start ? ` – ${formatYear(r.end, locale)}` : ""})`}</title>
                </a>
              );
            })}
            {/* Ecosystem observations */}
            {observations.map((o) => {
              const x = toX(o.year);
              if (x < 0 || x > W) return null;
              return (
                <a key={o.id} href={`/living-earth/ecosystems/${o.ecosystemSlug}`} data-item>
                  <rect x={x - 4.5} y={laneY("ecosystem") - 4.5} width={9} height={9} transform={`rotate(45 ${x} ${laneY("ecosystem")})`} fill="#2fd8c4" fillOpacity="0.85" />
                  <title>{`${o.year}: ${o.ecosystemName} — ${o.title}`}</title>
                </a>
              );
            })}
          </svg>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.06] px-4 py-3 text-xs text-mist-400">
          {DIMENSIONS.map((d) => (
            <li key={d} className="flex items-center gap-1.5">
              <DimensionGlyph dimension={d} className="h-3.5 w-3.5" />
              {t.dimensions[d]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rotate-45 bg-[#2fd8c4]" aria-hidden />
            {t.living.observations}
          </li>
          <li className="ml-auto">{t.timeline.noDated}</li>
        </ul>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ol className="space-y-2">
          {inSelection.map((r) => (
            <li key={r.id}>
              <Link href={`/archive/${r.slug}`} className="panel flex items-center gap-4 p-3.5 hover:border-white/20">
                <span className="w-36 shrink-0 font-mono text-xs text-mist-400">
                  {formatYear(r.start, locale)}
                  {r.end !== r.start ? ` – ${r.end >= new Date().getFullYear() ? t.common.present : formatYear(r.end, locale)}` : ""}
                </span>
                <DimensionGlyph dimension={r.dimension} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-mist-50">{r.title}</span>
              </Link>
            </li>
          ))}
        </ol>
        <div>
          <h2 className="eyebrow mb-3">{t.living.observations}</h2>
          <ol className="space-y-2">
            {obsInSelection.map((o) => (
              <li key={o.id}>
                <Link href={`/living-earth/ecosystems/${o.ecosystemSlug}`} className="panel block p-3.5 hover:border-white/20">
                  <span className="font-mono text-xs text-aurora-teal">
                    {o.year}
                    {o.yearEnd ? `–${o.yearEnd}` : ""} · {o.ecosystemName}
                  </span>
                  <span className="mt-1 block text-sm text-mist-100">{o.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
