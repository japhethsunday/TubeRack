import { getDb } from "@/src/server/db";
import { sharedLimit } from "@/src/server/shared-limit";
import { requireUser, type SessionUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { BackendError, backendUnavailable, rateLimited } from "@/src/server/errors";
import { limiterFor } from "@/src/server/rate-limit";
import { ProviderNotConfiguredError } from "@/src/lib/ai-gateway/types";
import { IntelligenceNotConfiguredError } from "@/src/lib/ai-gateway/intelligence";

/**
 * Shared gate for paid provider routes (Gemini, YouTube search):
 * signed-in editor only, metered per user on the `expensive` class, and
 * every call recorded in usage_events. Anonymous visitors keep the local
 * analyzers — provider quota is never exposed to the open internet.
 */

export interface ProviderCaller {
  user: SessionUser;
  workspaceId: string;
}

export async function guardProviderCall(): Promise<ProviderCaller> {
  const user = await requireUser();
  const limit = limiterFor("expensive").take(`expensive:${user.id}`);
  if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
  // Hard cap across all instances: protects Gemini/YouTube quota and cost.
  await sharedLimit(`ai:${user.id}`, 300, 3600);
  const workspaceId = await defaultWorkspace(user);
  await requireMembership(workspaceId, user, "editor");
  return { user, workspaceId };
}

/** Best-effort usage record; never fails the request. */
export async function recordUsage(
  caller: ProviderCaller,
  entry: { kind: string; provider: string; model?: string; status: "completed" | "failed"; ref?: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db`
      INSERT INTO usage_events (workspace_id, user_id, kind, units, model, provider, status, ref)
      VALUES (${caller.workspaceId}, ${caller.user.id}, ${entry.kind}, 1, ${entry.model ?? null}, ${entry.provider}, ${entry.status}, ${entry.ref ?? null})
    `;
  } catch (error) {
    console.error("usage record failed:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Map provider failures to API errors. "Not configured" becomes
 * BACKEND_UNAVAILABLE so clients fall back to local analysis; other
 * provider messages are already sanitized (no keys/URLs) and are surfaced.
 */
export function providerFailure(error: unknown, what: string): BackendError {
  if (error instanceof BackendError) return error;
  if (error instanceof ProviderNotConfiguredError || error instanceof IntelligenceNotConfiguredError) {
    return backendUnavailable(what);
  }
  const message = error instanceof Error ? error.message : String(error);
  return new BackendError("INTERNAL_ERROR", message.slice(0, 300));
}

/**
 * Persist provider output to the private bucket under a workspace and
 * return an app URL (served with an ownership check). Returns null when
 * storage is not configured so callers can inline.
 */
export async function storeBytes(
  workspaceId: string,
  bytes: Uint8Array,
  mime: string,
  ext: GeneratedExt,
): Promise<string | null> {
  const { isStorageConfigured, storagePut, objectKey } = await import("@/src/server/storage");
  if (!isStorageConfigured()) return null;
  const id = crypto.randomUUID();
  const key = objectKey(workspaceId, "generated", `output.${ext}`, id);
  await storagePut(key, bytes, mime);
  return `/api/v1/generated/${key.split("/").pop()}`;
}

export type GeneratedExt = "png" | "jpg" | "webp" | "wav" | "mp3" | "mp4" | "webm" | "srt" | "vtt";

export function extForMime(mime: string): GeneratedExt {
  const m = mime.toLowerCase();
  if (m.includes("jpeg")) return "jpg";
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  return "wav";
}

export async function storeGenerated(
  caller: ProviderCaller,
  bytes: Uint8Array,
  mime: string,
  ext: GeneratedExt,
): Promise<string | null> {
  return storeBytes(caller.workspaceId, bytes, mime, ext);
}
