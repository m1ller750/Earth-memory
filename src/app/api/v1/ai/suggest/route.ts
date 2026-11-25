import { NextResponse } from "next/server";
import { z } from "zod";
import { can } from "@/lib/access/policy";
import { suggestMetadata, type MetadataSuggestions } from "@/lib/ai/heuristics";
import { SUGGEST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { aiStatus, completeText } from "@/lib/ai/provider";
import { getViewer } from "@/lib/auth/session";
import { DIMENSIONS, RECORD_KINDS } from "@/lib/db/schema";
import { isCountryCode } from "@/lib/geo/countries";
import { apiError, isSameOrigin, limitOrReject, validationError } from "@/lib/security/request";
import { findPossibleDuplicates } from "@/server/contributions";

const bodySchema = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(20).max(20000), useAi: z.boolean().default(true) });

function sanitize(raw: Record<string, unknown>, fallback: MetadataSuggestions): MetadataSuggestions {
  const year = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > -10000 && v <= new Date().getFullYear() ? v : null);
  return {
    dimension: (DIMENSIONS as readonly string[]).includes(String(raw.dimension)) ? (raw.dimension as MetadataSuggestions["dimension"]) : fallback.dimension,
    kind: (RECORD_KINDS as readonly string[]).includes(String(raw.kind)) ? (raw.kind as MetadataSuggestions["kind"]) : fallback.kind,
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t): t is string => typeof t === "string").map((t) => t.toLowerCase().slice(0, 40)).slice(0, 6) : fallback.tags,
    countryCode: typeof raw.countryCode === "string" && isCountryCode(raw.countryCode) ? raw.countryCode.toUpperCase() : fallback.countryCode,
    periodStart: year(raw.periodStart),
    periodEnd: year(raw.periodEnd),
    summary: typeof raw.summary === "string" ? raw.summary.slice(0, 300) : null,
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning.slice(0, 300) : "",
  };
}

/**
 * POST /api/v1/ai/suggest: metadata suggestions and possible duplicates for a draft.
 * Uses the configured AI provider when available, otherwise transparent rules.
 * Nothing is saved; the contributor reviews every suggestion.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError(403, "forbidden", "Cross-site request rejected.");
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "record:create")) return apiError(401, "unauthorized", "Sign in to use suggestions.");
  const limited = await limitOrReject("ai", viewer.id);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { title, body, useAi } = parsed.data;

  const rules = suggestMetadata(title, body);
  const duplicates = await findPossibleDuplicates({ title, body }, viewer);
  const status = await aiStatus();
  if (!useAi || !status.enabled) {
    return NextResponse.json({ mode: "rules", provider: null, suggestions: rules, duplicates });
  }
  try {
    const { text, model } = await completeText({
      system: SUGGEST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `<<<\nTITLE: ${title}\n\n${body.slice(0, 6000)}\n>>>` }],
      maxTokens: 700,
      effort: "low",
    });
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    const suggestions = json ? sanitize(JSON.parse(json) as Record<string, unknown>, rules) : rules;
    return NextResponse.json({ mode: "ai", provider: `${status.label}${model ? ` · ${model}` : ""}`, suggestions, duplicates });
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "ai.suggest.failed", message: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ mode: "rules", provider: null, suggestions: rules, duplicates, notice: "AI suggestions are unavailable right now; showing rule-based suggestions." });
  }
}
