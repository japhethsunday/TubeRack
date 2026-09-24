import { extractJsonObject } from "@/src/lib/ai-gateway/json";

/**
 * Shared client for OpenAI-compatible chat APIs (NVIDIA, Mistral).
 * Tries each model in order until one answers; busy, rate-limited, missing
 * or refused models are skipped. Keys never leave the server.
 */
export interface ChatProvider {
  name: string;
  baseUrl: string;
  key: string;
  models: string[];
}

const catalogs = new Map<string, { ids: Set<string>; at: number }>();

/** Live model ids (cached for an hour). Null when the list can't be read — then every configured model is tried. */
async function liveModels(p: ChatProvider): Promise<Set<string> | null> {
  const hit = catalogs.get(p.baseUrl + p.key.slice(-6));
  if (hit && Date.now() - hit.at < 3_600_000) return hit.ids;
  try {
    const res = await fetch(`${p.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${p.key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    const ids = new Set(
      (body.data ?? []).map((m) => String(m.id ?? "")).filter(Boolean),
    );
    if (ids.size === 0) return null;
    catalogs.set(p.baseUrl + p.key.slice(-6), { ids, at: Date.now() });
    return ids;
  } catch {
    return null;
  }
}

/** Reasoning models wrap their thinking in <think>…</think>; keep only the answer. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

/** Configured models that the provider currently serves, in preferred order. */
export async function modelOrder(p: ChatProvider): Promise<string[]> {
  const live = await liveModels(p);
  const available = live ? p.models.filter((m) => live.has(m)) : p.models;
  return available.length ? available : p.models;
}

export async function chatGenerateText(
  p: ChatProvider,
  request: { prompt: string; maxTokens?: number; json?: boolean },
  opts: { budgetMs?: number; attemptMs?: number } = {},
): Promise<{ text: string; model: string }> {
  const deadline = Date.now() + (opts.budgetMs ?? 150_000);
  const requested =
    typeof request.maxTokens === "number" && Number.isFinite(request.maxTokens)
      ? Math.floor(request.maxTokens)
      : 2048;
  const maxTokens = request.json
    ? Math.min(16384, Math.max(4096, requested * 2))
    : Math.min(8192, Math.max(256, requested));
  const prompt = request.json
    ? `${request.prompt}\n\nReply with valid JSON only — no prose, no code fences.`
    : request.prompt;
  let lastError: unknown = null;
  for (const model of await modelOrder(p)) {
    // Free tiers allow about one request per second: on 429, wait and retry the same model.
    for (let attempt = 0; attempt < 3; attempt++) {
      const left = deadline - Date.now();
      if (left < 5_000) break;
      try {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${p.key}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: maxTokens,
            temperature: request.json ? 0.4 : 0.7,
            stream: false,
          }),
          signal: AbortSignal.timeout(Math.min(opts.attemptMs ?? 70_000, left)),
        });
        if (!res.ok) {
          lastError = new Error(
            `${p.name} ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`,
          );
          if (res.status === 429 && attempt < 2) {
            const after = Number(res.headers.get("retry-after"));
            await new Promise((r) =>
              setTimeout(
                r,
                Number.isFinite(after) && after > 0
                  ? Math.min(after * 1000, 8_000)
                  : 1_500 * (attempt + 1),
              ),
            );
            continue;
          }
          break;
        }
        const body = (await res.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const raw = body.choices?.[0]?.message?.content;
        // Some APIs return content as parts: [{type:"text", text:"…"}].
        const content = Array.isArray(raw)
          ? raw.map((c) => (c as { text?: string })?.text ?? "").join("")
          : String(raw ?? "");
        const text = stripThinking(content);
        if (!text) {
          lastError = new Error(`${p.name} ${model}: empty response`);
          break;
        }
        if (request.json && !extractJsonObject(text)) {
          lastError = new Error(`${p.name} ${model}: reply was not valid JSON`);
          break;
        }
        return { text, model };
      } catch (error) {
        lastError = error;
        break;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`No ${p.name} model could answer.`);
}
