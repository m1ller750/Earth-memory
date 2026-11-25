import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Container({ children, className, wide = false }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", wide ? "max-w-[1600px]" : "max-w-7xl", className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("animate-fade-up pt-10 pb-8 sm:pt-14 sm:pb-10", className)}>
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="font-display text-4xl leading-[1.05] font-semibold text-mist-50 sm:text-5xl lg:text-6xl">{title}</h1>
          {lede && <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist-300 sm:text-lg">{lede}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export function SectionHeading({ eyebrow, title, lede, action, className }: { eyebrow?: ReactNode; title: ReactNode; lede?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold text-mist-50 sm:text-3xl">{title}</h2>
        {lede && <p className="mt-2 text-sm leading-relaxed text-mist-300 sm:text-base">{lede}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-mist-300">{icon}</div>}
      <p className="font-display text-xl font-semibold text-mist-50">{title}</p>
      {body && <p className="mt-2 max-w-md text-sm leading-relaxed text-mist-400">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, note, accent }: { label: ReactNode; value: ReactNode; note?: ReactNode; accent?: string }) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-display text-4xl leading-none font-semibold text-mist-50" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {note && <p className="mt-2 text-xs leading-relaxed text-mist-400">{note}</p>}
    </div>
  );
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,38%)_1fr] gap-3 border-b border-white/[0.06] py-2.5 text-sm last:border-b-0">
      <dt className="text-mist-400">{label}</dt>
      <dd className="min-w-0 break-words text-mist-100">{children}</dd>
    </div>
  );
}
