import { describe, expect, it } from "vitest";
import { canViewRecord, can, type Viewer } from "@/lib/access/policy";
import { parseIntent } from "@/lib/ai/intent";
import { suggestMetadata } from "@/lib/ai/heuristics";
import { computeAlert, type AlertInput } from "@/lib/engine/alerts";
import { buildEngineContext, scorePair, type EngineRecord } from "@/lib/engine/connections";
import { computeReputation } from "@/lib/engine/reputation";
import { cosine, fingerprint } from "@/lib/engine/similarity";
import { computeVerification } from "@/lib/engine/verification";
import { findRegion } from "@/lib/geo/regions";
import { imageDimensions, sniffFileType, stripJpegExif } from "@/lib/storage/sniff";
import { buildSearchText, slugify } from "@/lib/text";
import { safeNextPath } from "@/lib/validation/schemas";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const viewer = (over: Partial<Viewer> = {}): Viewer => ({ id: "u1", name: "U", email: "u@x", role: "contributor", isDemo: false, communities: [], ...over });
const rec = (over: Partial<Parameters<typeof canViewRecord>[1]> = {}) => ({ visibility: "public" as const, sensitivity: "none" as const, contributorId: "owner", communityId: "c1", ...over });

describe("access policy", () => {
  it("public records are visible to everyone; sacred ones are narrowed to stewards", () => {
    expect(canViewRecord(null, rec())).toBe(true);
    expect(canViewRecord(null, rec({ sensitivity: "sacred" }))).toBe(false);
    expect(canViewRecord(viewer({ communities: [{ id: "c1", role: "member" }] }), rec({ sensitivity: "sacred" }))).toBe(false);
    expect(canViewRecord(viewer({ communities: [{ id: "c1", role: "steward" }] }), rec({ sensitivity: "sacred" }))).toBe(true);
  });
  it("community records need membership; agents never see them", () => {
    const r = rec({ visibility: "community" });
    expect(canViewRecord(viewer(), r)).toBe(false);
    expect(canViewRecord(viewer({ communities: [{ id: "c1", role: "member" }] }), r)).toBe(true);
    expect(canViewRecord(viewer({ communities: [{ id: "c1", role: "member" }], apiKeyScopes: ["read"] }), r)).toBe(false);
  });
  it("private records are visible only to their contributor and admins", () => {
    const r = rec({ visibility: "private" });
    expect(canViewRecord(viewer({ role: "moderator" }), r)).toBe(false);
    expect(canViewRecord(viewer({ id: "owner" }), r)).toBe(true);
    expect(canViewRecord(viewer({ role: "admin" }), r)).toBe(true);
  });
  it("API key scopes limit permissions", () => {
    expect(can(viewer({ apiKeyScopes: ["read"] }), "record:create")).toBe(false);
    expect(can(viewer({ apiKeyScopes: ["contribute"] }), "record:create")).toBe(true);
    expect(can(viewer(), "review:expert")).toBe(false);
    expect(can(viewer({ role: "expert" }), "edge:review")).toBe(true);
  });
});

describe("verification", () => {
  const d = (n: number) => new Date(2026, 0, n);
  it("needs two community approvals", () => {
    expect(computeVerification([{ decision: "approve", reviewerRole: "community", createdAt: d(1) }])).toBe("unverified");
    expect(computeVerification([1, 2].map((n) => ({ decision: "approve" as const, reviewerRole: "community" as const, createdAt: d(n) })))).toBe("community_verified");
  });
  it("latest expert decision wins", () => {
    expect(computeVerification([{ decision: "dispute", reviewerRole: "community", createdAt: d(1) }, { decision: "approve", reviewerRole: "expert", createdAt: d(2) }])).toBe("expert_verified");
    expect(computeVerification([{ decision: "approve", reviewerRole: "expert", createdAt: d(1) }, { decision: "dispute", reviewerRole: "expert", createdAt: d(2) }])).toBe("disputed");
  });
});

describe("Memory Alert", () => {
  const base: AlertInput = {
    subjectType: "language", id: "x", slug: "x", name: "X", href: "/", lat: null, lng: null, countryCodes: [],
    threat: { score: 1, category: "critically_endangered", source: "UNESCO" },
    documentation: { linkedRecords: 0, verifiedRecords: 0, media: 0, audio: 0, lexicon: 0, observations: 0, sources: 1 },
  };
  it("scores a poorly documented critically endangered language as critical, with reasons", () => {
    const a = computeAlert(base);
    expect(a.score).toBe(100);
    expect(a.level).toBe("critical");
    expect(a.missing).toEqual(expect.arrayContaining(["no_audio", "few_lexicon", "single_source", "no_verified"]));
    expect(a.factors.reduce((s, f) => s + f.points, 0)).toBeCloseTo(a.score, 0);
  });
  it("documentation lowers the score", () => {
    const a = computeAlert({ ...base, documentation: { ...base.documentation, linkedRecords: 10, lexicon: 20, audio: 5, sources: 4, verifiedRecords: 10 } });
    expect(a.score).toBeLessThan(60);
    expect(a.confidence).toBe("high");
  });
});

describe("Connection Engine", () => {
  const r = (over: Partial<EngineRecord>): EngineRecord => ({ id: "a", slug: "a", title: "A", dimension: "historical", countryCode: "UZ", countryCodes: ["UZ"], lat: 39.65, lng: 66.96, periodStart: 1400, periodEnd: 1450, tags: [], languageId: null, ecosystemId: null, speciesId: null, entityIds: [], fingerprint: null, ...over });
  it("explains links with evidence and never claims 'confirmed'", () => {
    const a = r({ id: "a", entityIds: ["e1"] });
    const b = r({ id: "b", entityIds: ["e1"], lat: 39.66, lng: 66.97 });
    const ctx = buildEngineContext([a, b], new Map([["e1", "Samarkand"]]), new Map());
    const s = scorePair(a, b, ctx)!;
    expect(s.score).toBeGreaterThan(0.5);
    expect(s.evidence.some((e) => e.detail.includes("Samarkand"))).toBe(true);
    expect(["probable", "speculative"]).toContain(s.uncertainty);
  });
  it("does not link unrelated records", () => {
    const a = r({ id: "a" });
    const b = r({ id: "b", countryCode: "PE", countryCodes: ["PE"], lat: -13, lng: -72, periodStart: -3000, periodEnd: -2900 });
    expect(scorePair(a, b, buildEngineContext([a, b], new Map(), new Map()))).toBeNull();
  });
  it("lexical fingerprints compare similar text", () => {
    expect(cosine(fingerprint("The Aral Sea is shrinking"), fingerprint("Aral Sea shrinking fast"))).toBeGreaterThan(0.4);
    expect(cosine(fingerprint("Aral Sea"), fingerprint("Tango music of Buenos Aires"))).toBeLessThan(0.3);
  });
});

describe("EARTH AI intent", () => {
  it.each([
    ["What traditions are disappearing in Central Asia?", "traditions", "Central Asia"],
    ["Which languages are considered endangered?", "languages", null],
    ["Show historical photographs of ancient Silk Road cities.", "photographs", "Silk Road countries"],
    ["How did the Aral Sea change over the last century?", "ecosystem_change", null],
    ["Find connections between ancient civilizations.", "connections", null],
    ["Show me cultural traditions that exist in multiple countries.", "multi_country", null],
    ["Какие традиции исчезают в Центральной Азии?", "traditions", "Central Asia"],
    ["Какие языки Сибири находятся под угрозой исчезновения?", "languages", "Siberia"],
    ["Какие виды животных вымерли?", "species", null],
    ["Which species have gone extinct?", "species", null],
    ["Which glaciers are retreating?", "ecosystem_change", null],
  ])("%s", (q, kind, region) => {
    const intent = parseIntent(q);
    expect(intent.kind).toBe(kind);
    expect(intent.region?.label ?? null).toBe(region);
  });
});

describe("utilities", () => {
  it("regions resolve in English and Russian", () => {
    expect(findRegion("средняя азия")?.codes).toEqual(["KZ", "KG", "TJ", "TM", "UZ"]);
  });
  it("slugs and search text handle other scripts and diacritics", () => {
    expect(slugify("Самарканд и Бухара")).toBe("samarkand-i-bukhara");
    expect(buildSearchText("ʻŌlelo Hawaiʻi")).toContain("olelo hawaii");
  });
  it("rule-based suggestions find kind, country and years", () => {
    const s = suggestMetadata("Grandmother's recipe", "My grandmother cooked this dish in Uzbekistan in 1974 and again in 1980 with rice.");
    expect(s.kind).toBe("recipe");
    expect(s.countryCode).toBe("UZ");
    expect([s.periodStart, s.periodEnd]).toEqual([1974, 1980]);
  });
  it("reputation ignores unverified volume", () => {
    expect(computeReputation({ totalContributions: 500, communityVerified: 0, expertVerified: 0, disputed: 0, sourcesCited: 0, reviewsGiven: 0, lexiconVerified: 0, upheldReports: 0 }).score).toBe(0);
    expect(computeReputation({ totalContributions: 2, communityVerified: 1, expertVerified: 1, disputed: 0, sourcesCited: 3, reviewsGiven: 0, lexiconVerified: 0, upheldReports: 0 }).score).toBe(38);
  });
  it("only same-site relative redirects are allowed", () => {
    expect(safeNextPath("/archive")).toBe("/archive");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
  });
  it("passwords hash and verify", async () => {
    const h = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});

describe("upload safety", () => {
  it("identifies files by magic bytes, not names", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0, 0, 0, 0, 200]);
    expect(sniffFileType(png)?.mime).toBe("image/png");
    expect(imageDimensions(png, "image/png")).toEqual({ width: 256, height: 200 });
    expect(sniffFileType(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
  });
  it("strips EXIF from JPEGs", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
    const out = stripJpegExif(jpeg);
    expect(Array.from(out)).toEqual([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9]);
  });
});
