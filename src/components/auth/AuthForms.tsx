"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, signInAction, type AuthState } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";

export function SignInForm({ next, showDemoNotice }: { next?: string; showDemoNotice: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(signInAction, null);
  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={t.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </Field>
      <Field label={t.auth.password} htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={200} />
      </Field>
      {state?.error && <FormMessage>{state.error === "rate_limited" ? t.auth.rateLimited : t.auth.invalid}</FormMessage>}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.auth.signIn}
      </Button>
      <p className="text-center text-sm text-mist-400">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="text-aurora-cyan hover:underline">
          {t.auth.register}
        </Link>
      </p>
      {showDemoNotice && <FormMessage tone="info">{t.auth.demoNotice}</FormMessage>}
    </form>
  );
}

export function RegisterForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(registerAction, null);
  const message =
    state?.error === "email_taken" ? t.auth.emailTaken : state?.error === "rate_limited" ? t.auth.rateLimited : state?.error ? (state.message ?? t.errors.validation) : null;
  return (
    <form action={action} className="space-y-5">
      <Field label={t.auth.name} htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} />
      </Field>
      <Field label={t.auth.email} htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={200} />
      </Field>
      <Field label={t.auth.password} htmlFor="password" hint={t.auth.passwordHint}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
      </Field>
      <Field label={t.auth.affiliation} htmlFor="affiliation">
        <Input id="affiliation" name="affiliation" autoComplete="organization" maxLength={200} />
      </Field>
      {message && <FormMessage>{message}</FormMessage>}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? t.common.loading : t.auth.register}
      </Button>
      <p className="text-center text-sm text-mist-400">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="text-aurora-cyan hover:underline">
          {t.auth.signIn}
        </Link>
      </p>
    </form>
  );
}
