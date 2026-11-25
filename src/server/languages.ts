import { and, arrayOverlaps, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { conservationProjects, languages, lexiconEntries, media, sources, users, type LanguageStatus } from "@/lib/db/schema";
import { foldForSearch } from "@/lib/text";
import { getAlert } from "./alerts";
import { listRecords } from "./records";
import { buildTsQuery, ftsMatch, fuzzyMatch } from "./query";

export async function listLanguages(filters: { q?: string; status?: LanguageStatus; countries?: string[] } = {}) {
  const db = await getDb();
  const tsq = filters.q ? buildTsQuery(filters.q) : null;
  return db
    .select()
    .from(languages)
    .where(
      and(
        filters.status ? eq(languages.status, filters.status) : undefined,
        filters.countries?.length ? arrayOverlaps(languages.countryCodes, filters.countries) : undefined,
        filters.q ? (tsq ? or(ftsMatch(languages.searchText, tsq), fuzzyMatch(foldForSearch(filters.q), languages.name)) : fuzzyMatch(foldForSearch(filters.q), languages.name)) : undefined,
      ),
    )
    .orderBy(asc(languages.name));
}

export async function getLanguage(slug: string, viewer: Viewer | null) {
  const db = await getDb();
  const [language] = await db.select().from(languages).where(eq(languages.slug, slug)).limit(1);
  if (!language) return null;
  const [lexicon, langSources, related, projects, alert] = await Promise.all([
    db
      .select({ entry: lexiconEntries, contributorName: users.name })
      .from(lexiconEntries)
      .leftJoin(users, eq(users.id, lexiconEntries.contributorId))
      .where(eq(lexiconEntries.languageId, language.id))
      .orderBy(desc(lexiconEntries.createdAt), asc(lexiconEntries.headword)),
    db.select().from(sources).where(and(eq(sources.subjectType, "language"), eq(sources.subjectId, language.id))),
    listRecords({ languageId: language.id }, viewer, { limit: 12, sort: "oldest" }),
    db
      .select()
      .from(conservationProjects)
      .where(and(eq(conservationProjects.focus, "language"), arrayOverlaps(conservationProjects.countryCodes, language.countryCodes.length ? language.countryCodes : ["--"]))),
    getAlert("language", language.slug),
  ]);
  const entryIds = lexicon.map((l) => l.entry.id);
  const audio = entryIds.length
    ? await db.select({ id: media.id, lexiconEntryId: media.lexiconEntryId }).from(media).where(and(inArray(media.lexiconEntryId, entryIds), eq(media.kind, "audio")))
    : [];
  const audioByEntry = new Map(audio.map((a) => [a.lexiconEntryId!, a.id]));
  return {
    language,
    lexicon: lexicon.map((l) => ({ ...l.entry, contributorName: l.contributorName, audioId: audioByEntry.get(l.entry.id) ?? null })),
    sources: langSources,
    records: related.items,
    projects,
    alert,
  };
}
