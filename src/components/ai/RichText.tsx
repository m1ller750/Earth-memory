import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe renderer for assistant text: paragraphs, "- " bullets, **bold**, _italic_
 * and [n] citations that link to the numbered sources. No HTML is ever injected.
 */
export function RichText({ text, sources }: { text: string; sources: Array<{ n: number; href: string; title: string }> }) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const inline = (line: string, key: string): ReactNode[] => {
    const out: ReactNode[] = [];
    const rx = /(\*\*[^*]+\*\*|_[^_]+_|\[\d+(?:\s*,\s*\d+)*\])/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = rx.exec(line))) {
      if (m.index > last) out.push(line.slice(last, m.index));
      const token = m[0];
      if (token.startsWith("**")) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-mist-50">{token.slice(2, -2)}</strong>);
      else if (token.startsWith("_")) out.push(<em key={`${key}-${i++}`} className="text-mist-400">{token.slice(1, -1)}</em>);
      else {
        const numbers = token.slice(1, -1).split(",").map((n) => Number(n.trim()));
        out.push(
          <sup key={`${key}-${i++}`} className="ml-0.5 whitespace-nowrap">
            {numbers.map((n, j) => {
              const s = byN.get(n);
              return s ? (
                <Link key={n} href={s.href} title={s.title} className="mx-px rounded bg-aurora-cyan/15 px-1 font-mono text-[10px] text-aurora-cyan hover:bg-aurora-cyan/25">
                  {n}
                </Link>
              ) : (
                <span key={`${n}-${j}`} className="mx-px font-mono text-[10px] text-mist-500">
                  {n}?
                </span>
              );
            })}
          </sup>,
        );
      }
      last = m.index + token.length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
  };

  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[0.95rem] leading-relaxed text-mist-200">
      {blocks.map((block, b) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={b} className="space-y-1.5">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-aurora-cyan" aria-hidden />
                  <span>{inline(l.replace(/^\s*[-•]\s+/, ""), `${b}-${i}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        const isInterpretation = /^(Interpretation|Интерпретация):/i.test(block.trim());
        return (
          <p key={b} className={isInterpretation ? "rounded-xl border border-dashed border-ai/40 bg-ai/[0.06] px-3.5 py-2.5 text-mist-200" : undefined}>
            {inline(block.replace(/\n/g, " "), String(b))}
          </p>
        );
      })}
    </div>
  );
}
