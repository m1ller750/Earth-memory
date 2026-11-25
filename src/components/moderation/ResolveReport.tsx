"use client";

import { useActionState } from "react";
import { resolveReportAction } from "@/app/actions/moderation";
import type { ActionState } from "@/app/actions/records";
import { Button } from "@/components/ui/Button";
import { FormMessage, Input } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";

export function ResolveReport({ reportId, canRestrict }: { reportId: string; canRestrict: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<ActionState, FormData>(resolveReportAction, null);
  if (state?.ok) return <FormMessage tone="success">✓</FormMessage>;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <Input name="note" placeholder={t.moderation.note} aria-label={t.moderation.note} className="h-9 min-w-48 flex-1" maxLength={1000} />
      <Button type="submit" name="decision" value="resolve" size="sm" variant="secondary" disabled={pending}>
        {t.moderation.resolve}
      </Button>
      {canRestrict && (
        <Button type="submit" name="decision" value="restrict" size="sm" variant="danger" disabled={pending}>
          {t.moderation.restrict}
        </Button>
      )}
      <Button type="submit" name="decision" value="dismiss" size="sm" variant="ghost" disabled={pending}>
        {t.moderation.dismiss}
      </Button>
      {state?.error && <span className="text-xs text-[#ff8aa0]">{t.common.error}</span>}
    </form>
  );
}
