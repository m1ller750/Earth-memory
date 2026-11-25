import { and, eq, inArray, ne, or } from "drizzle-orm";
import { canViewRecord, type Viewer } from "@/lib/access/policy";
import { getDb } from "@/lib/db/client";
import { countries, ecosystems, edges, entities, languages, recordEntities, records, species, type EvidenceItem } from "@/lib/db/schema";

export type NodeType = "record" | "entity" | "language" | "species" | "ecosystem" | "country";

export interface GraphNode {
  key: string; // "<type>:<id>"
  type: NodeType;
  id: string;
  label: string;
  href: string;
  subtype?: string;
  dimension?: string;
  slug?: string;
}

export interface GraphLink {
  id: string;
  source: string;
  target: string;
  relation: string;
  provenance: string;
  uncertainty: "confirmed" | "probable" | "speculative";
  status: string;
  confidence: number;
  evidence: EvidenceItem[];
  citation: string | null;
}

export const nodeKey = (type: string, id: string) => `${type}:${id}`;

/** Resolves node references into labelled nodes; records the viewer cannot see are dropped. */
export async function resolveNodes(refs: Array<{ type: string; id: string }>, viewer: Viewer | null): Promise<Map<string, GraphNode>> {
  const db = await getDb();
  const ids = (type: string) => [...new Set(refs.filter((r) => r.type === type).map((r) => r.id))];
  const out = new Map<string, GraphNode>();
  const recordIds = ids("record");
  const entityIds = ids("entity");
  const languageIds = ids("language");
  const speciesIds = ids("species");
  const ecosystemIds = ids("ecosystem");
  const countryCodes = ids("country");

  const [rRows, eRows, lRows, sRows, ecRows, cRows] = await Promise.all([
    recordIds.length
      ? db
          .select({ id: records.id, slug: records.slug, title: records.title, dimension: records.dimension, kind: records.kind, visibility: records.visibility, sensitivity: records.sensitivity, contributorId: records.contributorId, communityId: records.communityId })
          .from(records)
          .where(inArray(records.id, recordIds))
      : [],
    entityIds.length ? db.select({ id: entities.id, slug: entities.slug, name: entities.name, type: entities.type }).from(entities).where(inArray(entities.id, entityIds)) : [],
    languageIds.length ? db.select({ id: languages.id, slug: languages.slug, name: languages.name }).from(languages).where(inArray(languages.id, languageIds)) : [],
    speciesIds.length ? db.select({ id: species.id, slug: species.slug, name: species.commonName }).from(species).where(inArray(species.id, speciesIds)) : [],
    ecosystemIds.length ? db.select({ id: ecosystems.id, slug: ecosystems.slug, name: ecosystems.name }).from(ecosystems).where(inArray(ecosystems.id, ecosystemIds)) : [],
    countryCodes.length ? db.select({ code: countries.code, name: countries.name }).from(countries).where(inArray(countries.code, countryCodes)) : [],
  ]);
  for (const r of rRows) {
    if (!canViewRecord(viewer, r)) continue;
    out.set(nodeKey("record", r.id), { key: nodeKey("record", r.id), type: "record", id: r.id, label: r.title, href: `/archive/${r.slug}`, subtype: r.kind, dimension: r.dimension, slug: r.slug });
  }
  for (const e of eRows) out.set(nodeKey("entity", e.id), { key: nodeKey("entity", e.id), type: "entity", id: e.id, label: e.name, href: `/graph?node=entity:${e.slug}`, subtype: e.type, slug: e.slug });
  for (const l of lRows) out.set(nodeKey("language", l.id), { key: nodeKey("language", l.id), type: "language", id: l.id, label: l.name, href: `/languages/${l.slug}`, slug: l.slug });
  for (const s of sRows) out.set(nodeKey("species", s.id), { key: nodeKey("species", s.id), type: "species", id: s.id, label: s.name, href: `/living-earth/species/${s.slug}`, slug: s.slug });
  for (const e of ecRows) out.set(nodeKey("ecosystem", e.id), { key: nodeKey("ecosystem", e.id), type: "ecosystem", id: e.id, label: e.name, href: `/living-earth/ecosystems/${e.slug}`, slug: e.slug });
  for (const c of cRows) out.set(nodeKey("country", c.code), { key: nodeKey("country", c.code), type: "country", id: c.code, label: c.name, href: `/places/${c.code.toLowerCase()}`, slug: c.code.toLowerCase() });
  return out;
}

/** All links touching one node: stored edges plus implicit links (record → entity, language, species, ecosystem, country). */
export async function linksForNode(type: NodeType, id: string, options: { includeProposed?: boolean; includeRejected?: boolean } = {}): Promise<GraphLink[]> {
  const db = await getDb();
  const statusFilter = options.includeRejected ? undefined : options.includeProposed ? ne(edges.status, "rejected") : eq(edges.status, "accepted");
  const stored = await db
    .select()
    .from(edges)
    .where(and(or(and(eq(edges.sourceType, type), eq(edges.sourceId, id)), and(eq(edges.targetType, type), eq(edges.targetId, id))), statusFilter));
  const links: GraphLink[] = stored.map((e) => ({
    id: e.id,
    source: nodeKey(e.sourceType, e.sourceId),
    target: nodeKey(e.targetType, e.targetId),
    relation: e.relation,
    provenance: e.provenance,
    uncertainty: e.uncertainty as GraphLink["uncertainty"],
    status: e.status,
    confidence: e.confidence,
    evidence: e.evidence,
    citation: e.citation,
  }));

  const implicit = (source: string, target: string, relation: string, detail: string): GraphLink => ({
    id: `implicit:${source}>${target}`,
    source,
    target,
    relation,
    provenance: "editorial",
    uncertainty: "confirmed",
    status: "accepted",
    confidence: 1,
    evidence: [{ kind: "editorial", detail }],
    citation: null,
  });

  if (type === "record") {
    const [rec] = await db
      .select({ languageId: records.languageId, speciesId: records.speciesId, ecosystemId: records.ecosystemId, countryCodes: records.countryCodes, countryCode: records.countryCode })
      .from(records)
      .where(eq(records.id, id))
      .limit(1);
    const ents = await db.select({ entityId: recordEntities.entityId }).from(recordEntities).where(eq(recordEntities.recordId, id));
    const self = nodeKey("record", id);
    for (const e of ents) links.push(implicit(self, nodeKey("entity", e.entityId), "about", "Linked by the record's editor or contributor"));
    if (rec?.languageId) links.push(implicit(self, nodeKey("language", rec.languageId), "concerns_language", "The record documents this language"));
    if (rec?.speciesId) links.push(implicit(self, nodeKey("species", rec.speciesId), "concerns_species", "The record documents this species"));
    if (rec?.ecosystemId) links.push(implicit(self, nodeKey("ecosystem", rec.ecosystemId), "concerns_ecosystem", "The record documents this ecosystem"));
    for (const c of new Set([rec?.countryCode, ...(rec?.countryCodes ?? [])].filter(Boolean) as string[])) {
      links.push(implicit(self, nodeKey("country", c), "located_in", "Country recorded on the record"));
    }
  } else if (type === "entity") {
    const recs = await db.select({ recordId: recordEntities.recordId }).from(recordEntities).where(eq(recordEntities.entityId, id));
    for (const r of recs) links.push(implicit(nodeKey("record", r.recordId), nodeKey("entity", id), "about", "Linked by the record's editor or contributor"));
  } else if (type === "language" || type === "species" || type === "ecosystem") {
    const column = type === "language" ? records.languageId : type === "species" ? records.speciesId : records.ecosystemId;
    const recs = await db.select({ id: records.id }).from(records).where(eq(column, id));
    for (const r of recs) links.push(implicit(nodeKey("record", r.id), nodeKey(type, id), `concerns_${type}`, `The record documents this ${type}`));
  } else if (type === "country") {
    const recs = await db.select({ id: records.id }).from(records).where(or(eq(records.countryCode, id)));
    for (const r of recs.slice(0, 40)) links.push(implicit(nodeKey("record", r.id), nodeKey("country", id), "located_in", "Country recorded on the record"));
  }
  return links;
}

/** Breadth-first neighbourhood for the graph explorer, capped to keep the view readable. */
export async function neighborhood(root: { type: NodeType; id: string }, viewer: Viewer | null, options: { depth?: number; includeProposed?: boolean; maxNodes?: number } = {}) {
  const depth = Math.min(3, Math.max(1, options.depth ?? 2));
  const maxNodes = options.maxNodes ?? 70;
  const seen = new Set<string>([nodeKey(root.type, root.id)]);
  const links = new Map<string, GraphLink>();
  let frontier = [root];
  for (let level = 0; level < depth && frontier.length; level++) {
    const next: Array<{ type: NodeType; id: string }> = [];
    for (const node of frontier) {
      // Countries are hubs; only expand them from the root.
      if (node.type === "country" && level > 0) continue;
      for (const link of await linksForNode(node.type, node.id, { includeProposed: options.includeProposed })) {
        if (seen.size >= maxNodes && (!seen.has(link.source) || !seen.has(link.target))) continue;
        links.set(link.id, link);
        for (const key of [link.source, link.target]) {
          if (!seen.has(key)) {
            seen.add(key);
            const [type, ...rest] = key.split(":");
            next.push({ type: type as NodeType, id: rest.join(":") });
          }
        }
      }
    }
    frontier = next;
  }
  const nodes = await resolveNodes([...seen].map((k) => ({ type: k.split(":")[0], id: k.split(":").slice(1).join(":") })), viewer);
  const visibleLinks = [...links.values()].filter((l) => nodes.has(l.source) && nodes.has(l.target));
  return { nodes: [...nodes.values()], links: visibleLinks };
}

/** Finds a node by "<type>:<slug-or-id>". */
export async function findNode(ref: string): Promise<{ type: NodeType; id: string } | null> {
  const [type, key] = [ref.split(":")[0], ref.split(":").slice(1).join(":")];
  if (!key) return null;
  const db = await getDb();
  const bySlugOrId = async (table: typeof entities | typeof languages | typeof species | typeof ecosystems | typeof records) => {
    const isUuid = /^[0-9a-f-]{36}$/i.test(key);
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(isUuid ? eq(table.id, key) : eq(table.slug, key))
      .limit(1);
    return row?.id ?? null;
  };
  switch (type) {
    case "entity": {
      const id = await bySlugOrId(entities);
      return id ? { type, id } : null;
    }
    case "language": {
      const id = await bySlugOrId(languages);
      return id ? { type, id } : null;
    }
    case "species": {
      const id = await bySlugOrId(species);
      return id ? { type, id } : null;
    }
    case "ecosystem": {
      const id = await bySlugOrId(ecosystems);
      return id ? { type, id } : null;
    }
    case "record": {
      const id = await bySlugOrId(records);
      return id ? { type, id } : null;
    }
    case "country":
      return /^[a-z]{2}$/i.test(key) ? { type: "country", id: key.toUpperCase() } : null;
    default:
      return null;
  }
}
