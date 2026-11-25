"use client";

import { Mic, Plus, Square } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { addLexiconEntryAction } from "@/app/actions/lexicon";
import type { ActionState } from "@/app/actions/records";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n/client";

/** Records a pronunciation with the microphone and uploads it as an audio file. */
function PronunciationRecorder({ onUploaded }: { onUploaded: (mediaId: string | null) => void }) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const supported = typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";

  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!supported) return null;

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        setUrl(URL.createObjectURL(blob));
        setUploading(true);
        const form = new FormData();
        form.append("file", new File([blob], `pronunciation.${blob.type.includes("ogg") ? "ogg" : "webm"}`, { type: blob.type }));
        const res = await fetch("/api/v1/media", { method: "POST", body: form });
        setUploading(false);
        if (res.ok) {
          const body = (await res.json()) as { mediaId: string | null };
          onUploaded(body.mediaId);
        } else setError(t.common.error);
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      window.setTimeout(() => rec.state === "recording" && rec.stop(), 15000);
    } catch {
      setError(t.common.error);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!recording ? (
        <Button type="button" variant="secondary" size="sm" onClick={start}>
          <Mic className="h-4 w-4" aria-hidden />
          {t.languages.recordAudio}
        </Button>
      ) : (
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={() => {
            recorder.current?.stop();
            setRecording(false);
          }}
        >
          <Square className="h-4 w-4" aria-hidden />
          {t.languages.stopRecording}
        </Button>
      )}
      {uploading && <span className="text-xs text-mist-400">{t.contribute.uploading}</span>}
      {url && !uploading && <audio controls src={url} className="h-9" />}
      {error && <span className="text-xs text-[#ff8aa0]">{error}</span>}
    </div>
  );
}

export function AddWordForm({ languageId }: { languageId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(addLexiconEntryAction, null);

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        {t.languages.addWord}
      </Button>
    );
  }
  return (
    <form action={action} className="panel-solid space-y-4 p-5" key={state?.ok ? "done" : "form"}>
      <p className="text-sm text-mist-400">{t.languages.addWordHint}</p>
      <input type="hidden" name="languageId" value={languageId} />
      <input type="hidden" name="mediaId" value={mediaId ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.languages.headword} htmlFor="headword">
          <Input id="headword" name="headword" required maxLength={120} />
        </Field>
        <Field label="IPA" htmlFor="transcription" optional={t.common.optional}>
          <Input id="transcription" name="transcription" maxLength={120} />
        </Field>
        <Field label={`${t.languages.gloss} (English)`} htmlFor="glossEn">
          <Input id="glossEn" name="glossEn" required maxLength={300} />
        </Field>
        <Field label={`${t.languages.gloss} (Русский)`} htmlFor="glossRu" optional={t.common.optional}>
          <Input id="glossRu" name="glossRu" maxLength={300} />
        </Field>
        <Field label={t.common.sources} htmlFor="sourceCitation" hint={t.contribute.sourcesHint} className="sm:col-span-2">
          <Input id="sourceCitation" name="sourceCitation" required minLength={3} maxLength={300} />
        </Field>
      </div>
      <PronunciationRecorder onUploaded={setMediaId} />
      {state?.ok && <FormMessage tone="success">{t.review.thanks}</FormMessage>}
      {state?.error && <FormMessage>{state.message ?? (state.error === "auth" ? t.common.signInToContinue : t.errors.validation)}</FormMessage>}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? t.common.loading : t.common.save}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
