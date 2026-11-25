import { z } from "zod";
import { composeRetrievalAnswer } from "@/lib/ai/compose";
import { isRussian, parseIntent } from "@/lib/ai/intent";
import { ASSISTANT_SYSTEM_PROMPT, buildUserMessage } from "@/lib/ai/prompts";
import { activeModelName, aiStatus, streamText } from "@/lib/ai/provider";
import { limitOrReject, validationError } from "@/lib/security/request";
import { retrieveForIntent } from "@/server/ai/retrieve";

const bodySchema = z.object({
  question: z.string().trim().min(2).max(1000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(8)
    .default([]),
  locale: z.enum(["en", "ru"]).optional(),
  context: z.object({ region: z.string().max(60).optional(), ecosystemSlug: z.string().max(80).optional() }).default({}),
});

/**
 * POST /api/v1/ai/chat. Streams newline-delimited JSON events:
 *   {"type":"meta", mode, provider, model, intent, sources[]}
 *   {"type":"text", text}  (one or more)
 *   {"type":"notice", message}  (optional, e.g. provider fallback)
 *   {"type":"done"}
 */
export async function POST(request: Request) {
  const limited = await limitOrReject("ai");
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationError(parsed.error);
  const { question, history, context } = parsed.data;
  const locale = parsed.data.locale ?? (isRussian(question) ? "ru" : "en");

  const intent = parseIntent(question, context);
  const retrieval = await retrieveForIntent(intent, question);
  const status = await aiStatus();
  const model = status.enabled ? await activeModelName() : null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      send({
        type: "meta",
        mode: status.enabled ? "generative" : "retrieval",
        provider: status.label || null,
        model,
        intent: intent.kind,
        region: intent.region?.label ?? null,
        sources: retrieval.sources.map(({ excerpt, ...s }) => ({ ...s, excerpt: excerpt.slice(0, 280) })),
      });
      if (!status.enabled || retrieval.sources.length === 0) {
        send({ type: "text", text: composeRetrievalAnswer(retrieval, locale) });
      } else {
        try {
          for await (const delta of streamText({
            system: ASSISTANT_SYSTEM_PROMPT,
            messages: [...history.slice(-4), { role: "user", content: buildUserMessage(question, retrieval.sources, retrieval.gaps) }],
            maxTokens: 1500,
            effort: "low",
            signal: request.signal,
          })) {
            send({ type: "text", text: delta });
          }
        } catch (error) {
          console.error(JSON.stringify({ level: "error", event: "ai.chat.provider_error", message: error instanceof Error ? error.message : String(error) }));
          send({ type: "notice", message: locale === "ru" ? "Языковая модель недоступна; показан ответ, составленный из записей архива." : "The language model is unavailable; showing an answer assembled from archive records." });
          send({ type: "text", text: composeRetrievalAnswer(retrieval, locale) });
        }
      }
      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
