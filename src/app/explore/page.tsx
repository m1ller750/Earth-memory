import type { Metadata } from "next";
import { ExploreView } from "@/components/globe/ExploreView";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getGlobeData } from "@/server/globe";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.explore.title };
}

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const sp = await searchParams;
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const focus = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && sp.lat !== undefined ? { lat, lng } : null;
  const from = Number(sp.from);
  const to = Number(sp.to);
  const period: [number, number] | null = sp.from !== undefined && sp.to !== undefined && Number.isInteger(from) && Number.isInteger(to) && from <= to ? [Math.max(-3500, from), Math.min(new Date().getFullYear(), to)] : null;
  const data = await getGlobeData(await getViewer());
  return (
    <div className="-mb-24">
      <ExploreView points={data.points} rings={data.rings} arcs={data.arcs} countryCounts={data.countryCounts} countries={data.countries} initialFocus={focus} initialPeriod={period} />
    </div>
  );
}
