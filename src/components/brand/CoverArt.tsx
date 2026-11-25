import { curveCatmullRomClosed, line } from "d3-shape";
import type { Dimension } from "@/lib/db/schema";
import { DIMENSION_TINTS } from "./DimensionGlyph";

/**
 * Generative cover for records without images: topographic contour lines unique to
 * each record. It is decorative and never imitates a photograph.
 */

function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One decimal is invisible at these sizes and keeps the SVG (and the page payload) small.
const contour = line<[number, number]>().curve(curveCatmullRomClosed.alpha(0.5)).digits(1);

export function CoverArt({
  seed,
  dimension,
  className,
  width = 480,
  height = 280,
  title,
}: {
  seed: string;
  dimension: Dimension;
  className?: string;
  width?: number;
  height?: number;
  title?: string;
}) {
  const rand = seededRandom(seed);
  const color = DIMENSION_TINTS[dimension];
  const cx = width * (0.3 + rand() * 0.4);
  const cy = height * (0.35 + rand() * 0.3);
  const harmonics = Array.from({ length: 4 }, (_, i) => ({ amp: (0.18 - i * 0.035) * (0.6 + rand()), phase: rand() * Math.PI * 2, freq: i + 2 }));
  const rings = 9 + Math.floor(rand() * 5);
  const baseRadius = Math.min(width, height) * 0.09;
  const paths: string[] = [];
  for (let r = 0; r < rings; r++) {
    const radius = baseRadius * (1 + r * 0.62);
    const points: Array<[number, number]> = [];
    for (let k = 0; k < 28; k++) {
      const angle = (k / 28) * Math.PI * 2;
      const wobble = harmonics.reduce((sum, h) => sum + h.amp * Math.sin(h.freq * angle + h.phase + r * 0.17), 0);
      const rr = radius * (1 + wobble);
      points.push([cx + Math.cos(angle) * rr * 1.25, cy + Math.sin(angle) * rr * 0.82]);
    }
    paths.push(contour(points) ?? "");
  }
  const gradientId = `cover-${seed.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <radialGradient id={gradientId} cx={cx / width} cy={cy / height} r="0.9">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="0.45" stopColor="#0c1524" stopOpacity="1" />
          <stop offset="1" stopColor="#050a13" stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${gradientId})`} />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1="0" x2={width} y1={(height / 6) * (i + 0.5)} y2={(height / 6) * (i + 0.5)} stroke="#9eaec4" strokeOpacity="0.05" />
      ))}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeOpacity={Math.max(0.08, 0.75 - i * 0.07)} strokeWidth={i === 0 ? 1.6 : 1} />
      ))}
      <circle cx={cx} cy={cy} r="3.2" fill="#f2f6fb" />
      <circle cx={cx} cy={cy} r="9" fill="none" stroke={color} strokeOpacity="0.5" />
    </svg>
  );
}
