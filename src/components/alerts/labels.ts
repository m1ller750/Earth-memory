import type { IucnStatus, LanguageStatus } from "@/lib/db/schema";
import type { MemoryAlert } from "@/lib/engine/alerts";
import { format, type Dictionary } from "@/lib/i18n";

export function threatLabel(alert: Pick<MemoryAlert, "subjectType" | "threatCategory">, t: Dictionary): string {
  if (alert.subjectType === "language") return t.languageStatus[alert.threatCategory as LanguageStatus] ?? alert.threatCategory;
  if (alert.subjectType === "species") return `${t.iucn[alert.threatCategory as IucnStatus] ?? alert.threatCategory} (${alert.threatCategory})`;
  return t.alerts.categories[alert.threatCategory as keyof Dictionary["alerts"]["categories"]] ?? alert.threatCategory;
}

export function factorDetail(alert: MemoryAlert, factor: MemoryAlert["factors"][number], t: Dictionary): string {
  const vars = { ...factor.detail };
  if (factor.key === "threat") vars.category = threatLabel(alert, t);
  return format(t.alerts.factorDetail[factor.key], vars);
}

export function alertHref(alert: Pick<MemoryAlert, "subjectType" | "slug">) {
  return `/alerts/${alert.subjectType}/${alert.slug}`;
}
