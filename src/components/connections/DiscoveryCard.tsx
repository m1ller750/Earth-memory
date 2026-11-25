import { ArrowLeftRight, Cpu } from "lucide-react";
import Link from "next/link";
import { DimensionGlyph } from "@/components/brand/DimensionGlyph";
import { Badge, UncertaintyBadge } from "@/components/ui/Badge";
import type { Dictionary } from "@/lib/i18n";
import type { Discovery } from "@/server/connections";
import { EvidenceList } from "./Evidence";

export function DiscoveryCard({ discovery, t }: { discovery: Discovery; t: Dictionary }) {
  return (
    <article className="panel flex flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <UncertaintyBadge level={discovery.uncertainty} t={t} />
        <Badge tone="neutral">
          <Cpu className="h-3.5 w-3.5" aria-hidden />
          {t.provenance.engine}
        </Badge>
        <span className="ml-auto font-mono text-xs text-mist-400">{discovery.confidence.toFixed(2)}</span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Link href={`/archive/${discovery.a.slug}`} className="group flex min-w-0 items-start gap-2">
          <DimensionGlyph dimension={discovery.a.dimension} className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="line-clamp-2 text-sm font-semibold text-mist-50 group-hover:underline">{discovery.a.title}</span>
        </Link>
        <ArrowLeftRight className="h-4 w-4 text-mist-500" aria-hidden />
        <Link href={`/archive/${discovery.b.slug}`} className="group flex min-w-0 items-start gap-2">
          <DimensionGlyph dimension={discovery.b.dimension} className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="line-clamp-2 text-sm font-semibold text-mist-50 group-hover:underline">{discovery.b.title}</span>
        </Link>
      </div>
      <EvidenceList evidence={discovery.evidence} limit={3} className="mt-4 border-t border-white/[0.06] pt-4" />
    </article>
  );
}
