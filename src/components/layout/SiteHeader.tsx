"use client";

import { Menu, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import type { Role } from "@/lib/db/schema";
import { LocaleSwitch } from "./LocaleSwitch";
import { isActive, PRIMARY_NAV, SECONDARY_NAV } from "./nav";
import { QuickSearch } from "./QuickSearch";
import { UserMenu } from "./UserMenu";

export interface HeaderViewer {
  name: string;
  role: Role;
}

export function SiteHeader({ viewer }: { viewer: HeaderViewer | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile menu after navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  const solid = scrolled || menuOpen || pathname !== "/";

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 h-16 transition-colors duration-300",
          solid ? "border-b border-white/[0.06] bg-ink-950/80 backdrop-blur-xl" : "bg-gradient-to-b from-ink-950/70 to-transparent",
        )}
      >
        <div className="mx-auto flex h-full max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0 rounded-lg" aria-label="EARTH MEMORY">
            <Logo />
          </Link>

          <nav aria-label="Main" className="ml-6 hidden items-center gap-0.5 xl:flex">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive(pathname, item.href) ? "bg-white/[0.07] text-mist-50" : "text-mist-300 hover:bg-white/[0.04] hover:text-mist-50",
                )}
              >
                {item.label(t)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-sm text-mist-300 transition hover:border-white/20 hover:text-mist-50 sm:px-3"
              aria-label={t.nav.search}
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden lg:inline">{t.nav.search}</span>
              <kbd className="ml-2 hidden rounded border border-white/10 px-1.5 font-mono text-[10px] text-mist-400 lg:inline">Ctrl K</kbd>
            </button>
            <LocaleSwitch />
            <ButtonLink href="/contribute" variant="primary" size="sm" className="hidden sm:inline-flex">
              <Plus className="h-4 w-4" aria-hidden />
              {t.nav.contribute}
            </ButtonLink>
            {viewer ? (
              <UserMenu viewer={viewer} />
            ) : (
              <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                {t.nav.signIn}
              </ButtonLink>
            )}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-mist-200 hover:bg-white/[0.06] xl:hidden"
              aria-label={menuOpen ? t.nav.close : t.nav.menu}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div id="mobile-menu" className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-ink-950/95 backdrop-blur-xl xl:hidden">
          <nav aria-label="Mobile" className="mx-auto grid max-w-3xl gap-1 px-4 py-6 sm:grid-cols-2 sm:px-6">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-xl px-4 py-3 text-base font-medium",
                  isActive(pathname, item.href) ? "bg-white/[0.08] text-mist-50" : "text-mist-200 hover:bg-white/[0.05]",
                )}
              >
                {item.label(t)}
              </Link>
            ))}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-white/[0.06] pt-5 sm:col-span-2">
              <ButtonLink href="/contribute" variant="primary">
                <Plus className="h-4 w-4" aria-hidden />
                {t.nav.contribute}
              </ButtonLink>
              {!viewer && (
                <ButtonLink href="/login" variant="secondary">
                  {t.nav.signIn}
                </ButtonLink>
              )}
            </div>
          </nav>
        </div>
      )}

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
