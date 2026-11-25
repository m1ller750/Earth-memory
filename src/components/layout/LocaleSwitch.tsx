"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/session";
import { cn } from "@/lib/cn";
import { LOCALES } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

export function LocaleSwitch() {
  const { locale } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="inline-flex h-9 items-center rounded-lg border border-white/10 bg-white/[0.04] p-0.5" role="group" aria-label="Language / Язык">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          disabled={pending}
          aria-pressed={locale === l}
          onClick={() =>
            startTransition(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={cn(
            "h-full rounded-md px-2 font-mono text-[11px] font-semibold tracking-wider uppercase transition",
            locale === l ? "bg-white/[0.1] text-mist-50" : "text-mist-400 hover:text-mist-100",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
