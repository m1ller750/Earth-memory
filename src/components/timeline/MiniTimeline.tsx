import Link from "next/link";
import { DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import type { Dimension } from "@/lib/db/schema";
import { formatYear, type Locale } from "@/lib/i18n";
import { AXIS_TICKS, timeToUnit } from "./scale";

export interface TimelineDatum {
  slug: string;
  title: string;
  dimension: Dimension;
  start: number;
  end: number;
}

/** Static overview strip of dated records; links to the full interactive timeline. */
export function MiniTimeline({ items, locale }: { items: TimelineDatum[]; locale: Locale }) {
  const width = 1200;
  const height = 150;
  const lanes: Dimension[] = ["human", "cultural", "historical", "natural", "scientific"];
  const laneY = (d: Dimension) => 22 + lanes.indexOf(d) * 20;
  return (
    <Link href="/timeline" className="group block panel overflow-hidden p-4 sm:p-6" aria-label="Open the timeline">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-hidden>
        {AXIS_TICKS.map((year) => {
          const x = timeToUnit(year) * width;
          return (
            <g key={year}>
              <line x1={x} x2={x} y1={10} y2={height - 26} stroke="#9eaec4" strokeOpacity="0.08" />
              <text x={x} y={height - 8} fill="#7a8ca6" fontSize="12" textAnchor="middle" fontFamily="var(--font-mono)">
                {formatYear(year, locale)}
              </text>
            </g>
          );
        })}
        {lanes.map((d) => (
          <line key={d} x1={0} x2={width} y1={laneY(d)} y2={laneY(d)} stroke={DIMENSION_COLORS[d]} strokeOpacity="0.12" />
        ))}
        {items.map((item) => {
          const x1 = timeToUnit(item.start) * width;
          const x2 = Math.max(x1 + 3, timeToUnit(item.end) * width);
          const y = laneY(item.dimension);
          return (
            <g key={item.slug}>
              <rect x={x1} y={y - 3} width={x2 - x1} height={6} rx={3} fill={DIMENSION_COLORS[item.dimension]} fillOpacity="0.55">
                <title>{item.title}</title>
              </rect>
              <circle cx={x1} cy={y} r={3.5} fill={DIMENSION_COLORS[item.dimension]} />
            </g>
          );
        })}
      </svg>
    </Link>
  );
}
