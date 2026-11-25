"use client";

import { ArrowRight, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

interface SearchHit {
  type: "record" | "language" | "species" | "ecosystem" | "entity" | "place";
  title: string;
  subtitle: string;
  href: string;
}

const TYPE_LABEL: Record<SearchHit["type"], { en: string; ru: string }> = {
  record: { en: "Archive", ru: "Архив" },
  language: { en: "Language", ru: "Язык" },
  species: { en: "Species", ru: "Вид" },
  ecosystem: { en: "Ecosystem", ru: "Экосистема" },
  entity: { en: "Knowledge graph", ru: "Граф знаний" },
  place: { en: "Place", ru: "Место" },
};

export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(q)}&limit=12`, { signal: controller.signal });
        if (res.ok) {
          const data = (await res.json()) as { results: SearchHit[] };
          setHits(data.results);
          setActive(0);
        }
      } catch {
        /* aborted or offline */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [query, open]);

  const grouped = useMemo(() => hits.map((h, i) => ({ ...h, index: i })), [hits]);

  if (!open) return null;

  const go = (hit: SearchHit | undefined) => {
    if (!hit) {
      if (query.trim()) router.push(`/archive?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(hit.href);
    }
    onClose();
    setQuery("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink-950/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t.nav.search} className="panel-solid w-full max-w-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
          <Search className="h-5 w-5 text-mist-400" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter") go(hits[active]);
            }}
            placeholder={t.nav.searchPlaceholder}
            className="h-14 flex-1 bg-transparent text-base text-mist-50 placeholder:text-mist-500 focus:outline-none"
            aria-label={t.nav.search}
            aria-autocomplete="list"
            aria-controls="quick-search-results"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-mist-400" aria-hidden />}
          <kbd className="rounded border border-white/10 px-1.5 font-mono text-[10px] text-mist-400">Esc</kbd>
        </div>
        <ul id="quick-search-results" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {grouped.map((hit) => (
            <li key={`${hit.type}-${hit.href}`} role="option" aria-selected={hit.index === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(hit.index)}
                onClick={() => go(hit)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${hit.index === active ? "bg-white/[0.07]" : ""}`}
              >
                <span className="w-24 shrink-0 font-mono text-[10px] tracking-wider text-mist-500 uppercase">{TYPE_LABEL[hit.type][locale]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-mist-50">{hit.title}</span>
                  <span className="block truncate text-xs text-mist-400">{hit.subtitle}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-mist-500" aria-hidden />
              </button>
            </li>
          ))}
          {query.trim().length >= 2 && !loading && hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-mist-400">{t.common.noResults}</li>}
        </ul>
      </div>
    </div>
  );
}
