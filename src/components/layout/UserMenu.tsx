"use client";

import { ChevronDown, ClipboardCheck, KeyRound, LogOut, ShieldHalf, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/session";
import { useI18n } from "@/lib/i18n/client";
import type { HeaderViewer } from "./SiteHeader";

export function UserMenu({ viewer }: { viewer: HeaderViewer }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = viewer.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const canModerate = viewer.role === "moderator" || viewer.role === "admin";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] pr-2 pl-1 text-sm text-mist-100 hover:border-white/20"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-aurora text-[11px] font-bold text-ink-950">{initials}</span>
        <ChevronDown className="h-3.5 w-3.5 text-mist-400" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="panel-solid absolute right-0 mt-2 w-64 overflow-hidden p-1.5 shadow-2xl">
          <div className="border-b border-white/[0.06] px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-mist-50">{viewer.name}</p>
            <p className="text-xs text-mist-400">{t.roles[viewer.role]}</p>
          </div>
          <MenuLink href="/account" icon={<UserRound className="h-4 w-4" />} label={t.nav.account} />
          <MenuLink href="/account#api-keys" icon={<KeyRound className="h-4 w-4" />} label={t.account.apiKeys} />
          <MenuLink href="/review" icon={<ClipboardCheck className="h-4 w-4" />} label={t.nav.review} />
          {canModerate && <MenuLink href="/moderation" icon={<ShieldHalf className="h-4 w-4" />} label={t.nav.moderation} />}
          <form action={signOutAction}>
            <button type="submit" role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-mist-200 hover:bg-white/[0.06]">
              <LogOut className="h-4 w-4" aria-hidden />
              {t.nav.signOut}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-mist-200 hover:bg-white/[0.06] hover:text-mist-50">
      <span aria-hidden className="text-mist-400">
        {icon}
      </span>
      {label}
    </Link>
  );
}
