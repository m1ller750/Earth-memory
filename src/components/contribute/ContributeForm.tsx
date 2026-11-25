"use client";

import { Check, FileText, ImageIcon, Loader2, LocateFixed, Mic, Plus, Sparkles, Trash2, UploadCloud, Video, Wand2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { submitContributionAction } from "@/app/actions/contribute";
import { DIMENSION_COLORS } from "@/components/brand/DimensionGlyph";
import { EarthGlobe } from "@/components/globe/EarthGlobe";
import { AiBadge, Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { DIMENSIONS, LICENSES, RECORD_KINDS, SENSITIVITIES, VISIBILITIES, type Dimension, type RecordKind } from "@/lib/db/schema";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

interface UploadItem {
  key: string;
  name: string;
  kind: "image" | "audio" | "video" | "document" | null;
  status: "uploading" | "done" | "error" | "duplicate";
  mediaId: string | null;
  previewUrl: string | null;
  message?: string;
  duplicateOf?: { slug: string; title: string };
}

interface Suggestions {
  dimension: Dimension | null;
  kind: RecordKind | null;
  tags: string[];
  countryCode: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  summary: string | null;
  reasoning: string;
}

const STEPS = ["media", "describe", "place", "sources", "consent"] as const;
type Step = (typeof STEPS)[number];

export function ContributeForm({
  communities,
  countries,
  aiEnabled,
  aiLabel,
  maxUploadMb,
  initialCountry,
  defaultAttribution,
}: {
  communities: Array<{ id: string; name: string }>;
  countries: Array<{ code: string; name: string }>;
  aiEnabled: boolean;
  aiLabel: string;
  maxUploadMb: number;
  initialCountry?: string;
  defaultAttribution: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<Step>("media");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [exifHint, setExifHint] = useState<{ lat?: number; lng?: number; year?: number; label: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [dimension, setDimension] = useState<Dimension>("human");
  const [kind, setKind] = useState<RecordKind>("story");
  const [contentLanguage, setContentLanguage] = useState(locale);
  const [tags, setTags] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [countryCode, setCountryCode] = useState(initialCountry ?? "");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dateLabel, setDateLabel] = useState("");
  const [sources, setSources] = useState<Array<{ citation: string; url: string }>>([]);
  const [visibility, setVisibility] = useState<(typeof VISIBILITIES)[number]>("public");
  const [communityId, setCommunityId] = useState("");
  const [sensitivity, setSensitivity] = useState<(typeof SENSITIVITIES)[number]>("none");
  const [license, setLicense] = useState<(typeof LICENSES)[number]>("CC-BY-4.0");
  const [attribution, setAttribution] = useState(defaultAttribution);
  const [consent, setConsent] = useState(false);

  const [suggestState, setSuggestState] = useState<{ loading: boolean; mode?: string; provider?: string | null; suggestions?: Suggestions; duplicates?: Array<{ slug: string; title: string; similarity: number }>; notice?: string }>({ loading: false });
  const [issues, setIssues] = useState<Array<{ path: string; message: string }>>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const uploading = uploads.some((u) => u.status === "uploading");
  const stepIndex = STEPS.indexOf(step);
  const issueFor = (path: string) => issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message ?? null;

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files).slice(0, 12)) {
      const key = `${file.name}-${file.size}-${Date.now()}`;
      const kindGuess = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : file.type === "application/pdf" ? "document" : null;
      const previewUrl = kindGuess === "image" ? URL.createObjectURL(file) : null;
      setUploads((prev) => [...prev, { key, name: file.name, kind: kindGuess, status: "uploading", mediaId: null, previewUrl }]);
      if (kindGuess === "image") void readExif(file);
      if (file.size > maxUploadMb * 1024 * 1024) {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error", message: format(t.contribute.mediaHint, { max: maxUploadMb }) } : u)));
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/v1/media", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error", message: data?.error?.message ?? t.common.error } : u)));
        } else if (data.duplicate) {
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "duplicate", duplicateOf: data.record } : u)));
        } else {
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "done", mediaId: data.mediaId, kind: data.kind } : u)));
        }
      } catch {
        setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error", message: t.common.error } : u)));
      }
    }
  }

  async function readExif(file: File) {
    try {
      const exifr = (await import("exifr")).default;
      const [gps, meta] = await Promise.all([exifr.gps(file).catch(() => null), exifr.parse(file, ["DateTimeOriginal"]).catch(() => null)]);
      const date: Date | undefined = meta?.DateTimeOriginal instanceof Date ? meta.DateTimeOriginal : undefined;
      if (gps?.latitude != null || date) {
        const parts = [gps?.latitude != null ? `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}` : null, date ? date.toISOString().slice(0, 10) : null].filter(Boolean);
        setExifHint({ lat: gps?.latitude, lng: gps?.longitude, year: date?.getFullYear(), label: parts.join(" · ") });
      }
    } catch {
      /* no EXIF */
    }
  }

  async function requestSuggestions() {
    if (title.trim().length < 3 || body.trim().length < 20) return;
    setSuggestState({ loading: true });
    try {
      const res = await fetch("/api/v1/ai/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, useAi: aiEnabled }) });
      const data = await res.json();
      setSuggestState({ loading: false, mode: data.mode, provider: data.provider, suggestions: data.suggestions, duplicates: data.duplicates, notice: data.notice });
    } catch {
      setSuggestState({ loading: false, notice: t.common.error });
    }
  }

  const payload = useMemo(
    () => ({
      title,
      summary,
      body,
      dimension,
      kind,
      contentLanguage,
      tags: tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      placeName: placeName || undefined,
      countryCode: countryCode || undefined,
      lat: lat === "" ? undefined : Number(lat),
      lng: lng === "" ? undefined : Number(lng),
      periodStart: periodStart === "" ? undefined : Number(periodStart.replace("−", "-")),
      periodEnd: periodEnd === "" ? undefined : Number(periodEnd.replace("−", "-")),
      dateLabel: dateLabel || undefined,
      visibility,
      sensitivity,
      license,
      attribution,
      communityId: communityId || undefined,
      sources: sources.filter((s) => s.citation.trim()).map((s) => ({ citation: s.citation.trim(), url: s.url.trim() || undefined })),
      mediaIds: uploads.filter((u) => u.status === "done" && u.mediaId).map((u) => u.mediaId!),
      consent,
    }),
    [title, summary, body, dimension, kind, contentLanguage, tags, placeName, countryCode, lat, lng, periodStart, periodEnd, dateLabel, visibility, sensitivity, license, attribution, communityId, sources, uploads, consent],
  );

  function submit() {
    setServerError(null);
    setIssues([]);
    startSubmit(async () => {
      const result = await submitContributionAction(payload);
      if (result.ok) {
        router.push(`/archive/${result.slug}?created=1`);
        return;
      }
      if (result.error === "validation" && result.issues) {
        setIssues(result.issues);
        const first = result.issues[0]?.path.split(".")[0] ?? "";
        const stepOf: Record<string, Step> = { title: "describe", summary: "describe", body: "describe", dimension: "describe", kind: "describe", tags: "describe", contentLanguage: "describe", placeName: "place", countryCode: "place", lat: "place", lng: "place", periodStart: "place", periodEnd: "place", dateLabel: "place", sources: "sources" };
        setStep(stepOf[first] ?? "consent");
      } else {
        setServerError(result.error === "auth" ? t.common.signInToContinue : result.error === "rate_limited" ? t.errors.rateLimited : (result.message ?? t.common.error));
      }
    });
  }

  const stepLabels: Record<Step, string> = { media: t.contribute.stepMedia, describe: t.contribute.stepDescribe, place: t.contribute.stepPlace, sources: t.contribute.stepSources, consent: t.contribute.stepConsent };
  const markerPoints = lat !== "" && lng !== "" && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng)) ? [{ id: "draft", layer: "record" as const, lat: Number(lat), lng: Number(lng), title: title || "…", subtitle: placeName, href: "#", color: DIMENSION_COLORS[dimension] }] : [];

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Steps" className="lg:sticky lg:top-24 lg:self-start">
        <ol className="flex gap-2 overflow-x-auto lg:flex-col">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => setStep(s)}
                aria-current={s === step ? "step" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm whitespace-nowrap transition",
                  s === step ? "bg-white/[0.08] text-mist-50" : "text-mist-400 hover:text-mist-100",
                )}
              >
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border font-mono text-[11px]", i < stepIndex ? "border-aurora-emerald bg-aurora-emerald/15 text-aurora-emerald" : s === step ? "border-aurora-cyan text-aurora-cyan" : "border-white/15")}>
                  {i < stepIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {stepLabels[s]}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="panel min-w-0 p-5 sm:p-8">
        {step === "media" && (
          <section className="space-y-5">
            <h2 className="font-display text-3xl font-semibold text-mist-50">{t.contribute.mediaTitle}</h2>
            <p className="text-sm text-mist-400">{format(t.contribute.mediaHint, { max: maxUploadMb })}</p>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void handleFiles(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-12 text-center"
            >
              <UploadCloud className="h-10 w-10 text-mist-400" aria-hidden />
              <button type="button" onClick={() => fileInput.current?.click()} className="mt-4 rounded-xl border border-white/15 px-4 py-2 text-sm text-mist-100 hover:border-white/30">
                {t.contribute.dropFiles}
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,audio/*,video/mp4,video/webm,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {exifHint && (
              <FormMessage tone="info">
                {format(t.contribute.exifFound, { details: exifHint.label })}{" "}
                <button
                  type="button"
                  className="ml-2 text-aurora-cyan underline"
                  onClick={() => {
                    if (exifHint.lat != null && exifHint.lng != null) {
                      setLat(exifHint.lat.toFixed(5));
                      setLng(exifHint.lng.toFixed(5));
                    }
                    if (exifHint.year) {
                      setPeriodStart(String(exifHint.year));
                      setPeriodEnd(String(exifHint.year));
                    }
                    setExifHint(null);
                  }}
                >
                  {t.common.apply}
                </button>
              </FormMessage>
            )}
            {uploads.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {uploads.map((u) => (
                  <li key={u.key} className="panel-solid flex items-center gap-3 p-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-900">
                      {u.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : u.kind === "audio" ? (
                        <Mic className="h-5 w-5 text-mist-400" />
                      ) : u.kind === "video" ? (
                        <Video className="h-5 w-5 text-mist-400" />
                      ) : u.kind === "document" ? (
                        <FileText className="h-5 w-5 text-mist-400" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-mist-400" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate text-mist-100">{u.name}</span>
                      <span className="block text-xs text-mist-400">
                        {u.status === "uploading" && t.contribute.uploading}
                        {u.status === "done" && "✓"}
                        {u.status === "error" && <span className="text-[#ff8aa0]">{u.message}</span>}
                        {u.status === "duplicate" && u.duplicateOf && (
                          <>
                            {t.contribute.duplicateFile}{" "}
                            <Link href={`/archive/${u.duplicateOf.slug}`} className="text-aurora-cyan underline" target="_blank">
                              {u.duplicateOf.title}
                            </Link>
                          </>
                        )}
                      </span>
                    </span>
                    {u.status === "uploading" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-mist-400" />
                    ) : (
                      <button type="button" onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))} className="text-mist-500 hover:text-mist-100" aria-label={t.common.cancel}>
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step === "describe" && (
          <section className="space-y-5">
            <Field label={t.contribute.titleLabel} htmlFor="c-title" error={issueFor("title")}>
              <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={Boolean(issueFor("title"))} />
            </Field>
            <Field label={t.contribute.summaryLabel} htmlFor="c-summary" optional={t.common.optional} error={issueFor("summary")}>
              <Input id="c-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={400} />
            </Field>
            <Field label={t.contribute.bodyLabel} htmlFor="c-body" error={issueFor("body")}>
              <Textarea id="c-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t.contribute.bodyPlaceholder} className="min-h-56" maxLength={20000} aria-invalid={Boolean(issueFor("body"))} />
            </Field>

            <div className="ai-surface rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-mist-50">
                    <Sparkles className="h-4 w-4 text-ai" aria-hidden />
                    {t.contribute.aiAssist}
                  </p>
                  <p className="mt-1 text-xs text-mist-400">{aiEnabled ? `${t.contribute.aiAssistHint} (${aiLabel})` : t.contribute.aiUnavailable}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={requestSuggestions} disabled={suggestState.loading || title.trim().length < 3 || body.trim().length < 20}>
                  {suggestState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
                  {suggestState.loading ? t.common.loading : t.common.apply}
                </Button>
              </div>
              {suggestState.suggestions && (
                <div className="mt-4 space-y-2 border-t border-ai/20 pt-4 text-sm">
                  <AiBadge label={suggestState.mode === "ai" ? `${t.ai.interpretation} · ${suggestState.provider}` : "Rule-based"} />
                  {suggestState.notice && <p className="text-xs text-risk-elevated">{suggestState.notice}</p>}
                  <p className="text-xs text-mist-400">{suggestState.suggestions.reasoning}</p>
                  <ul className="flex flex-wrap gap-2">
                    {suggestState.suggestions.dimension && (
                      <li>
                        <button type="button" onClick={() => setDimension(suggestState.suggestions!.dimension!)} className="rounded-full border border-ai/40 px-3 py-1 text-xs text-mist-100 hover:bg-ai/10">
                          + {t.dimensions[suggestState.suggestions.dimension]}
                        </button>
                      </li>
                    )}
                    {suggestState.suggestions.kind && (
                      <li>
                        <button type="button" onClick={() => setKind(suggestState.suggestions!.kind!)} className="rounded-full border border-ai/40 px-3 py-1 text-xs text-mist-100 hover:bg-ai/10">
                          + {t.kinds[suggestState.suggestions.kind]}
                        </button>
                      </li>
                    )}
                    {suggestState.suggestions.countryCode && (
                      <li>
                        <button type="button" onClick={() => setCountryCode(suggestState.suggestions!.countryCode!)} className="rounded-full border border-ai/40 px-3 py-1 text-xs text-mist-100 hover:bg-ai/10">
                          + {countries.find((c) => c.code === suggestState.suggestions!.countryCode)?.name ?? suggestState.suggestions.countryCode}
                        </button>
                      </li>
                    )}
                    {suggestState.suggestions.periodStart != null && (
                      <li>
                        <button
                          type="button"
                          onClick={() => {
                            setPeriodStart(String(suggestState.suggestions!.periodStart));
                            setPeriodEnd(String(suggestState.suggestions!.periodEnd ?? suggestState.suggestions!.periodStart));
                          }}
                          className="rounded-full border border-ai/40 px-3 py-1 text-xs text-mist-100 hover:bg-ai/10"
                        >
                          + {suggestState.suggestions.periodStart}
                          {suggestState.suggestions.periodEnd && suggestState.suggestions.periodEnd !== suggestState.suggestions.periodStart ? `–${suggestState.suggestions.periodEnd}` : ""}
                        </button>
                      </li>
                    )}
                    {suggestState.suggestions.tags.length > 0 && (
                      <li>
                        <button type="button" onClick={() => setTags(suggestState.suggestions!.tags.join(", "))} className="rounded-full border border-ai/40 px-3 py-1 text-xs text-mist-100 hover:bg-ai/10">
                          + {suggestState.suggestions.tags.join(", ")}
                        </button>
                      </li>
                    )}
                    {suggestState.suggestions.summary && !summary && (
                      <li>
                        <button type="button" onClick={() => setSummary(suggestState.suggestions!.summary!)} className="rounded-full border border-ai/40 px-3 py-1 text-left text-xs text-mist-100 hover:bg-ai/10">
                          + {t.contribute.summaryLabel}
                        </button>
                      </li>
                    )}
                  </ul>
                  <div className="pt-2">
                    <p className="text-xs font-semibold text-mist-300">{t.contribute.duplicates}</p>
                    {suggestState.duplicates?.length ? (
                      <ul className="mt-1 space-y-1">
                        {suggestState.duplicates.map((d) => (
                          <li key={d.slug} className="text-xs">
                            <Link href={`/archive/${d.slug}`} target="_blank" className="text-aurora-cyan underline">
                              {d.title}
                            </Link>{" "}
                            <span className="text-mist-500">({d.similarity.toFixed(2)})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-mist-500">{t.contribute.duplicatesNone}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.contribute.dimensionLabel} htmlFor="c-dimension">
                <Select id="c-dimension" value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}>
                  {DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      {t.dimensions[d]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.contribute.kindLabel} htmlFor="c-kind">
                <Select id="c-kind" value={kind} onChange={(e) => setKind(e.target.value as RecordKind)}>
                  {RECORD_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.contribute.contentLanguageLabel} htmlFor="c-lang" hint="ISO code, e.g. en, ru, uz, kk" error={issueFor("contentLanguage")}>
                <Input id="c-lang" value={contentLanguage} onChange={(e) => setContentLanguage(e.target.value.toLowerCase() as typeof contentLanguage)} maxLength={12} />
              </Field>
              <Field label={t.contribute.tagsLabel} htmlFor="c-tags" optional={t.common.optional}>
                <Input id="c-tags" value={tags} onChange={(e) => setTags(e.target.value)} maxLength={300} />
              </Field>
            </div>
          </section>
        )}

        {step === "place" && (
          <section className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.contribute.placeLabel} htmlFor="c-place" optional={t.common.optional}>
                <Input id="c-place" value={placeName} onChange={(e) => setPlaceName(e.target.value)} maxLength={200} />
              </Field>
              <Field label={t.contribute.countryLabel} htmlFor="c-country" optional={t.common.optional} error={issueFor("countryCode")}>
                <Select id="c-country" value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                  <option value="">—</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="relative h-72 overflow-hidden rounded-2xl border border-white/10">
              <EarthGlobe className="absolute inset-0" points={markerPoints} autoRotate={false} initialView={{ lat: 35, lng: 60, altitude: 2.2 }} onGlobeClick={({ lat: a, lng: b }) => {
                setLat(a.toFixed(5));
                setLng(b.toFixed(5));
              }} loadingLabel={t.common.loading} />
              <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-ink-950/80 px-3 py-1 text-xs text-mist-300">{t.contribute.pickOnMap}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <Field label={t.contribute.latLabel} htmlFor="c-lat" error={issueFor("lat")}>
                <Input id="c-lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
              </Field>
              <Field label={t.contribute.lngLabel} htmlFor="c-lng" error={issueFor("lng")}>
                <Input id="c-lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} />
              </Field>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigator.geolocation?.getCurrentPosition((pos) => {
                    setLat(pos.coords.latitude.toFixed(5));
                    setLng(pos.coords.longitude.toFixed(5));
                  })
                }
              >
                <LocateFixed className="h-4 w-4" aria-hidden />
                {t.contribute.useMyLocation}
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.contribute.periodStartLabel} htmlFor="c-from" hint={t.contribute.periodHint} error={issueFor("periodStart")}>
                <Input id="c-from" inputMode="numeric" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </Field>
              <Field label={t.contribute.periodEndLabel} htmlFor="c-to" error={issueFor("periodEnd")}>
                <Input id="c-to" inputMode="numeric" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Field>
              <Field label={t.contribute.dateLabel} htmlFor="c-datelabel" optional={t.common.optional}>
                <Input id="c-datelabel" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} placeholder={t.contribute.datePlaceholder} maxLength={120} />
              </Field>
            </div>
          </section>
        )}

        {step === "sources" && (
          <section className="space-y-5">
            <h2 className="font-display text-3xl font-semibold text-mist-50">{t.contribute.sourcesTitle}</h2>
            <p className="text-sm text-mist-400">{t.contribute.sourcesHint}</p>
            {sources.map((s, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Field label={t.contribute.citation} htmlFor={`src-${i}`} error={issueFor(`sources.${i}`)}>
                  <Input id={`src-${i}`} value={s.citation} onChange={(e) => setSources((prev) => prev.map((x, j) => (j === i ? { ...x, citation: e.target.value } : x)))} maxLength={500} />
                </Field>
                <Field label={t.contribute.url} htmlFor={`url-${i}`}>
                  <Input id={`url-${i}`} type="url" value={s.url} onChange={(e) => setSources((prev) => prev.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} maxLength={1000} placeholder="https://" />
                </Field>
                <Button type="button" variant="ghost" onClick={() => setSources((prev) => prev.filter((_, j) => j !== i))} aria-label={t.common.cancel}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setSources((prev) => [...prev, { citation: "", url: "" }])} disabled={sources.length >= 20}>
              <Plus className="h-4 w-4" aria-hidden />
              {t.contribute.addSource}
            </Button>
          </section>
        )}

        {step === "consent" && (
          <section className="space-y-5">
            <h2 className="font-display text-3xl font-semibold text-mist-50">{t.contribute.consentTitle}</h2>
            <p className="text-sm text-mist-400">{t.contribute.consentHint}</p>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-mist-100">{t.contribute.visibilityLabel}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {VISIBILITIES.map((v) => {
                  const needsCommunity = v === "community" || v === "restricted";
                  const disabled = needsCommunity && communities.length === 0;
                  return (
                    <label key={v} className={cn("cursor-pointer rounded-xl border p-3 text-sm transition", visibility === v ? "border-aurora-cyan/60 bg-aurora-cyan/10" : "border-white/10 hover:border-white/25", disabled && "cursor-not-allowed opacity-40")}>
                      <input type="radio" name="visibility" value={v} checked={visibility === v} disabled={disabled} onChange={() => setVisibility(v)} className="sr-only" />
                      <span className="block font-medium text-mist-50">{t.visibility[v]}</span>
                      <span className="block text-xs text-mist-400">{t.visibilityHelp[v]}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {(visibility === "community" || visibility === "restricted") && (
              <Field label={t.contribute.communityLabel} htmlFor="c-community" error={issueFor("communityId")}>
                <Select id="c-community" value={communityId} onChange={(e) => setCommunityId(e.target.value)}>
                  <option value="">—</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.contribute.sensitivityLabel} htmlFor="c-sensitivity">
                <Select id="c-sensitivity" value={sensitivity} onChange={(e) => setSensitivity(e.target.value as typeof sensitivity)}>
                  {SENSITIVITIES.map((s) => (
                    <option key={s} value={s}>
                      {t.sensitivity[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.contribute.licenseLabel} htmlFor="c-license">
                <Select id="c-license" value={license} onChange={(e) => setLicense(e.target.value as typeof license)}>
                  {LICENSES.map((l) => (
                    <option key={l} value={l}>
                      {t.licenses[l]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {sensitivity === "sacred" && <FormMessage tone="info">{t.contribute.sacredWarning}</FormMessage>}
            <Field label={t.contribute.attributionLabel} htmlFor="c-attribution">
              <Input id="c-attribution" value={attribution} onChange={(e) => setAttribution(e.target.value)} maxLength={200} />
            </Field>
            <Checkbox label={t.contribute.consentCheck} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            {issueFor("consent") && <FormMessage>{issueFor("consent")}</FormMessage>}
            {issues.length > 0 && <FormMessage>{t.errors.validation}</FormMessage>}
            {serverError && <FormMessage>{serverError}</FormMessage>}
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5">
              <Badge tone="slate">{t.verification.unverified}</Badge>
              <span className="text-xs text-mist-400">{t.contribute.successHint}</span>
            </div>
            <Button type="button" variant="primary" size="lg" onClick={submit} disabled={submitting || uploading || !consent}>
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              {submitting ? t.contribute.publishing : t.contribute.publish}
            </Button>
          </section>
        )}

        <div className="mt-8 flex justify-between border-t border-white/[0.06] pt-5">
          <Button type="button" variant="ghost" onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)])} disabled={stepIndex === 0}>
            ← {t.common.previous}
          </Button>
          {stepIndex < STEPS.length - 1 && (
            <Button type="button" variant="secondary" onClick={() => setStep(STEPS[stepIndex + 1])}>
              {t.common.continue} →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
