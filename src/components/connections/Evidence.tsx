import { CalendarRange, FileText, MapPin, Network, Quote, Tags, Type } from "lucide-react";
import type { EvidenceItem } from "@/lib/db/schema";
import { cn } from "@/lib/cn";

const ICONS: Record<EvidenceItem["kind"], typeof Network> = {
  shared_entity: Network,
  geography: MapPin,
  period: CalendarRange,
  tag: Tags,
  language: Type,
  text: FileText,
  citation: Quote,
  editorial: Quote,
};

export function EvidenceList({ evidence, limit, className }: { evidence: EvidenceItem[]; limit?: number; className?: string }) {
  const items = limit ? evidence.slice(0, limit) : evidence;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((e, i) => {
        const Icon = ICONS[e.kind] ?? Quote;
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm leading-snug text-mist-300">
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-500" aria-hidden />
            <span className="min-w-0 flex-1">{e.detail}</span>
            {typeof e.weight === "number" && e.weight > 0 && <span className="shrink-0 font-mono text-[11px] text-mist-500">+{e.weight.toFixed(2)}</span>}
          </li>
        );
      })}
    </ul>
  );
}
