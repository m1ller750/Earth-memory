"use client";

import { Copy, KeyRound } from "lucide-react";
import { useActionState, useState } from "react";
import { createApiKeyAction, revokeApiKeyAction, type ApiKeyState } from "@/app/actions/account";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, FormMessage, Input } from "@/components/ui/form";
import { formatDate } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeys({ keys, canVerify }: { keys: ApiKeyRow[]; canVerify: boolean }) {
  const { t, locale } = useI18n();
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKeyAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-6">
      {state?.key && (
        <FormMessage tone="success">
          <p className="font-semibold">{t.account.keyCreated}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-mist-50">{state.key}</code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(state.key!);
                setCopied(true);
              }}
            >
              <Copy className="h-4 w-4" aria-hidden />
              {copied ? t.common.copied : t.common.copy}
            </Button>
          </div>
        </FormMessage>
      )}
      <form action={action} className="panel-solid grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label={t.account.keyName} htmlFor="key-name">
          <Input id="key-name" name="name" required minLength={2} maxLength={60} placeholder="Claude Code on my laptop" />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          <KeyRound className="h-4 w-4" aria-hidden />
          {t.account.createKey}
        </Button>
        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-mist-100">{t.account.scopes}</legend>
          <Checkbox name="scopes" value="read" defaultChecked label={t.account.scopeRead} />
          <Checkbox name="scopes" value="contribute" label={t.account.scopeContribute} />
          {canVerify && <Checkbox name="scopes" value="verify" label={t.account.scopeVerify} />}
        </fieldset>
        {state?.error && <FormMessage>{state.error === "too_many" ? "Revoke an existing key first (limit 10)." : t.errors.validation}</FormMessage>}
      </form>
      <ul className="space-y-2">
        {keys.map((k) => (
          <li key={k.id} className="panel-solid flex flex-wrap items-center gap-3 p-4 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-mist-50">{k.name}</span>
              <span className="block font-mono text-xs text-mist-400">{k.prefix}…</span>
            </span>
            <span className="flex gap-1">
              {k.scopes.map((s) => (
                <Badge key={s} tone="neutral">
                  {s}
                </Badge>
              ))}
            </span>
            <span className="text-xs text-mist-500">
              {t.account.lastUsed}: {k.lastUsedAt ? formatDate(k.lastUsedAt, locale) : t.account.never}
            </span>
            {k.revokedAt ? (
              <Badge tone="slate">{t.account.revoked}</Badge>
            ) : (
              <form action={revokeApiKeyAction}>
                <input type="hidden" name="id" value={k.id} />
                <Button type="submit" variant="danger" size="sm">
                  {t.account.revoke}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
