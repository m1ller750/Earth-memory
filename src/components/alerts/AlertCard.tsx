import Link from "next/link";
import { ALERT_COLORS, AlertLevelBadge } from "@/components/ui/Badge";
import type { MemoryAlert } from "@/lib/engine/alerts";
import type { Dictionary } from "@/lib/i18n";
import { alertHref, threatLabel } from "./labels";

export function ScoreRing({ score, level, size = 64 }: { score: number; level: MemoryAlert["level"]; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = ALERT_COLORS[level];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${score} / 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#f2f6fb" fontSize={size * 0.3} fontWeight="600" fontFamily="var(--font-sans)">
        {score}
      </text>
    </svg>
  );
}

export function AlertCard({ alert, t }: { alert: MemoryAlert; t: Dictionary }) {
  return (
    <Link href={alertHref(alert)} className="group panel flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{t.alerts.typeSingular[alert.subjectType]}</p>
          <h3 className="mt-2 font-display text-xl leading-snug font-semibold text-mist-50">{alert.name}</h3>
        </div>
        <ScoreRing score={alert.score} level={alert.level} />
      </div>
      <div className="mt-3">
        <AlertLevelBadge level={alert.level} t={t} />
      </div>
      <p className="mt-3 text-sm text-mist-300">{threatLabel(alert, t)}</p>
      <ul className="mt-3 space-y-1.5 text-sm text-mist-400">
        {alert.missing.slice(0, 2).map((m) => (
          <li key={m} className="flex gap-2">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-mist-500" aria-hidden />
            {t.alerts.missingItems[m]}
          </li>
        ))}
      </ul>
    </Link>
  );
}
