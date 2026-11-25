import { ExternalLink } from "lucide-react";
import type { sources } from "@/lib/db/schema";

type SourceRow = Pick<typeof sources.$inferSelect, "id" | "citation" | "url" | "kind">;

export function SourceList({ items, emptyLabel }: { items: SourceRow[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-mist-500">{emptyLabel}</p>;
  return (
    <ol className="space-y-3">
      {items.map((s, i) => (
        <li key={s.id} className="flex gap-3 text-sm leading-relaxed">
          <span className="font-mono text-xs text-mist-500">[{i + 1}]</span>
          <span className="min-w-0 flex-1 text-mist-200">
            {s.citation}
            <span className="ml-2 font-mono text-[10px] tracking-wider text-mist-500 uppercase">{s.kind}</span>
            {s.url && (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 break-all text-xs text-aurora-cyan hover:underline">
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                {s.url.replace(/^https?:\/\//, "")}
              </a>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
