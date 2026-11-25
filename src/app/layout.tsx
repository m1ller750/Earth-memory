import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Manrope } from "next/font/google";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader, type HeaderViewer } from "@/components/layout/SiteHeader";
import { getViewer } from "@/lib/auth/session";
import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import "./globals.css";

// Every page reads the database and the viewer's session at request time.
export const dynamic = "force-dynamic";

const display = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: ["500", "600", "700"], variable: "--font-cormorant", display: "swap" });
const sans = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: `${t.meta.title} · ${t.meta.tagline}`, template: `%s · ${t.meta.title}` },
    description: t.meta.description,
    applicationName: t.meta.title,
  };
}

export const viewport: Viewport = {
  themeColor: "#02050b",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();
  let headerViewer: HeaderViewer | null = null;
  try {
    const viewer = await getViewer();
    headerViewer = viewer ? { name: viewer.name, role: viewer.role } : null;
  } catch (error) {
    console.error("[earth-memory] could not load the viewer", error);
  }

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <I18nProvider locale={locale}>
          <a href="#main" className="sr-only z-[70] rounded-lg bg-ink-800 px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
            {t.nav.skipToContent}
          </a>
          <SiteHeader viewer={headerViewer} />
          <main id="main" className="pt-16 pb-20 md:pb-0">
            {children}
          </main>
          <SiteFooter />
          <MobileTabBar />
        </I18nProvider>
      </body>
    </html>
  );
}
