import { findRegion, type RegionMatch } from "../geo/regions";

/**
 * Lightweight, transparent intent detection for EARTH AI (English and Russian).
 * It decides which parts of the archive to retrieve; it never generates text.
 */
export type Intent =
  | { kind: "multi_country"; region: RegionMatch | null }
  | { kind: "connections"; civilizations: boolean; region: RegionMatch | null }
  | { kind: "photographs"; region: RegionMatch | null }
  | { kind: "ecosystem_change"; ecosystemHint: string | null; region: RegionMatch | null }
  | { kind: "languages"; region: RegionMatch | null }
  | { kind: "species"; region: RegionMatch | null }
  | { kind: "traditions"; disappearing: boolean; region: RegionMatch | null }
  | { kind: "general"; region: RegionMatch | null };

const RX = {
  multiCountry: /(multiple|several|many|more than one|different) countries|across (borders|countries)|shared by (several|many|multiple)|нескольк\w* стран|разных стран|многих стран|общ\w+ для (нескольких|разных)/i,
  connections: /\bconnect(ion|ions|ed)?\b|\blinks?\b|relationship|\brelated\b|between .+ and|связ\w*|взаимосвяз\w*|отношени\w*/i,
  civilizations: /civili[sz]ation|empire|ancient|antiquity|kingdom|dynasty|цивилизац\w*|импери\w*|древн\w*|царств\w*|династи\w*/i,
  photographs: /photo(graph)?s?\b|pictures?|images?|фото\w*|фотограф\w*|снимк\w*|изображени\w*/i,
  change: /chang(e|ed|es|ing)|transform|shr(i|u)nk|declin|disappear|retreat|melt|vanish|\blost\b|over the (last|past)|histor(y|ical)|изменил|изменени|менял|сократил|высох|отступа|тают|таял|исчез|за последн|истори/iu,
  // JavaScript's \b only knows Latin letters, so Cyrillic words use Unicode lookarounds instead.
  ecosystem: /ecosystem|lake|sea\b|forest|reef|glacier|marsh|wetland|steppe|river|mangrove|экосистем|озер|мор[еяю](?!\p{L})|лес|риф|ледник|болот|степ|рек[аиу](?!\p{L})|мангр/iu,
  languages: /\blanguages?\b|dialects?|speakers?|linguist|(?<!\p{L})язык|наречи|диалект|носител/iu,
  species: /species|animals?|wildlife|fauna|flora|birds?|mammals?|fish\b|plants?|extinct|(?<!\p{L})вид(ы|ов)(?!\p{L})|животн|фаун|флор|птиц|млекопитающ|растени|вымерш/iu,
  traditions: /traditions?|customs?|rituals?|crafts?|music|dance|festival|heritage|practices?|традиц\w*|обыча\w*|обряд\w*|ремесл\w*|музык\w*|танц\w*|праздник\w*|наследи\w*/i,
  disappearing: /disappear|vanish|endanger|at risk|threat|dying|lost|extinct|urgent|исчеза\w*|под угроз\w*|вымира\w*|утрач\w*|исчезнов\w*|срочн\w*/i,
};

/** Named ecosystems people ask about, mapped to seed slugs (English and Russian forms). */
export const ECOSYSTEM_HINTS: Array<[RegExp, string]> = [
  [/aral|арал/i, "aral-sea"],
  [/lake chad|озер\p{L}* чад|(?<!\p{L})чад(?!\p{L})/iu, "lake-chad"],
  [/barrier reef|барьерн\w* риф/i, "great-barrier-reef"],
  [/amazon|амазон/i, "amazon-rainforest"],
  [/mesopotamian|marsh arabs|ahwar|месопотам|иракск\w* болот/i, "mesopotamian-marshes"],
  [/baikal|байкал/i, "lake-baikal"],
  [/sundarban|сундарбан/i, "sundarbans"],
  [/tugai|тугай|тугаи/i, "tugai-forests"],
  [/kilimanjaro|килиманджаро/i, "kilimanjaro-ice-fields"],
  [/betpak|бетпак/i, "betpak-dala-steppe"],
];

export function ecosystemHint(text: string): string | null {
  for (const [rx, slug] of ECOSYSTEM_HINTS) if (rx.test(text)) return slug;
  return null;
}

export function parseIntent(question: string, context: { region?: string | null; ecosystemSlug?: string | null } = {}): Intent {
  const q = question.trim();
  const region = findRegion(q) ?? (context.region ? findRegion(context.region) : null);
  const hint = ecosystemHint(q) ?? context.ecosystemSlug ?? null;

  if (RX.multiCountry.test(q)) return { kind: "multi_country", region };
  if (RX.connections.test(q) && (RX.civilizations.test(q) || /between/i.test(q) || /между/i.test(q))) {
    return { kind: "connections", civilizations: RX.civilizations.test(q), region };
  }
  if (RX.photographs.test(q)) return { kind: "photographs", region };
  if ((RX.change.test(q) && RX.ecosystem.test(q)) || (hint && RX.change.test(q))) return { kind: "ecosystem_change", ecosystemHint: hint, region };
  if (RX.languages.test(q)) return { kind: "languages", region };
  if (RX.species.test(q)) return { kind: "species", region };
  if (RX.traditions.test(q)) return { kind: "traditions", disappearing: RX.disappearing.test(q), region };
  if (hint) return { kind: "ecosystem_change", ecosystemHint: hint, region };
  return { kind: "general", region };
}

export function isRussian(text: string): boolean {
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return cyrillic > latin;
}
