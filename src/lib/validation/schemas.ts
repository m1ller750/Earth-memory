import { z } from "zod";
import { DIMENSIONS, LICENSES, RECORD_KINDS, SENSITIVITIES, VISIBILITIES } from "../db/schema";

const year = z.coerce.number().int().min(-10000).max(3000);
const optionalYear = z.preprocess((v) => (v === "" || v == null ? undefined : String(v).replace("−", "-")), year.optional());
const optionalCoordinate = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(min).max(max).optional());

export const reviewSchema = z.object({
  recordId: z.uuid(),
  decision: z.enum(["approve", "request_changes", "dispute"]),
  note: z.string().trim().max(2000).default(""),
});

export const reportSchema = z.object({
  subjectType: z.enum(["record", "lexicon", "edge"]).default("record"),
  subjectId: z.uuid(),
  reason: z.enum(["inaccurate", "sensitive", "copyright", "privacy", "abuse", "spam"]),
  details: z.string().trim().max(2000).default(""),
});

export const connectionReviewSchema = z.object({
  recordId: z.uuid(),
  otherId: z.uuid(),
  decision: z.enum(["accept", "reject"]),
});

export const sourceSchema = z.object({
  citation: z.string().trim().min(3).max(500),
  url: z.preprocess((v) => (v === "" ? undefined : v), z.url({ protocol: /^https?$/ }).max(1000).optional()),
});

export const recordInputSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    summary: z.string().trim().max(400).default(""),
    body: z.string().trim().min(20).max(20000),
    dimension: z.enum(DIMENSIONS),
    kind: z.enum(RECORD_KINDS),
    contentLanguage: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).default("en"),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    placeName: z.string().trim().max(200).optional(),
    countryCode: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^[A-Z]{2}$/).optional()),
    lat: optionalCoordinate(-90, 90),
    lng: optionalCoordinate(-180, 180),
    periodStart: optionalYear,
    periodEnd: optionalYear,
    dateLabel: z.string().trim().max(120).optional(),
    visibility: z.enum(VISIBILITIES).default("public"),
    sensitivity: z.enum(SENSITIVITIES).default("none"),
    license: z.enum(LICENSES).default("CC-BY-4.0"),
    attribution: z.string().trim().max(200).default(""),
    communityId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
    sources: z.array(sourceSchema).max(20).default([]),
    mediaIds: z.array(z.uuid()).max(12).default([]),
    consent: z.literal(true, { error: "Consent is required to share this memory." }),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), { message: "Provide both latitude and longitude, or neither.", path: ["lat"] })
  .refine((v) => v.periodStart == null || v.periodEnd == null || v.periodEnd >= v.periodStart, { message: "The end year must not be before the start year.", path: ["periodEnd"] })
  .refine((v) => v.visibility === "public" || v.visibility === "private" || Boolean(v.communityId), {
    message: "Choose the community that controls access.",
    path: ["communityId"],
  });

export type RecordInput = z.infer<typeof recordInputSchema>;

export const lexiconInputSchema = z.object({
  languageId: z.uuid(),
  headword: z.string().trim().min(1).max(120),
  transcription: z.string().trim().max(120).optional(),
  glossEn: z.string().trim().min(1).max(300),
  glossRu: z.string().trim().max(300).optional(),
  partOfSpeech: z.string().trim().max(40).optional(),
  sourceCitation: z.string().trim().min(3).max(300),
  mediaId: z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional()),
});

export const loginSchema = z.object({
  email: z.email().max(200).transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
  next: z.string().max(300).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(200).transform((e) => e.toLowerCase()),
  password: z.string().min(10).max(200),
  affiliation: z.string().trim().max(200).optional(),
});

export const apiKeySchema = z.object({
  name: z.string().trim().min(2).max(60),
  scopes: z.array(z.enum(["read", "contribute", "verify"])).min(1),
});

/** Only same-site relative paths may be used as post-login redirects. */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
