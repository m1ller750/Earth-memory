"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { EarthGlobe } from "./EarthGlobe";
import type { GlobePoint } from "./types";

/** A compact globe showing one layer (languages, species…) where clicking a point opens it. */
export function LayerGlobe({ points, className, view }: { points: GlobePoint[]; className?: string; view?: { lat: number; lng: number; altitude: number } }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <EarthGlobe
      className={className}
      points={points}
      interactive
      autoRotate
      initialView={view ?? { lat: 35, lng: 40, altitude: 2.3 }}
      onPointSelect={(p) => router.push(p.href)}
      onCountrySelect={(code) => router.push(`/places/${code.toLowerCase()}`)}
      loadingLabel={t.common.loading}
    />
  );
}
