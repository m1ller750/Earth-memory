"use client";

import { Check, Flag, X } from "lucide-react";
import { useActionState, useState } from "react";
import { reportAction, reviewConnectionAction, submitReviewAction, type ActionState } from "@/app/actions/records";
import { Button } from "@/components/ui/Button";
import { FormMessage, Select, Textarea } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";

function errorText(error: string | undefined, t: ReturnType<typeof useI18n>["t"]) {
  if (!error) return null;
  if (error === "auth") return t.common.signInToContinue;
  if (error === "forbidden") return t.errors.forbidden;
  if (error === "rate_limited") return t.errors.rateLimited;
  if (error === "validation") return t.errors.validation;
  return t.common.error;
}

export function ReviewForm({ recordId, asExpert }: { recordId: string; asExpert: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<ActionState, FormData>(submitReviewAction, null);
  const [decision, setDecision] = useState("approve");
  if (state?.ok) return <FormMessage tone="success">{t.review.thanks}</FormMessage>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="recordId" value={recordId} />
      <p className="text-xs text-mist-400">{asExpert ? t.review.expertBadge : t.review.communityBadge}</p>
      <fieldset className="grid grid-cols-3 gap-2">
        <legend className="sr-only">{t.review.decision}</legend>
        {(
          [
            ["approve", t.review.approve],
            ["request_changes", t.review.requestChanges],
            ["dispute", t.review.dispute],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`cursor-pointer rounded-xl border px-2 py-2 text-center text-xs font-medium transition ${decision === value ? "border-aurora-cyan/60 bg-aurora-cyan/10 text-mist-50" : "border-white/10 text-mist-300 hover:border-white/25"}`}
          >
            <input type="radio" name="decision" value={value} checked={decision === value} onChange={() => setDecision(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <Textarea name="note" placeholder={t.review.notePlaceholder} aria-label={t.review.note} className="min-h-20" maxLength={2000} />
      {state?.error && <FormMessage>{errorText(state.error, t)}</FormMessage>}
      <Button type="submit" variant="primary" size="sm" disabled={pending} className="w-full">
        {pending ? t.common.loading : t.review.submitReview}
      </Button>
    </form>
  );
}

export function ReportForm({ subjectId, subjectType = "record" }: { subjectId: string; subjectType?: "record" | "lexicon" | "edge" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(reportAction, null);
  if (state?.ok) return <FormMessage tone="success">{t.report.sent}</FormMessage>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 text-sm text-mist-400 hover:text-mist-100">
        <Flag className="h-4 w-4" aria-hidden />
        {t.record.report}
      </button>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="subjectId" value={subjectId} />
      <input type="hidden" name="subjectType" value={subjectType} />
      <Select name="reason" aria-label={t.report.reason} defaultValue="inaccurate">
        {Object.entries(t.report.reasons).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      <Textarea name="details" placeholder={t.report.details} aria-label={t.report.details} className="min-h-20" maxLength={2000} />
      {state?.error && <FormMessage>{errorText(state.error, t)}</FormMessage>}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {t.report.send}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}

export function ConnectionDecision({ recordId, otherId }: { recordId: string; otherId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<ActionState, FormData>(reviewConnectionAction, null);
  if (state?.error) return <span className="text-xs text-[#ff8aa0]">{errorText(state.error, t)}</span>;
  return (
    <form action={action} className="flex gap-1.5">
      <input type="hidden" name="recordId" value={recordId} />
      <input type="hidden" name="otherId" value={otherId} />
      <button type="submit" name="decision" value="accept" disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-aurora-emerald/40 px-2 py-1 text-xs text-aurora-emerald hover:bg-aurora-emerald/10">
        <Check className="h-3.5 w-3.5" aria-hidden />
        {t.review.accept}
      </button>
      <button type="submit" name="decision" value="reject" disabled={pending} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-mist-300 hover:bg-white/[0.06]">
        <X className="h-3.5 w-3.5" aria-hidden />
        {t.review.reject}
      </button>
    </form>
  );
}
