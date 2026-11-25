"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { EarthGlobe } from "./EarthGlobe";
import type { GlobeArc, GlobePoint, GlobeRing } from "./types";

/** Hero globe: slow rotation, click a point to open it, click a country to open its page. */
export function HomeGlobe({ points, rings, arcs, countryCounts }: { points: GlobePoint[]; rings: GlobeRing[]; arcs: GlobeArc[]; countryCounts: Record<string, number> }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <EarthGlobe
      className="h-full w-full"
      points={points}
      rings={rings}
      arcs={arcs}
      countryCounts={countryCounts}
      interactive={false}
      autoRotate
      initialView={{ lat: 30, lng: 62, altitude: 2.05 }}
      onPointSelect={(p) => router.push(p.href)}
      onCountrySelect={(code) => router.push(`/places/${code.toLowerCase()}`)}
      loadingLabel={t.common.loading}
    />
  );
}
