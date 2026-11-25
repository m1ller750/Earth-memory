import { BadgeCheck, CircleDashed, FlaskConical, ShieldAlert, ShieldCheck, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { DimensionGlyph, DIMENSION_TEXT } from "@/components/brand/DimensionGlyph";
import { cn } from "@/lib/cn";
import type { Dimension, IucnStatus, LanguageStatus, Origin, Verification } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n";

type Tone = "neutral" | "emerald" | "cyan" | "amber" | "rose" | "violet" | "slate";

const TONES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/[0.04] text-mist-200",
  emerald: "border-aurora-emerald/30 bg-aurora-emerald/10 text-aurora-emerald",
  cyan: "border-aurora-cyan/30 bg-aurora-cyan/10 text-aurora-cyan",
  amber: "border-risk-elevated/35 bg-risk-elevated/10 text-risk-elevated",
  rose: "border-risk-critical/35 bg-risk-critical/10 text-[#ff8aa0]",
  violet: "border-ai/40 bg-ai/10 text-ai",
  slate: "border-mist-500/30 bg-mist-500/10 text-mist-300",
};

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function VerificationBadge({ status, t }: { status: Verification; t: Dictionary }) {
  const config: Record<Verification, { tone: Tone; icon: ReactNode }> = {
    unverified: { tone: "slate", icon: <CircleDashed className="h-3.5 w-3.5" aria-hidden /> },
    community_verified: { tone: "cyan", icon: <Users className="h-3.5 w-3.5" aria-hidden /> },
    expert_verified: { tone: "emerald", icon: <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> },
    disputed: { tone: "amber", icon: <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> },
  };
  return (
    <Badge tone={config[status].tone} title={t.verificationHelp[status]}>
      {config[status].icon}
      {t.verification[status]}
    </Badge>
  );
}

export function OriginBadge({ origin, t }: { origin: Origin; t: Dictionary }) {
  if (origin === "demo") {
    return (
      <Badge tone="amber" title={t.originHelp.demo} className="bg-[repeating-linear-gradient(135deg,rgb(247_197_72/0.12)_0_6px,transparent_6px_12px)]">
        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
        {t.origin.demo}
      </Badge>
    );
  }
  if (origin === "reference") {
    return (
      <Badge tone="neutral" title={t.originHelp.reference} className="text-dim-historical">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {t.origin.reference}
      </Badge>
    );
  }
  return (
    <Badge tone="cyan" title={t.originHelp.community}>
      <Users className="h-3.5 w-3.5" aria-hidden />
      {t.origin.community}
    </Badge>
  );
}

export function DimensionBadge({ dimension, t, short = false }: { dimension: Dimension; t: Dictionary; short?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase", DIMENSION_TEXT[dimension])}>
      <DimensionGlyph dimension={dimension} className="h-4 w-4" />
      {short ? t.dimensionsShort[dimension] : t.dimensions[dimension]}
    </span>
  );
}

export const LANGUAGE_STATUS_COLORS: Record<LanguageStatus, string> = {
  safe: "#8fd694",
  vulnerable: "#f7c548",
  definitely_endangered: "#fb8a5c",
  severely_endangered: "#f46b6b",
  critically_endangered: "#f0506e",
  extinct: "#8e9bb0",
};

export const IUCN_COLORS: Record<IucnStatus, string> = {
  EX: "#6b778c",
  EW: "#8e9bb0",
  CR: "#f0506e",
  EN: "#fb8a5c",
  VU: "#f7c548",
  NT: "#c6e46b",
  LC: "#4ade9b",
  DD: "#9eaec4",
};

export function LanguageStatusBadge({ status, t }: { status: LanguageStatus; t: Dictionary }) {
  const color = LANGUAGE_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ borderColor: `${color}55`, background: `${color}14`, color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {t.languageStatus[status]}
    </span>
  );
}

export function IucnBadge({ status, t, showCode = true }: { status: IucnStatus; t: Dictionary; showCode?: boolean }) {
  const color = IUCN_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ borderColor: `${color}55`, background: `${color}14`, color }}>
      {showCode && <span className="font-mono font-semibold">{status}</span>}
      {t.iucn[status]}
    </span>
  );
}

export function UncertaintyBadge({ level, t }: { level: "confirmed" | "probable" | "speculative"; t: Dictionary }) {
  const tone: Record<typeof level, Tone> = { confirmed: "emerald", probable: "cyan", speculative: "amber" };
  return (
    <Badge tone={tone[level]} title={t.uncertaintyHelp[level]} className={level === "speculative" ? "border-dashed" : undefined}>
      {t.uncertainty[level]}
    </Badge>
  );
}

export function AiBadge({ label }: { label: string }) {
  return (
    <Badge tone="violet" className="border-dashed">
      <Sparkles className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Badge>
  );
}

export const ALERT_COLORS = {
  critical: "#f0506e",
  high: "#fb8a5c",
  elevated: "#f7c548",
  watch: "#8fd694",
} as const;

export function AlertLevelBadge({ level, t }: { level: keyof typeof ALERT_COLORS; t: Dictionary }) {
  const color = ALERT_COLORS[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={{ borderColor: `${color}66`, background: `${color}18`, color }}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-pulse-ring" style={{ background: color }} />
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
      </span>
      {t.alertLevel[level]}
    </span>
  );
}
