import type {
  Dimension,
  IucnStatus,
  LanguageStatus,
  License,
  Origin,
  RecordKind,
  Sensitivity,
  Visibility,
} from "../schema";

export type SourceKind = "book" | "article" | "archive" | "website" | "dataset" | "registry" | "museum" | "oral";

export interface SeedSource {
  citation: string;
  url?: string;
  kind: SourceKind;
}

export interface SeedLanguage {
  slug: string;
  name: string;
  endonym?: string;
  iso6393?: string;
  family: string;
  status: LanguageStatus;
  statusSource: string;
  speakersNote?: string;
  writingSystems: string[];
  countries: string[];
  lat: number;
  lng: number;
  description: string;
  aliases: string[];
  sources: SeedSource[];
}

export interface SeedLexiconEntry {
  language: string;
  headword: string;
  glossEn: string;
  glossRu?: string;
  partOfSpeech?: string;
  note?: string;
  source: string;
}

export interface SeedSpecies {
  slug: string;
  commonName: string;
  scientificName: string;
  iucnStatus: IucnStatus;
  assessmentNote: string;
  taxonGroup: "mammal" | "bird" | "reptile" | "amphibian" | "fish" | "invertebrate" | "plant";
  habitat: string;
  countries: string[];
  lat: number;
  lng: number;
  description: string;
  aliases: string[];
  sources: SeedSource[];
}

export interface SeedObservation {
  year: number;
  yearEnd?: number;
  title: string;
  observation: string;
  metric?: { name: string; value: number; unit: string };
  source: SeedSource;
  reliability: "high" | "medium" | "low";
}

export interface SeedEcosystem {
  slug: string;
  name: string;
  kind: "lake" | "forest" | "reef" | "wetland" | "mangrove" | "grassland" | "glacier" | "desert" | "ocean";
  countries: string[];
  lat: number;
  lng: number;
  description: string;
  statusNote: string;
  aliases: string[];
  sources: SeedSource[];
  observations: SeedObservation[];
}

export interface SeedRecord {
  slug: string;
  title: string;
  summary: string;
  body: string;
  dimension: Dimension;
  kind: RecordKind;
  country?: string;
  countries?: string[];
  placeName?: string;
  lat?: number;
  lng?: number;
  periodStart?: number;
  periodEnd?: number;
  dateLabel?: string;
  tags: string[];
  aliases?: string[];
  origin: Origin;
  visibility?: Visibility;
  sensitivity?: Sensitivity;
  license?: License;
  community?: string;
  contributor?: string;
  language?: string;
  species?: string;
  ecosystem?: string;
  entities: string[];
  sources: SeedSource[];
  /** Overrides the default reference/demo attribution (used for imported records). */
  attribution?: string;
}

export interface SeedEntity {
  slug: string;
  type:
    | "person"
    | "place"
    | "route"
    | "region"
    | "civilization"
    | "tradition"
    | "concept"
    | "organization"
    | "language_group"
    | "taxon"
    | "event";
  name: string;
  description: string;
  aliases?: string[];
  countries?: string[];
  lat?: number;
  lng?: number;
  periodStart?: number;
  periodEnd?: number;
}

/** Node reference in the form "<type>:<slug>", or "country:<ISO>". */
export type NodeRef = string;

export interface SeedEdge {
  source: NodeRef;
  target: NodeRef;
  relation: string;
  uncertainty: "confirmed" | "probable" | "speculative";
  evidence: string[];
  citation?: string;
}

export interface SeedProject {
  slug: string;
  name: string;
  organization: string;
  url?: string;
  focus: "language" | "species" | "ecosystem" | "heritage" | "archive";
  countries: string[];
  lat: number;
  lng: number;
  description: string;
  status: "active" | "completed" | "unknown";
  startYear?: number;
}

/** Reference data produced by the importer (`npm run ingest`), stored in seed/imported.json. */
export interface ImportedDataset {
  generatedAt: string | null;
  generator: string;
  notice: string;
  records: SeedRecord[];
  languages: SeedLanguage[];
  species: SeedSpecies[];
  ecosystems: SeedEcosystem[];
  entities: SeedEntity[];
}

/** Attribution used for every reference record compiled for the seed dataset. */
export const REFERENCE_ATTRIBUTION =
  "Compiled by the Earth Memory editorial process (AI-assisted) from the public sources listed. Pending expert verification.";

export const DEMO_ATTRIBUTION =
  "Demonstration content written for this prototype. The people and events described are fictional.";

/* Frequently cited sources */
export const SRC = {
  unescoAtlas: {
    citation: "Moseley, C. (ed.) (2010). Atlas of the World's Languages in Danger, 3rd edition. Paris: UNESCO Publishing.",
    kind: "book",
  },
  glottolog: { citation: "Glottolog: comprehensive reference information for the world's languages", url: "https://glottolog.org/", kind: "dataset" },
  elp: { citation: "Endangered Languages Project", url: "https://www.endangeredlanguages.com/", kind: "website" },
  iranica: { citation: "Encyclopaedia Iranica", url: "https://www.iranicaonline.org/", kind: "website" },
  iucn: { citation: "IUCN Red List of Threatened Species", url: "https://www.iucnredlist.org/", kind: "registry" },
  whc: { citation: "UNESCO World Heritage List", url: "https://whc.unesco.org/en/list/", kind: "registry" },
  ich: { citation: "UNESCO Lists of Intangible Cultural Heritage", url: "https://ich.unesco.org/en/lists", kind: "registry" },
  nasaEO: { citation: "NASA Earth Observatory", url: "https://earthobservatory.nasa.gov/", kind: "website" },
  micklin2007: {
    citation: "Micklin, P. (2007). The Aral Sea Disaster. Annual Review of Earth and Planetary Sciences, 35, 47–72.",
    kind: "article",
  },
  gbrmpa: { citation: "Great Barrier Reef Marine Park Authority, reef health updates", url: "https://www.gbrmpa.gov.au/", kind: "website" },
  inpe: { citation: "INPE, PRODES annual deforestation monitoring (TerraBrasilis)", url: "https://terrabrasilis.dpi.inpe.br/", kind: "dataset" },
} satisfies Record<string, SeedSource>;
