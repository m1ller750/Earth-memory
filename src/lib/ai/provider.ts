/**
 * AI provider layer.
 *
 * - XAI_API_KEY set       → Grok through xAI's OpenAI-compatible REST API (https://api.x.ai/v1, or XAI_BASE_URL)
 * - OPENROUTER_API_KEY    → OpenRouter (https://openrouter.ai/api/v1), model OPENROUTER_MODEL (default anthropic/claude-haiku-5.5)
 * - ANTHROPIC_API_KEY set → Claude through the official Anthropic SDK
 * - neither               → "retrieval" mode: no text generation; callers fall back to deterministic answers
 *
 * AI_PROVIDER=xai|openrouter|anthropic|none forces a choice when several keys are present.
 * Only public, non-sensitive archive content is ever sent to a provider (see lib/access/policy).
 */

export type AiProviderId = "xai" | "openrouter" | "anthropic" | "none";

export interface AiStatus {
  enabled: boolean;
  provider: AiProviderId;
  label: string;
  model: string | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
  /** Lower effort for short utility tasks (translation, suggestions). */
  effort?: "low" | "medium" | "high";
}

export class AiUnavailableError extends Error {
  constructor(message = "No AI provider is configured.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

const XAI_BASE_URL = (process.env.XAI_BASE_URL ?? "https://api.x.ai/v1").replace(/\/$/, "");
export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";
const XAI_PREFERRED_MODELS = ["grok-4", "grok-4-latest", "grok-4-fast-reasoning", "grok-4-fast", "grok-3", "grok-3-latest", "grok-3-mini"];

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/**
 * Default OpenRouter model: Claude Haiku 5.5 ($0.10 / $0.50 per million input/output tokens, Nov 2026),
 * chosen as the cheapest model from a frontier family that follows grounded-answer instructions
 * (cite numbered sources, refuse to invent), returns clean JSON for metadata suggestions and
 * translates well between English and Russian. Override with OPENROUTER_MODEL.
 */
export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-haiku-5.5";

function selectedProvider(): AiProviderId {
  const forced = process.env.AI_PROVIDER;
  if (forced === "none") return "none";
  if (forced === "xai" && process.env.XAI_API_KEY) return "xai";
  if (forced === "openrouter" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.XAI_API_KEY) return "xai";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

const globalForAi = globalThis as unknown as { __emXaiModel?: Promise<string> };

/** Uses XAI_MODEL when set; otherwise asks the API which Grok models this key can use. */
async function xaiModel(): Promise<string> {
  if (process.env.XAI_MODEL) return process.env.XAI_MODEL;
  globalForAi.__emXaiModel ??= (async () => {
    try {
      const res = await fetch(`${XAI_BASE_URL}/models`, { headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` } });
      if (!res.ok) return XAI_PREFERRED_MODELS[0];
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (body.data ?? []).map((m) => m.id);
      return XAI_PREFERRED_MODELS.find((m) => ids.includes(m)) ?? ids.find((id) => id.startsWith("grok") && !/image|vision|imagine/.test(id)) ?? XAI_PREFERRED_MODELS[0];
    } catch {
      return XAI_PREFERRED_MODELS[0];
    }
  })();
  return globalForAi.__emXaiModel;
}

export async function aiStatus(): Promise<AiStatus> {
  const provider = selectedProvider();
  if (provider === "xai") {
    const model = process.env.XAI_MODEL ?? "grok";
    return { enabled: true, provider, label: `Grok (xAI)`, model };
  }
  if (provider === "openrouter") {
    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    return { enabled: true, provider, label: "OpenRouter", model };
  }
  if (provider === "anthropic") {
    const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_CLAUDE_MODEL;
    return { enabled: true, provider, label: `Claude (${model})`, model };
  }
  return { enabled: false, provider: "none", label: "", model: null };
}

/** Streams generated text. Throws AiUnavailableError when no provider is configured. */
export async function* streamText(options: CompletionOptions): AsyncGenerator<string> {
  const provider = selectedProvider();
  if (provider === "xai") {
    yield* streamXai(options);
  } else if (provider === "openrouter") {
    yield* streamOpenAiCompatible(options, {
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL,
      label: "OpenRouter",
    });
  } else if (provider === "anthropic") {
    yield* streamClaude(options);
  } else {
    throw new AiUnavailableError();
  }
}

export async function completeText(options: CompletionOptions): Promise<{ text: string; model: string; provider: AiProviderId }> {
  let text = "";
  for await (const delta of streamText(options)) text += delta;
  const status = await aiStatus();
  const model = status.provider === "xai" ? await xaiModel() : (status.model ?? "");
  return { text: text.trim(), model, provider: status.provider };
}

export async function activeModelName(): Promise<string | null> {
  const status = await aiStatus();
  if (status.provider === "xai") return xaiModel();
  return status.model;
}

/* ---------------------------------------------------------------- xAI Grok */

async function* streamXai(options: CompletionOptions): AsyncGenerator<string> {
  yield* streamOpenAiCompatible(options, { baseUrl: XAI_BASE_URL, apiKey: process.env.XAI_API_KEY!, model: await xaiModel(), label: "xAI" });
}

/** Any OpenAI-compatible chat-completions endpoint (xAI, OpenRouter, resellers). */
async function* streamOpenAiCompatible(
  options: CompletionOptions,
  target: { baseUrl: string; apiKey: string; model: string; label: string; headers?: Record<string, string> },
): AsyncGenerator<string> {
  const { model } = target;
  const response = await fetch(`${target.baseUrl}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json", ...target.headers },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 2000,
      messages: [{ role: "system", content: options.system }, ...options.messages],
    }),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new AiProviderError(`${target.label} request failed (${response.status}): ${detail.slice(0, 300)}`, response.status);
  }
  yield* parseOpenAiStream(response.body);
}

/** Parses an OpenAI-compatible server-sent event stream into text deltas. */
export async function* parseOpenAiStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string | null } }>; error?: { message?: string } };
          if (chunk.error) throw new AiProviderError(chunk.error.message ?? "Provider error");
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch (error) {
          if (error instanceof AiProviderError) throw error;
          /* ignore keep-alive or partial lines */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ------------------------------------------------------- Anthropic Claude */

async function* streamClaude(options: CompletionOptions): AsyncGenerator<string> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_CLAUDE_MODEL;
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: options.maxTokens ?? 4000,
      system: options.system,
      messages: options.messages,
      output_config: { effort: options.effort ?? "medium" },
      // Server-side fallback re-runs a declined request on a suitable model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { signal: options.signal },
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") yield event.delta.text;
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new AiProviderError("The model declined this request.");
}
