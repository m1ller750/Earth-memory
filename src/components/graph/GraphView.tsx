"use client";

import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { Maximize2, Minus, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import { Badge } from "@/components/ui/Badge";
import { humanizeRelation } from "@/components/ui/Prose";
import { useI18n } from "@/lib/i18n/client";
import type { GraphLink, GraphNode } from "@/server/graph";

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { data: GraphLink };

const TYPE_COLORS: Record<GraphNode["type"], string> = {
  record: "#e9cf86",
  entity: "#c5d1e0",
  language: "#f0506e",
  species: "#fb8a5c",
  ecosystem: "#2fd8c4",
  country: "#5d6f8a",
};

const UNCERTAINTY_DASH: Record<string, string | undefined> = { confirmed: undefined, probable: "6 4", speculative: "2 4" };

function nodeColor(n: GraphNode) {
  if (n.type === "record" && n.dimension) return DIMENSION_COLORS[n.dimension as keyof typeof DIMENSION_COLORS];
  return TYPE_COLORS[n.type];
}

function NodeShape({ n, r, selected }: { n: GraphNode; r: number; selected: boolean }) {
  const fill = nodeColor(n);
  const stroke = selected ? "#ffffff" : "rgba(2,5,11,0.9)";
  const sw = selected ? 2.5 : 1.5;
  switch (n.type) {
    case "entity":
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} transform="rotate(45)" fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "language":
      return <polygon points={Array.from({ length: 6 }, (_, i) => `${r * 1.1 * Math.cos((Math.PI / 3) * i)},${r * 1.1 * Math.sin((Math.PI / 3) * i)}`).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "species":
      return <polygon points={`0,${-r * 1.2} ${r * 1.1},${r * 0.8} ${-r * 1.1},${r * 0.8}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "country":
      return <circle r={r} fill="rgba(93,111,138,0.25)" stroke={fill} strokeWidth={2} />;
    default:
      return <circle r={r} fill={fill} stroke={stroke} strokeWidth={sw} />;
  }
}

export function GraphView({ nodes, links, rootKey }: { nodes: GraphNode[]; links: GraphLink[]; rootKey: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedKey, setSelectedKey] = useState<string>(rootKey);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const drag = useRef<{ kind: "pan" | "node"; key?: string; startX: number; startY: number; origin: { x: number; y: number } } | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Array<{ type: string; title: string; href: string; subtitle: string }>>([]);

  const W = 1000;
  const H = 700;

  // Lay out once per data change. A fixed number of ticks gives a stable, reproducible layout.
  useEffect(() => {
    const simNodes: SimNode[] = nodes.map((n) => ({ ...n, x: n.key === rootKey ? W / 2 : undefined, y: n.key === rootKey ? H / 2 : undefined, fx: n.key === rootKey ? W / 2 : undefined, fy: n.key === rootKey ? H / 2 : undefined }));
    const simLinks: SimLink[] = links.map((l) => ({ source: l.source, target: l.target, data: l }));
    const sim = forceSimulation(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.key).distance((l) => (l.data.status === "proposed" ? 140 : 95)).strength(0.5))
      .force("charge", forceManyBody().strength(-320))
      .force("center", forceCenter(W / 2, H / 2))
      .force("collide", forceCollide(26))
      .stop();
    sim.tick(320);
    setPositions(new Map(simNodes.map((n) => [n.key, { x: n.x ?? W / 2, y: n.y ?? H / 2 }])));
    setSelectedKey(rootKey);
    setSelectedLink(null);
    setView({ k: 1, x: 0, y: 0 });
  }, [nodes, links, rootKey]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of links) {
      d.set(l.source, (d.get(l.source) ?? 0) + 1);
      d.set(l.target, (d.get(l.target) ?? 0) + 1);
    }
    return d;
  }, [links]);

  const selected = nodes.find((n) => n.key === selectedKey) ?? null;
  const selectedLinks = links.filter((l) => l.source === selectedKey || l.target === selectedKey);
  const neighbourKeys = new Set(selectedLinks.flatMap((l) => [l.source, l.target]));
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=8`, { signal: controller.signal });
        if (res.ok) setHits(((await res.json()) as { results: typeof hits }).results);
      } catch {
        /* ignore */
      }
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [query]);

  const graphHref = (hit: { type: string; href: string }) => {
    const slug = hit.href.split("/").pop() ?? "";
    switch (hit.type) {
      case "record":
        return `/graph?node=record:${slug}`;
      case "language":
        return `/graph?node=language:${slug}`;
      case "species":
        return `/graph?node=species:${slug}`;
      case "ecosystem":
        return `/graph?node=ecosystem:${slug}`;
      case "entity":
        return hit.href;
      case "place":
        return /\/places\/[a-z]{2}$/.test(hit.href) ? `/graph?node=country:${slug}` : hit.href;
      default:
        return hit.href;
    }
  };

  const toGraphPoint = (clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k, sx, sy };
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="panel relative overflow-hidden">
        <div className="absolute top-3 left-3 z-10 w-72 max-w-[calc(100%-5rem)]">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-mist-500" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.graph.searchNode}
              aria-label={t.graph.searchNode}
              className="h-10 w-full rounded-xl border border-white/10 bg-ink-900/90 pr-3 pl-9 text-sm text-mist-50 placeholder:text-mist-500 focus:border-aurora-cyan/60 focus:outline-none"
            />
          </div>
          {hits.length > 0 && (
            <ul className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-2xl">
              {hits.map((h) => (
                <li key={`${h.type}-${h.href}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setHits([]);
                      router.push(graphHref(h));
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <span className="block truncate text-sm text-mist-50">{h.title}</span>
                    <span className="block truncate font-mono text-[10px] text-mist-500 uppercase">{h.type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          {[
            { label: t.timeline.zoomIn, icon: Plus, f: () => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.25) })) },
            { label: t.timeline.zoomOut, icon: Minus, f: () => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.25) })) },
            { label: t.timeline.reset, icon: Maximize2, f: () => setView({ k: 1, x: 0, y: 0 }) },
          ].map(({ label, icon: Icon, f }) => (
            <button key={label} type="button" onClick={f} aria-label={label} title={label} className="rounded-lg border border-white/10 bg-ink-900/90 p-2 text-mist-300 hover:text-mist-50">
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[70vh] min-h-[460px] w-full touch-none select-none"
          role="img"
          aria-label={t.graph.title}
          onWheel={(e) => {
            const p = toGraphPoint(e.clientX, e.clientY);
            const k = Math.min(3, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
            setView({ k, x: p.sx - p.x * k, y: p.sy - p.y * k });
          }}
          onPointerDown={(e) => {
            const target = (e.target as Element).closest("[data-node]");
            const key = target?.getAttribute("data-node") ?? undefined;
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
            drag.current = key
              ? { kind: "node", key, startX: e.clientX, startY: e.clientY, origin: positions.get(key) ?? { x: 0, y: 0 } }
              : { kind: "pan", startX: e.clientX, startY: e.clientY, origin: { x: view.x, y: view.y } };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const rect = svgRef.current!.getBoundingClientRect();
            const dx = ((e.clientX - d.startX) / rect.width) * W;
            const dy = ((e.clientY - d.startY) / rect.height) * H;
            if (d.kind === "pan") setView((v) => ({ ...v, x: d.origin.x + dx, y: d.origin.y + dy }));
            else if (d.key) setPositions((prev) => new Map(prev).set(d.key!, { x: d.origin.x + dx / view.k, y: d.origin.y + dy / view.k }));
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d?.kind === "node" && d.key && Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) < 5) {
              setSelectedKey(d.key);
              setSelectedLink(null);
            }
          }}
        >
          <defs>
            <radialGradient id="graph-bg" cx="0.5" cy="0.5" r="0.7">
              <stop offset="0" stopColor="#0c1a2e" />
              <stop offset="1" stopColor="#050a13" />
            </radialGradient>
          </defs>
          <rect width={W} height={H} fill="url(#graph-bg)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {links.map((l) => {
              const a = positions.get(l.source);
              const b = positions.get(l.target);
              if (!a || !b) return null;
              const active = l.source === selectedKey || l.target === selectedKey;
              const proposed = l.status === "proposed";
              return (
                <g key={l.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={proposed ? "#b9a6ff" : active ? "#38d5f5" : "#9eaec4"}
                    strokeOpacity={active ? 0.9 : 0.28}
                    strokeWidth={active ? 1.8 : 1}
                    strokeDasharray={UNCERTAINTY_DASH[l.uncertainty]}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="transparent"
                    strokeWidth={10}
                    className="cursor-pointer"
                    onClick={() => setSelectedLink(l)}
                  >
                    <title>{humanizeRelation(l.relation)}</title>
                  </line>
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = positions.get(n.key);
              if (!p) return null;
              const r = n.key === rootKey ? 13 : 6 + Math.min(6, (degree.get(n.key) ?? 1) * 0.8);
              const isSelected = n.key === selectedKey;
              const showLabel = n.key === rootKey || isSelected || n.key === hoverKey || neighbourKeys.has(n.key) || (degree.get(n.key) ?? 0) >= 4;
              const dim = selectedKey && !isSelected && !neighbourKeys.has(n.key);
              return (
                <g
                  key={n.key}
                  data-node={n.key}
                  transform={`translate(${p.x} ${p.y})`}
                  className="cursor-pointer"
                  opacity={dim ? 0.45 : 1}
                  onPointerEnter={() => setHoverKey(n.key)}
                  onPointerLeave={() => setHoverKey(null)}
                >
                  <NodeShape n={n} r={r} selected={isSelected} />
                  {showLabel && (
                    <text y={r + 13} textAnchor="middle" fontSize={n.key === rootKey ? 13 : 11} fill="#e3eaf3" stroke="#050a13" strokeWidth={3} paintOrder="stroke" fontFamily="var(--font-sans)">
                      {n.label.length > 34 ? `${n.label.slice(0, 32)}…` : n.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/[0.06] px-4 py-3 text-xs text-mist-400">
          {(Object.keys(TYPE_COLORS) as Array<GraphNode["type"]>).map((type) => (
            <span key={type} className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="-8 -8 16 16" aria-hidden>
                <NodeShape n={{ key: "", type, id: "", label: "", href: "" }} r={5} selected={false} />
              </svg>
              {t.graph.nodeTypes[type]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#9eaec4" />
            </svg>
            {t.uncertainty.confirmed}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#9eaec4" strokeDasharray="6 4" />
            </svg>
            {t.uncertainty.probable}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6" aria-hidden>
              <line x1="0" y1="3" x2="22" y2="3" stroke="#b9a6ff" strokeDasharray="2 4" />
            </svg>
            {t.uncertainty.speculative} / {t.provenance.engine}
          </span>
        </div>
      </div>

      <aside className="space-y-4">
        {selectedLink ? (
          <div className="panel p-5">
            <p className="eyebrow">{t.common.evidence}</p>
            <p className="mt-2 font-semibold text-mist-50">
              {byKey.get(selectedLink.source)?.label} <span className="text-mist-400">— {humanizeRelation(selectedLink.relation)} —</span> {byKey.get(selectedLink.target)?.label}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={selectedLink.uncertainty === "confirmed" ? "emerald" : selectedLink.uncertainty === "probable" ? "cyan" : "amber"}>{t.uncertainty[selectedLink.uncertainty]}</Badge>
              <Badge tone="neutral">{t.provenance[selectedLink.provenance as keyof typeof t.provenance] ?? selectedLink.provenance}</Badge>
              {selectedLink.status === "proposed" && <Badge tone="violet">{t.review.pendingConnections}</Badge>}
            </div>
            <ul className="mt-4 space-y-1.5 text-sm text-mist-300">
              {selectedLink.evidence.map((e, i) => (
                <li key={i}>• {e.detail}</li>
              ))}
            </ul>
            {selectedLink.citation && <p className="mt-3 text-xs text-mist-500">{selectedLink.citation}</p>}
            <button type="button" onClick={() => setSelectedLink(null)} className="mt-4 text-xs text-aurora-cyan hover:underline">
              ← {t.common.back}
            </button>
          </div>
        ) : selected ? (
          <div className="panel p-5">
            <p className="eyebrow">
              {t.graph.selected} · {t.graph.nodeTypes[selected.type]}
              {selected.subtype ? ` · ${selected.subtype.replace("_", " ")}` : ""}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-mist-50">{selected.label}</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={selected.href} className="rounded-xl bg-aurora px-3.5 py-2 text-sm font-semibold text-ink-950">
                {t.common.openPage}
              </Link>
              {selected.key !== rootKey && (
                <Link href={`/graph?node=${selected.type}:${selected.slug ?? selected.id}`} className="rounded-xl border border-white/10 px-3.5 py-2 text-sm text-mist-100 hover:border-white/25">
                  {t.graph.exploreFrom} →
                </Link>
              )}
            </div>
            <p className="mt-5 text-xs tracking-wide text-mist-400 uppercase">
              {selectedLinks.length} {t.graph.connections}
            </p>
            <ul className="mt-2 max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {selectedLinks.map((l) => {
                const other = byKey.get(l.source === selectedKey ? l.target : l.source);
                if (!other) return null;
                return (
                  <li key={l.id}>
                    <button type="button" onClick={() => setSelectedLink(l)} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-white/[0.05]">
                      <span className="block font-mono text-[10px] tracking-wider text-mist-500 uppercase">{humanizeRelation(l.relation)}</span>
                      <span className="block truncate text-sm text-mist-100">{other.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="panel p-5 text-sm text-mist-400">{t.graph.empty}</div>
        )}
      </aside>
    </div>
  );
}
