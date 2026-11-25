import type { Metadata } from "next";
import Link from "next/link";
import { DiscoveryCard } from "@/components/connections/DiscoveryCard";
import { GraphView } from "@/components/graph/GraphView";
import { Container, EmptyState, PageHeader, SectionHeading } from "@/components/ui/layout";
import { getViewer } from "@/lib/auth/session";
import { getI18n } from "@/lib/i18n/server";
import { getDiscoveries } from "@/server/connections";
import { findNode, neighborhood, nodeKey } from "@/server/graph";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.graph.title, description: t.graph.lede };
}

export default async function GraphPage({ searchParams }: PageProps<"/graph">) {
  const { t } = await getI18n();
  const viewer = await getViewer();
  const sp = await searchParams;
  const ref = typeof sp.node === "string" ? sp.node : "entity:silk-road";
  const depth = sp.depth === "1" ? 1 : sp.depth === "3" ? 3 : 2;
  const includeProposed = sp.proposed !== "0";
  const root = await findNode(ref);
  const [graph, discoveries] = await Promise.all([
    root ? neighborhood(root, viewer, { depth, includeProposed, maxNodes: depth === 3 ? 90 : 70 }) : Promise.resolve(null),
    getDiscoveries({ limit: 4 }),
  ]);
  const rootKey = root ? nodeKey(root.type, root.id) : "";
  const param = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ node: ref, depth: String(depth), proposed: includeProposed ? "1" : "0", ...patch });
    return `/graph?${p.toString()}`;
  };

  return (
    <Container wide>
      <PageHeader eyebrow={t.nav.graph} title={t.graph.title} lede={t.graph.lede} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-mist-400">{t.graph.depth}:</span>
        {[1, 2, 3].map((d) => (
          <Link key={d} href={param({ depth: String(d) })} className={`rounded-lg border px-3 py-1 ${d === depth ? "border-aurora-cyan/50 text-mist-50" : "border-white/10 text-mist-300"}`}>
            {d}
          </Link>
        ))}
        <Link href={param({ proposed: includeProposed ? "0" : "1" })} className={`ml-2 rounded-lg border px-3 py-1 ${includeProposed ? "border-ai/50 text-mist-50" : "border-white/10 text-mist-300"}`}>
          {includeProposed ? "✓ " : ""}
          {t.graph.showProposed}
        </Link>
      </div>
      {graph && graph.nodes.length > 0 ? <GraphView nodes={graph.nodes} links={graph.links} rootKey={rootKey} /> : <EmptyState title={t.graph.empty} />}

      {discoveries.length > 0 && (
        <section className="mt-14">
          <SectionHeading title={t.graph.hidden} lede={t.graph.hiddenLede} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {discoveries.map((d) => (
              <DiscoveryCard key={d.id} discovery={d} t={t} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
