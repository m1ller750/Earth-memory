import { DIMENSIONS, ORIGINS, RECORD_KINDS, VERIFICATIONS, type Dimension, type Origin, type RecordKind, type Verification } from "../db/schema";
import { findRegion } from "../geo/regions";
import type { RecordFilters, RecordSort } from "@/server/records";

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
  const v = params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() ? s.trim() : undefined;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function year(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value.replace("−", "-"));
  return Number.isInteger(n) && n >= -10000 && n <= 3000 ? n : undefined;
}

export interface ParsedArchiveParams {
  filters: RecordFilters;
  sort: RecordSort | undefined;
  page: number;
  region: string | undefined;
}

/** Parses archive query parameters, ignoring anything invalid. */
export function parseArchiveParams(params: Params): ParsedArchiveParams {
  const regionName = one(params, "region");
  const region = regionName ? findRegion(regionName) : null;
  const country = one(params, "country")?.toUpperCase();
  const filters: RecordFilters = {
    q: one(params, "q")?.slice(0, 200),
    dimension: oneOf<Dimension>(one(params, "dimension"), DIMENSIONS),
    kind: oneOf<RecordKind>(one(params, "kind"), RECORD_KINDS),
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    countries: region?.codes,
    verification: oneOf<Verification>(one(params, "verification"), VERIFICATIONS),
    origin: oneOf<Origin>(one(params, "origin"), ORIGINS),
    from: year(one(params, "from")),
    to: year(one(params, "to")),
    tag: one(params, "tag")?.slice(0, 60),
    multiCountry: one(params, "multi") === "1" ? true : undefined,
  };
  const sort = oneOf<RecordSort>(one(params, "sort"), ["relevance", "newest", "oldest", "title"]);
  const page = Math.max(1, Math.min(500, Number(one(params, "page")) || 1));
  return { filters, sort, page, region: region?.label };
}
