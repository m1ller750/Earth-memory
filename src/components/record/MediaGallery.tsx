import { FileText } from "lucide-react";
import type { media } from "@/lib/db/schema";

type MediaRow = typeof media.$inferSelect;

export function MediaGallery({ items, emptyLabel }: { items: MediaRow[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="text-sm text-mist-500">{emptyLabel}</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((m) => {
        const src = `/api/v1/media/${m.id}`;
        return (
          <figure key={m.id} className="panel-solid overflow-hidden">
            {m.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={m.caption || m.originalName} loading="lazy" className="max-h-96 w-full bg-ink-950 object-contain" width={m.width ?? undefined} height={m.height ?? undefined} />
            )}
            {m.kind === "audio" && (
              <div className="p-4">
                <audio controls preload="none" src={src} className="w-full" />
              </div>
            )}
            {m.kind === "video" && <video controls preload="metadata" src={src} className="max-h-96 w-full bg-ink-950" />}
            {m.kind === "document" && (
              <a href={src} target="_blank" rel="noopener" className="flex items-center gap-3 p-4 text-sm text-mist-100 hover:bg-white/[0.04]">
                <FileText className="h-5 w-5 text-mist-400" aria-hidden />
                {m.originalName || "Document"}
              </a>
            )}
            {(m.caption || m.originalName) && <figcaption className="border-t border-white/[0.06] px-4 py-2.5 text-xs text-mist-400">{m.caption || m.originalName}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
