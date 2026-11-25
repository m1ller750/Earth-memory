import { cn } from "@/lib/cn";

/** The EARTH MEMORY mark: a globe whose latitude lines are layers of memory, with one bright point. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="em-aurora" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ee6a8" />
          <stop offset="1" stopColor="#38d5f5" />
        </linearGradient>
        <radialGradient id="em-core" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#16233a" />
          <stop offset="1" stopColor="#050a13" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="url(#em-core)" stroke="url(#em-aurora)" strokeWidth="1.4" />
      <path d="M5.2 11.6c3.2-1.5 18.4-1.5 21.6 0" fill="none" stroke="url(#em-aurora)" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M3.4 16.6c4-1.8 21.2-1.8 25.2 0" fill="none" stroke="url(#em-aurora)" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M5.4 21.6c3.4-1.4 17.8-1.4 21.2 0" fill="none" stroke="url(#em-aurora)" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="21.2" cy="15.4" r="1.9" fill="#f2f6fb" />
      <circle cx="21.2" cy="15.4" r="3.6" fill="none" stroke="#38d5f5" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-sans text-[0.8rem] font-semibold tracking-[0.32em] text-mist-50">EARTH</span>
          <span className="mt-1 font-sans text-[0.8rem] font-semibold tracking-[0.32em] text-aurora">MEMORY</span>
        </span>
      )}
    </span>
  );
}
