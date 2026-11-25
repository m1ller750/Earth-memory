/**
 * Finds a freely licensed photograph for archive records, species and ecosystems: the lead image of
 * the item's English Wikipedia article, accepted only when the file lives on Wikimedia Commons under
 * a free licence (CC0, public domain, CC BY, CC BY-SA). Credits come from the file's Commons metadata.
 * Languages are deliberately left without photos.
 */
import type { RemoteImage } from "../db/schema";
import { DiskCache, getJson, withRetry, type Log } from "./sources";

export type ImageSubject = "record" | "species" | "ecosystem";

/** Wikipedia articles for the hand-curated seed items (imported items carry their article as a source). */
export const CURATED_ARTICLES: Record<string, string> = {
  // archive records
  "record:shashmaqom-music": "Shashmaqam",
  "record:navruz": "Nowruz",
  "record:manas-epic-trilogy": "Epic of Manas",
  "record:aitys-improvisation": "Aytys",
  "record:dombra-kuy": "Dombra",
  "record:kyrgyz-felt-carpets": "Shyrdak",
  "record:kazakh-kyrgyz-yurts": "Yurt",
  "record:palov-culture": "Pilaf",
  "record:khoomei": "Mongolian throat singing",
  "record:morin-khuur": "Morin khuur",
  "record:mongol-biyelgee": "Biyelgee",
  "record:ainu-traditional-dance": "Ainu people",
  "record:ca-tru-singing": "Ca trù",
  "record:georgian-polyphony": "Georgian polyphony",
  "record:hezhen-yimakan": "Hezhen people",
  "record:al-sadu-weaving": "Al Sadu",
  "record:tango": "Tango",
  "record:ned-maddrell-last-native-manx-speaker": "Ned Maddrell",
  "record:dolly-pentreath-cornish": "Dolly Pentreath",
  "record:grizelda-kristina-livonian": "Grizelda Kristiņa",
  "record:cristina-calderon-yaghan": "Cristina Calderón",
  "record:marie-smith-jones-eyak": "Marie Smith Jones",
  "record:doris-mclemore-wichita": "Doris McLemore",
  "record:samarkand-crossroad-of-cultures": "Samarkand",
  "record:historic-centre-of-bukhara": "Bukhara",
  "record:itchan-kala-khiva": "Itchan Kala",
  "record:ancient-merv": "Merv",
  "record:silk-roads-chang-an-tianshan": "Silk Roads: the Routes Network of Chang'an-Tianshan Corridor",
  "record:silk-roads-zarafshan-karakum": "Silk Roads: Zarafshan-Karakum Corridor",
  "record:sarazm-proto-urban-site": "Sarazm",
  "record:ancient-penjikent": "Panjakent",
  "record:afrasiyab-ambassadors-murals": "Ambassadors' Painting",
  "record:mogao-caves-library-cave": "Library Cave",
  "record:timbuktu-manuscripts": "Timbuktu manuscripts",
  "record:otrar": "Otrar",
  "record:mongol-conquest-of-transoxiana": "Mongol invasion of the Khwarazmian Empire",
  "record:timurid-renaissance": "Timurid Renaissance",
  "record:moynaq-former-fishing-port": "Moynaq",
  "record:yaghnob-valley-resettlement": "Yaghnob Valley",
  "record:crimean-tatar-deportation-1944": "Deportation of the Crimean Tatars",
  "record:angkor": "Angkor",
  "record:petra": "Petra",
  "record:machu-picchu": "Machu Picchu",
  "record:rapa-nui": "Easter Island",
  "record:venice-and-its-lagoon": "Venice",
  "record:ulugh-beg-observatory": "Ulugh Beg Observatory",
  "record:al-khwarizmi-al-jabr": "The Compendious Book on Calculation by Completion and Balancing",
  "record:ibn-sina-canon-of-medicine": "The Canon of Medicine",
  "record:al-biruni-earth-radius": "Al-Biruni",
  "record:landsat-record-of-the-aral-sea": "Aral Sea",
  "record:keeling-curve-mauna-loa": "Mauna Loa Observatory",
  "record:vavilov-seed-collection-siege": "Vavilov Institute of Plant Industry",
  "record:svalbard-global-seed-vault": "Svalbard Global Seed Vault",
  "record:darwin-galapagos-1835": "Second voyage of HMS Beagle",
  // species
  "species:amur-leopard": "Amur leopard",
  "species:snow-leopard": "Snow leopard",
  "species:saiga-antelope": "Saiga antelope",
  "species:wild-bactrian-camel": "Wild Bactrian camel",
  "species:przewalskis-horse": "Przewalski's horse",
  "species:siberian-crane": "Siberian crane",
  "species:caspian-seal": "Caspian seal",
  "species:syr-darya-shovelnose-sturgeon": "Syr Darya shovelnose sturgeon",
  "species:beluga-sturgeon": "Beluga (sturgeon)",
  "species:asiatic-cheetah": "Asiatic cheetah",
  "species:argali": "Argali",
  "species:vaquita": "Vaquita",
  "species:axolotl": "Axolotl",
  "species:kakapo": "Kākāpō",
  "species:sumatran-orangutan": "Sumatran orangutan",
  "species:javan-rhinoceros": "Javan rhinoceros",
  "species:mountain-gorilla": "Mountain gorilla",
  "species:giant-panda": "Giant panda",
  "species:hawksbill-turtle": "Hawksbill sea turtle",
  // ecosystems
  "ecosystem:aral-sea": "Aral Sea",
  "ecosystem:lake-chad": "Lake Chad",
  "ecosystem:great-barrier-reef": "Great Barrier Reef",
  "ecosystem:amazon-rainforest": "Amazon rainforest",
  "ecosystem:mesopotamian-marshes": "Mesopotamian Marshes",
  "ecosystem:lake-baikal": "Lake Baikal",
  "ecosystem:sundarbans": "Sundarbans",
  "ecosystem:tugai-forests": "Tugay",
  "ecosystem:kilimanjaro-ice-fields": "Mount Kilimanjaro",
  "ecosystem:betpak-dala-steppe": "Betpak-Dala",
};

/**
 * Items whose article image is unsuitable for a card (graphic injuries and similar). They keep the
 * generated cover; the reason stays here so the choice can be reviewed.
 */
export const NO_PHOTO: Record<string, string> = {
  "record:hibakusha": "The article's lead image shows burn injuries of a survivor.",
};

/** Article title from an English Wikipedia URL ("…/wiki/Lake_Nyos_disaster" → "Lake Nyos disaster"). */
export function articleFromUrl(url: string | undefined): string | undefined {
  const m = url ? /^https:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(url) : null;
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : undefined;
}

const FREE_LICENCE = /^(?:cc0|cc[ -]by(?:-sa)?(?:[ -][\d.]+)?|public domain|pd\b|no restrictions|attribution)/i;

/** True for the licences this archive can display with a credit. */
export function isFreeLicence(name: string | undefined): boolean {
  return Boolean(name) && FREE_LICENCE.test(name!.trim()) && !/non-?free|fair use/i.test(name!);
}

/** Plain-text credit from Commons' HTML "Artist" field. */
export function plainCredit(html: string | undefined): string {
  const text = (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(.+?) \1$/, "$1");
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

interface PageImageResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; pageimage?: string; thumbnail?: { source: string; width: number; height: number }; missing?: boolean }>;
  };
}

interface CommonsResponse {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    pages?: Array<{
      title: string;
      missing?: boolean;
      imagerepository?: string;
      imageinfo?: Array<{ mime?: string; descriptionurl?: string; extmetadata?: Record<string, { value: string }> }>;
    }>;
  };
}

/** Widths Wikimedia renders thumbnails at (other widths are refused). */
const STANDARD_WIDTHS = [960, 500, 330, 250];

/**
 * A downloadable thumbnail URL on thumb.wikimedia.org, at most 960 px wide. Originals on
 * upload.wikimedia.org are converted to their thumbnail form, because that host is not reachable
 * from every network.
 */
export function thumbnailUrl(image: Pick<RemoteImage, "url" | "width">): string | null {
  const width = STANDARD_WIDTHS.find((w) => w <= (image.width ?? 960)) ?? null;
  if (!width) return null;
  const thumb = /^https:\/\/thumb\.wikimedia\.org\/wikipedia\/commons\/thumb\/(.+)\/\d+px-([^/]+)$/.exec(image.url);
  if (thumb) return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${thumb[1]}/${width}px-${thumb[2]}`;
  const original = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f]\/[0-9a-f]{2}\/([^/]+))$/.exec(image.url);
  if (original) {
    const name = original[2];
    const suffix = /\.(?:tiff?|pdf)$/i.test(name) ? `${name}.jpg` : name;
    return `https://thumb.wikimedia.org/wikipedia/commons/thumb/${original[1]}/${width}px-${suffix}`;
  }
  return null;
}

const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/**
 * Lead images for many Wikipedia articles, filtered to free Commons photographs.
 * Returns article title → image (articles without a suitable image are absent).
 */
export async function findImages(articles: string[], cache: DiskCache, log: Log = () => {}): Promise<Map<string, RemoteImage>> {
  const leads = new Map<string, { file: string; url: string; width: number; height: number }>();
  for (const batch of chunks([...new Set(articles)], 40)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      redirects: "1",
      prop: "pageimages",
      piprop: "thumbnail|name",
      pithumbsize: "1280",
      pilimit: "50",
      pilicense: "free",
      titles: batch.join("|"),
    });
    const key = `pageimages:${batch.join("|")}`;
    const data =
      cache.get<PageImageResponse>("images", key) ??
      (await withRetry(() => getJson<PageImageResponse>(`https://en.wikipedia.org/w/api.php?${params}`), "wikipedia page images", log));
    cache.set("images", key, data);
    const rename = new Map<string, string>();
    for (const n of [...(data.query?.normalized ?? []), ...(data.query?.redirects ?? [])]) rename.set(n.from, n.to);
    const byTitle = new Map((data.query?.pages ?? []).map((p) => [p.title, p]));
    for (const requested of batch) {
      let title = requested;
      for (let i = 0; i < 4 && rename.has(title); i++) title = rename.get(title)!;
      const page = byTitle.get(title);
      if (page?.pageimage && page.thumbnail) leads.set(requested, { file: page.pageimage, url: page.thumbnail.source, width: page.thumbnail.width, height: page.thumbnail.height });
    }
  }

  // Credits and licences from Commons; files that are not on Commons (local, often non-free) are dropped.
  const files = [...new Set([...leads.values()].map((l) => l.file))];
  const meta = new Map<string, { license: string; licenseUrl?: string; author: string; sourceUrl: string; mime?: string }>();
  for (const batch of chunks(files, 40)) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
      iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|NonFree",
      titles: batch.map((f) => `File:${f}`).join("|"),
    });
    const key = `commons:${batch.join("|")}`;
    const data =
      cache.get<CommonsResponse>("images", key) ??
      (await withRetry(() => getJson<CommonsResponse>(`https://commons.wikimedia.org/w/api.php?${params}`), "commons metadata", log));
    cache.set("images", key, data);
    const rename = new Map((data.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const page of data.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      // Asked of Commons itself, Commons files report imagerepository "local"; files elsewhere come back missing.
      if (page.missing || !info) continue;
      const ext = info.extmetadata ?? {};
      if (ext.NonFree?.value && ext.NonFree.value !== "false") continue;
      const license = plainCredit(ext.LicenseShortName?.value);
      if (!isFreeLicence(license)) continue;
      const file = (rename.get(page.title) ?? page.title).replace(/^File:/, "").replace(/ /g, "_");
      meta.set(file, {
        license,
        licenseUrl: ext.LicenseUrl?.value,
        author: plainCredit(ext.Artist?.value) || plainCredit(ext.Credit?.value) || "Unknown author",
        sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        mime: info.mime,
      });
    }
  }

  const result = new Map<string, RemoteImage>();
  for (const [article, lead] of leads) {
    const m = meta.get(lead.file.replace(/ /g, "_"));
    if (!m) continue;
    // Photographs only: drawings in SVG (maps, flags, logos, diagrams) and animations are skipped.
    if (/\.(?:svg|gif)$/i.test(lead.file) || /svg|gif/i.test(m.mime ?? "")) continue;
    // Commons files only (thumbnails are served from thumb.wikimedia.org, small originals from upload.wikimedia.org).
    const url = lead.url.replace(/\?.*$/, "");
    if (!/^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(url)) continue;
    result.set(article, {
      url,
      width: lead.width,
      height: lead.height,
      title: lead.file.replace(/_/g, " "),
      author: m.author,
      license: m.license,
      licenseUrl: m.licenseUrl,
      sourceUrl: m.sourceUrl,
    });
  }
  return result;
}
