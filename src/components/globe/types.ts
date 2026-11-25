import type { Dimension } from "@/lib/db/schema";

export type GlobeLayer = "record" | "language" | "species" | "ecosystem" | "project";

export interface GlobePoint {
  id: string;
  layer: GlobeLayer;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  href: string;
  color: string;
  dimension?: Dimension;
  kind?: string;
  status?: string;
  countryCode?: string | null;
  periodStart?: number | null;
  periodEnd?: number | null;
  demo?: boolean;
}

export interface GlobeRing {
  lat: number;
  lng: number;
  color: string;
  label: string;
  href: string;
  level: string;
}

export interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  colors: [string, string] | string[];
  label: string;
  strength: number;
}
