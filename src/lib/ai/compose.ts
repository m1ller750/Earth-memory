import type { Locale } from "../i18n";
import type { Retrieval } from "@/server/ai/retrieve";

/**
 * Retrieval-mode answers: deterministic text built only from retrieved sources, used when
 * no language model is configured (or the provider fails). Every line cites its source.
 */
const T = {
  en: {
    languages: (region: string) => `Earth Memory documents these languages in danger${region}, ordered from the most to the least severe vitality category:`,
    species: (region: string) => `These threatened species${region} are documented in Earth Memory, ordered by IUCN Red List category:`,
    traditions: (region: string, disappearing: boolean) =>
      disappearing
        ? `These traditions${region} rank highest on Memory Alert, which combines a documented threat (such as UNESCO's Urgent Safeguarding List) with gaps in what the archive holds:`
        : `These traditions${region} are documented in Earth Memory:`,
    ecosystem: (name: string) => `Documented changes in the ${name}, in chronological order:`,
    photographs: "Matching photographs in the archive:",
    noPhotographs: "Earth Memory does not hold historical photographs on this topic yet. These related records may help:",
    connections: "Documented connections in the knowledge graph:",
    multi: (region: string) => `Cultural traditions in the archive that are shared by more than one country${region}:`,
    general: "Records in the archive that match your question:",
    nothing: "Nothing in the archive matches this question yet. You could help by contributing a record.",
    footnote: "This answer was assembled from archive records without a language model. Reference records are pending expert verification.",
    inRegion: (r: string) => ` in ${r}`,
  },
  ru: {
    languages: (region: string) => `Earth Memory документирует эти языки под угрозой${region}, от самой тяжёлой категории жизнеспособности к менее тяжёлым:`,
    species: (region: string) => `Эти виды под угрозой${region} задокументированы в Earth Memory, в порядке категорий Красного списка МСОП:`,
    traditions: (region: string, disappearing: boolean) =>
      disappearing
        ? `Эти традиции${region} имеют наивысший приоритет Memory Alert, который объединяет задокументированную угрозу (например, список ЮНЕСКО, требующий срочной охраны) с пробелами в архиве:`
        : `Эти традиции${region} задокументированы в Earth Memory:`,
    ecosystem: (name: string) => `Задокументированные изменения: ${name}, в хронологическом порядке:`,
    photographs: "Подходящие фотографии в архиве:",
    noPhotographs: "В Earth Memory пока нет исторических фотографий по этой теме. Могут помочь связанные записи:",
    connections: "Задокументированные связи в графе знаний:",
    multi: (region: string) => `Культурные традиции в архиве, общие для нескольких стран${region}:`,
    general: "Записи архива, подходящие к вашему вопросу:",
    nothing: "В архиве пока ничего не подходит к этому вопросу. Вы можете помочь, добавив запись.",
    footnote: "Ответ составлен из записей архива без языковой модели. Справочные записи ожидают экспертной проверки.",
    inRegion: (r: string) => ` (${r})`,
  },
};

export function composeRetrievalAnswer(retrieval: Retrieval, locale: Locale): string {
  const t = T[locale];
  const { intent, sources, gaps } = retrieval;
  const region = intent.region ? t.inRegion(intent.region.label) : "";
  if (sources.length === 0) return [t.nothing, ...gaps].join("\n\n");

  let intro: string;
  switch (intent.kind) {
    case "languages":
      intro = t.languages(region);
      break;
    case "species":
      intro = t.species(region);
      break;
    case "traditions":
      intro = t.traditions(region, intent.disappearing);
      break;
    case "ecosystem_change":
      intro = t.ecosystem(retrieval.ecosystemName ?? "");
      break;
    case "photographs":
      intro = sources.some((s) => s.type === "record" && gaps.length === 0) ? t.photographs : t.noPhotographs;
      break;
    case "connections":
      intro = t.connections;
      break;
    case "multi_country":
      intro = t.multi(region);
      break;
    default:
      intro = t.general;
  }

  const bullets = sources.map((s) => {
    const fact = s.facts.filter(Boolean)[0];
    const detail = s.type === "observation" ? s.excerpt : fact;
    return `- **${s.title}**${detail ? ` — ${detail}` : ""} [${s.n}]`;
  });
  const notes = intent.kind === "photographs" ? gaps.filter((g) => !g.startsWith("The archive does not hold")) : gaps;
  return [intro, bullets.join("\n"), ...notes, `_${t.footnote}_`].filter(Boolean).join("\n\n");
}
