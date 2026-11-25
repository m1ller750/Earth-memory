"use client";

import { ArrowUp, Database, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AiBadge, Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { RichText } from "./RichText";

interface Source {
  n: number;
  type: string;
  title: string;
  href: string;
  facts: string[];
  provenance: string;
}

interface Turn {
  id: number;
  question: string;
  answer: string;
  sources: Source[];
  mode: "generative" | "retrieval" | null;
  provider: string | null;
  model: string | null;
  notice: string | null;
  pending: boolean;
  error: string | null;
}

export function EarthAiChat({ initialQuestion }: { initialQuestion?: string }) {
  const { t, locale } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const busy = turns.some((x) => x.pending);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const ask = async (question: string) => {
    const q = question.trim();
    if (q.length < 2 || busy) return;
    const id = Date.now();
    const history = turns.flatMap((x) => [
      { role: "user" as const, content: x.question },
      { role: "assistant" as const, content: x.answer },
    ]);
    setTurns((prev) => [...prev, { id, question: q, answer: "", sources: [], mode: null, provider: null, model: null, notice: null, pending: true, error: null }]);
    setInput("");
    const patch = (fn: (turn: Turn) => Turn) => setTurns((prev) => prev.map((x) => (x.id === id ? fn(x) : x)));
    try {
      const res = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history: history.slice(-6), locale }),
      });
      if (!res.ok || !res.body) {
        patch((x) => ({ ...x, pending: false, error: res.status === 429 ? t.errors.rateLimited : t.common.error }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "meta") patch((x) => ({ ...x, sources: event.sources, mode: event.mode, provider: event.provider, model: event.model }));
          else if (event.type === "text") patch((x) => ({ ...x, answer: x.answer + event.text }));
          else if (event.type === "notice") patch((x) => ({ ...x, notice: event.message, answer: "" }));
        }
      }
      patch((x) => ({ ...x, pending: false }));
    } catch {
      patch((x) => ({ ...x, pending: false, error: t.common.error }));
    }
  };

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      void ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <div className="flex flex-col gap-6">
      {turns.length === 0 && (
        <div className="panel p-6">
          <p className="eyebrow mb-4">{t.ai.examples}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {t.ai.exampleQuestions.map((q) => (
              <button key={q} type="button" onClick={() => ask(q)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-mist-200 transition hover:border-aurora-cyan/40 hover:text-mist-50">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) => (
        <section key={turn.id} className="space-y-4" aria-live="polite">
          <div className="ml-auto max-w-2xl rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-3 text-sm text-mist-50">{turn.question}</div>
          <div className={cn("panel p-5 sm:p-6", turn.mode === "generative" && "ai-surface")}>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {turn.mode === "generative" ? (
                <AiBadge label={`${t.ai.interpretation} · ${turn.provider ?? ""}${turn.model ? ` · ${turn.model}` : ""}`} />
              ) : turn.mode === "retrieval" ? (
                <Badge tone="cyan">
                  <Database className="h-3.5 w-3.5" aria-hidden />
                  {t.ai.evidenceLabel}
                </Badge>
              ) : null}
              {turn.pending && (
                <span className="inline-flex items-center gap-2 text-xs text-mist-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  {t.ai.thinking}
                </span>
              )}
            </div>
            {turn.notice && <p className="mb-3 text-xs text-risk-elevated">{turn.notice}</p>}
            {turn.error ? <p className="text-sm text-[#ff8aa0]">{turn.error}</p> : turn.answer ? <RichText text={turn.answer} sources={turn.sources} /> : !turn.pending ? null : <div className="skeleton h-20" />}
            {turn.mode === "retrieval" && !turn.pending && <p className="mt-4 text-xs leading-relaxed text-mist-500">{t.ai.modeRetrieval}</p>}
            {turn.sources.length > 0 && (
              <details className="mt-5 border-t border-white/[0.06] pt-4" open={turn.sources.length <= 6}>
                <summary className="cursor-pointer text-xs font-semibold tracking-wide text-mist-300 uppercase">
                  {t.ai.sourcesUsed} ({turn.sources.length})
                </summary>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {turn.sources.map((s) => (
                    <li key={s.n}>
                      <Link href={s.href} className="flex gap-2 rounded-lg border border-white/[0.06] p-2.5 text-xs hover:border-white/20">
                        <span className="font-mono text-aurora-cyan">[{s.n}]</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-mist-100">{s.title}</span>
                          <span className="block truncate text-mist-500">{s.facts[0]}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </section>
      ))}

      <div ref={endRef} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="panel sticky bottom-20 z-10 flex items-end gap-2 p-2 md:bottom-4"
      >
        <Sparkles className="mb-3 ml-2 h-5 w-5 shrink-0 text-aurora-cyan" aria-hidden />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(input);
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={t.ai.placeholder}
          aria-label={t.ai.placeholder}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-mist-50 placeholder:text-mist-500 focus:outline-none"
        />
        {turns.length > 0 && (
          <button type="button" onClick={() => setTurns([])} disabled={busy} className="mb-1 rounded-lg p-2 text-mist-400 hover:bg-white/[0.06] hover:text-mist-100" aria-label={t.ai.newChat} title={t.ai.newChat}>
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
        <button type="submit" disabled={busy || input.trim().length < 2} className="mb-1 rounded-xl bg-aurora p-2.5 text-ink-950 disabled:opacity-40" aria-label={t.ai.send}>
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      <p className="text-center text-xs text-mist-500">{format(t.ai.disclaimer, {})}</p>
    </div>
  );
}
