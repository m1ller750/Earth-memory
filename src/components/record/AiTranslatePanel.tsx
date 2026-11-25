"use client";

import { Languages } from "lucide-react";
import { useActionState } from "react";
import { translateRecordAction } from "@/app/actions/ai";
import type { ActionState } from "@/app/actions/records";
import { Button } from "@/components/ui/Button";
import { FormMessage, Select } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";

const TARGETS: Array<[string, string]> = [
  ["ru", "Русский"],
  ["en", "English"],
  ["uz", "Oʻzbekcha"],
  ["kk", "Қазақша"],
  ["ky", "Кыргызча"],
  ["tg", "Тоҷикӣ"],
  ["tk", "Türkmençe"],
  ["zh", "中文"],
  ["ar", "العربية"],
  ["es", "Español"],
  ["fr", "Français"],
];

export function AiTranslatePanel({ recordId, provider }: { recordId: string; provider: string }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<ActionState, FormData>(translateRecordAction, null);
  return (
    <form action={action} className="mt-6 flex flex-col gap-3 border-t border-ai/20 pt-5 sm:flex-row sm:items-center">
      <input type="hidden" name="recordId" value={recordId} />
      <Languages className="hidden h-5 w-5 text-ai sm:block" aria-hidden />
      <Select name="target" defaultValue={locale === "ru" ? "en" : "ru"} aria-label={t.record.translateWithAi} className="sm:w-48">
        {TARGETS.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="outline" size="md" disabled={pending}>
        {pending ? t.common.loading : t.record.translateWithAi}
      </Button>
      <span className="text-xs text-mist-500">{provider}</span>
      {state?.error && (
        <div className="sm:basis-full">
          <FormMessage>{state.error === "auth" ? t.common.signInToContinue : state.error === "rate_limited" ? t.errors.rateLimited : t.common.error}</FormMessage>
        </div>
      )}
    </form>
  );
}
