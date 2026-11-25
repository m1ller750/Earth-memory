"use client";

import { Archive, Globe2, Plus, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/client";
import { isActive } from "./nav";

export function MobileTabBar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const items = [
    { href: "/explore", label: t.nav.explore, icon: Globe2 },
    { href: "/archive", label: t.nav.archive, icon: Archive },
    { href: "/contribute", label: t.nav.contribute, icon: Plus, primary: true },
    { href: "/ai", label: t.nav.ai, icon: Sparkles },
    { href: "/alerts", label: t.nav.alerts, icon: TriangleAlert },
  ];
  return (
    <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon, primary }) => {
          const activeItem = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activeItem ? "page" : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium", activeItem ? "text-mist-50" : "text-mist-400")}
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", primary && "bg-aurora text-ink-950", activeItem && !primary && "text-aurora-cyan")}>
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
