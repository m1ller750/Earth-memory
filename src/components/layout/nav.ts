import type { Dictionary } from "@/lib/i18n";

export interface NavItem {
  href: string;
  label: (t: Dictionary) => string;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/explore", label: (t) => t.nav.explore },
  { href: "/archive", label: (t) => t.nav.archive },
  { href: "/languages", label: (t) => t.nav.languages },
  { href: "/living-earth", label: (t) => t.nav.living },
  { href: "/graph", label: (t) => t.nav.graph },
  { href: "/timeline", label: (t) => t.nav.timeline },
  { href: "/alerts", label: (t) => t.nav.alerts },
  { href: "/ai", label: (t) => t.nav.ai },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: "/dashboard", label: (t) => t.nav.dashboard },
  { href: "/community", label: (t) => t.nav.community },
  { href: "/developers", label: (t) => t.nav.developers },
  { href: "/about", label: (t) => t.nav.about },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
