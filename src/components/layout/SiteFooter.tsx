import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { getI18n } from "@/lib/i18n/server";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav";

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-ink-950/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-5 max-w-sm font-display text-2xl leading-snug text-mist-100">{t.footer.mission}</p>
          <p className="mt-6 max-w-md text-xs leading-relaxed text-mist-400">{t.footer.dataNotice}</p>
        </div>
        <div>
          <p className="eyebrow mb-4">{t.footer.principlesTitle}</p>
          <ul className="space-y-2.5 text-sm text-mist-300">
            {t.footer.principles.map((p) => (
              <li key={p} className="flex gap-2.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-aurora-emerald" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
            <Link key={item.href} href={item.href} className="text-mist-300 hover:text-mist-50">
              {item.label(t)}
            </Link>
          ))}
        </nav>
      </div>
      <div className="border-t border-white/[0.05]">
        <p className="mx-auto max-w-7xl px-4 py-6 font-display text-base text-mist-400 italic sm:px-6 lg:px-8">“{t.footer.built}”</p>
      </div>
    </footer>
  );
}
