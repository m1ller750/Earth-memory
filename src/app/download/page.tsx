import { Download, HardDrive, ShieldCheck, Wifi } from "lucide-react";
import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/layout";
import { getI18n } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.download };
}

/** Latest Windows installer, published as a GitHub release asset (stable name, always the newest). */
const DESKTOP_DOWNLOAD_URL = "https://github.com/m1ller750/Earth-memory/releases/latest/download/Earth-Memory-Setup.exe";
const RELEASES_URL = "https://github.com/m1ller750/Earth-memory/releases";

const COPY = {
  en: {
    eyebrow: "Desktop app",
    title: "Earth Memory for Windows",
    lede: "The whole archive in a desktop app: the globe, records with photos, languages, Living Earth, Memory Alert and the timeline, with its own database on your computer.",
    button: "Download for Windows (.exe)",
    requirements: "Windows 10 or 11, 64-bit · about 200 MB",
    all: "All releases and release notes",
    points: [
      ["Works offline", "Browsing and search need no internet connection. EARTH AI answers in search-only mode unless you configure an AI key."],
      ["Your data stays local", "The archive database is created in your user profile on first start and never leaves your computer."],
      ["First start", "Preparing the archive takes up to a minute the first time. Windows may warn about an unsigned app: choose More info → Run anyway."],
    ],
  },
  ru: {
    eyebrow: "Приложение для компьютера",
    title: "Earth Memory для Windows",
    lede: "Весь архив в отдельном приложении: глобус, записи с фотографиями, языки, Living Earth, Memory Alert и шкала времени, со своей базой данных на вашем компьютере.",
    button: "Скачать для Windows (.exe)",
    requirements: "Windows 10 или 11, 64-бит · около 200 МБ",
    all: "Все версии и описание изменений",
    points: [
      ["Работает без интернета", "Просмотр и поиск не требуют подключения. EARTH AI отвечает в режиме поиска, если не настроен ключ ИИ."],
      ["Данные остаются у вас", "База архива создаётся в вашем профиле при первом запуске и не покидает компьютер."],
      ["Первый запуск", "Подготовка архива в первый раз занимает до минуты. Windows может предупредить о неподписанном приложении: «Подробнее» → «Выполнить в любом случае»."],
    ],
  },
} as const;

export default async function DownloadPage() {
  const { locale } = await getI18n();
  const c = COPY[locale === "ru" ? "ru" : "en"];
  const icons = [Wifi, HardDrive, ShieldCheck];
  return (
    <Container className="pb-20">
      <PageHeader eyebrow={c.eyebrow} title={c.title} lede={c.lede} />
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <a
          href={DESKTOP_DOWNLOAD_URL}
          className="inline-flex items-center gap-2.5 rounded-xl bg-aurora px-6 py-3.5 text-base font-semibold text-ink-950 transition hover:brightness-110"
        >
          <Download className="h-5 w-5" aria-hidden />
          {c.button}
        </a>
        <span className="font-mono text-xs tracking-wide text-mist-400">{c.requirements}</span>
      </div>
      <p className="mt-4 text-sm">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="text-aurora-cyan hover:underline">
          {c.all}
        </a>
      </p>
      <ul className="mt-12 grid gap-4 md:grid-cols-3">
        {c.points.map(([title, body], i) => {
          const Icon = icons[i];
          return (
            <li key={title} className="panel p-5">
              <Icon className="h-5 w-5 text-aurora-cyan" aria-hidden />
              <h2 className="mt-3 font-display text-xl font-semibold text-mist-50">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
            </li>
          );
        })}
      </ul>
    </Container>
  );
}
