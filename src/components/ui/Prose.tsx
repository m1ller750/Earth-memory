/** Renders plain text with paragraphs. User text is never injected as HTML. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className={className ?? "prose-memory"}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function humanizeRelation(relation: string): string {
  return relation.replace(/_/g, " ");
}
