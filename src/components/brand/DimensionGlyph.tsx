import type { Dimension } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

/**
 * Series colours for data marks (globe points, timeline bars, arcs). Validated with the
 * dataviz palette checker on the dark surface #08101c in this lane order: all adjacent
 * pairs pass (worst CVD ΔE 8.4, normal-vision ΔE 19.8, contrast ≥ 3:1). Five hues cannot
 * pass the all-pairs test, so scattered marks always carry a second channel (tooltip text,
 * list view, glyph shapes in legends).
 */
export const DIMENSION_COLORS: Record<Dimension, string> = {
  human: "#d95926",
  cultural: "#9085e9",
  historical: "#c98500",
  natural: "#199e70",
  scientific: "#3987e5",
};

/** Lighter tints of the same hue families, used for text, glyphs and illustration only. */
export const DIMENSION_TINTS: Record<Dimension, string> = {
  human: "#ff9b85",
  cultural: "#c4a3ff",
  historical: "#e9cf86",
  natural: "#4ade9b",
  scientific: "#5cc8ff",
};

export const DIMENSION_TEXT: Record<Dimension, string> = {
  human: "text-dim-human",
  cultural: "text-dim-cultural",
  historical: "text-dim-historical",
  natural: "text-dim-natural",
  scientific: "text-dim-scientific",
};

/** Custom glyphs for the five dimensions of memory. Shape carries meaning, not only colour. */
export function DimensionGlyph({ dimension, className }: { dimension: Dimension; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 24 24" className={cn("h-5 w-5", DIMENSION_TEXT[dimension], className)} aria-hidden>
      {dimension === "human" && (
        <g {...common}>
          <circle cx="12" cy="7.5" r="3" />
          <path d="M5.5 20c1.3-3.9 3.6-5.8 6.5-5.8s5.2 1.9 6.5 5.8" />
          <path d="M19.5 6.5c1 1.2 1 3.3 0 4.5M4.5 6.5c-1 1.2-1 3.3 0 4.5" opacity="0.6" />
        </g>
      )}
      {dimension === "cultural" && (
        <g {...common}>
          <path d="M12 12.2a.9.9 0 1 1 .9-.9 2.6 2.6 0 1 1-5.2 0 4.4 4.4 0 0 1 8.8 0 6.2 6.2 0 0 1-12.4 0 8 8 0 0 1 16 0" />
        </g>
      )}
      {dimension === "historical" && (
        <g {...common}>
          <path d="M3.5 9.5 12 4l8.5 5.5z" />
          <path d="M6 9.5V19M10 9.5V19M14 9.5V19M18 9.5V19" />
          <path d="M3.5 20h17" />
        </g>
      )}
      {dimension === "natural" && (
        <g {...common}>
          <path d="M5 19C5 11 10.5 5 19 5c0 8.5-6 14-14 14z" />
          <path d="M5 19 13.5 10.5" />
        </g>
      )}
      {dimension === "scientific" && (
        <g {...common}>
          <ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(-28 12 12)" />
          <ellipse cx="12" cy="12" rx="9.2" ry="3.8" transform="rotate(32 12 12)" opacity="0.6" />
          <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
        </g>
      )}
    </svg>
  );
}
