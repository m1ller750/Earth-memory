import { and, asc, eq, inArray } from "drizzle-orm";
import type { Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { conservationProjects, ecosystemObservations, ecosystems, sources, species, type IucnStatus } from "@/lib/db/schema";
import { getAlert } from "./alerts";
import { linksForNode, resolveNodes } from "./graph";
import { listRecords } from "./records";

export async function listSpecies(status?: IucnStatus) {
  const db = await getDb();
  return db.select().from(species).where(status ? eq(species.iucnStatus, status) : undefined).orderBy(asc(species.commonName));
}

export async function listEcosystems() {
  const db = await getDb();
  return db.select().from(ecosystems).orderBy(asc(ecosystems.name));
}

export async function listProjects() {
  const db = await getDb();
  return db.select().from(conservationProjects).orderBy(asc(conservationProjects.name));
}

async function graphNeighbours(type: "species" | "ecosystem", id: string, viewer: Viewer | null) {
  const links = (await linksForNode(type, id)).filter((l) => !l.id.startsWith("implicit:"));
  const nodes = await resolveNodes(links.flatMap((l) => [l.source, l.target]).map((k) => ({ type: k.split(":")[0], id: k.split(":").slice(1).join(":") })), viewer);
  const self = `${type}:${id}`;
  return links
    .map((l) => ({ link: l, node: nodes.get(l.source === self ? l.target : l.source) }))
    .filter((x): x is { link: typeof x.link; node: NonNullable<typeof x.node> } => Boolean(x.node));
}

export async function getSpecies(slug: string, viewer: Viewer | null) {
  const db = await getDb();
  const [row] = await db.select().from(species).where(eq(species.slug, slug)).limit(1);
  if (!row) return null;
  const [src, recs, neighbours, alert] = await Promise.all([
    db.select().from(sources).where(and(eq(sources.subjectType, "species"), eq(sources.subjectId, row.id))),
    listRecords({ speciesId: row.id }, viewer, { limit: 9 }),
    graphNeighbours("species", row.id, viewer),
    getAlert("species", row.slug),
  ]);
  return { species: row, sources: src, records: recs.items, neighbours, alert };
}

export async function getEcosystem(slug: string, viewer: Viewer | null) {
  const db = await getDb();
  const [row] = await db.select().from(ecosystems).where(eq(ecosystems.slug, slug)).limit(1);
  if (!row) return null;
  const [src, observations, recs, neighbours, alert, projects] = await Promise.all([
    db.select().from(sources).where(and(eq(sources.subjectType, "ecosystem"), eq(sources.subjectId, row.id))),
    db.select().from(ecosystemObservations).where(eq(ecosystemObservations.ecosystemId, row.id)).orderBy(asc(ecosystemObservations.year)),
    listRecords({ ecosystemId: row.id }, viewer, { limit: 9, sort: "oldest" }),
    graphNeighbours("ecosystem", row.id, viewer),
    getAlert("ecosystem", row.slug),
    db.select().from(conservationProjects).where(inArray(conservationProjects.focus, ["ecosystem", "species"])),
  ]);
  return {
    ecosystem: row,
    sources: src,
    observations,
    records: recs.items,
    neighbours,
    alert,
    projects: projects.filter((p) => p.countryCodes.some((c) => row.countryCodes.includes(c))),
  };
}
