import { assertCredits, spendCredits } from "@/src/server/credits";
import { isAdmin } from "@/src/server/admin";
import { featureBlocked } from "@/src/server/admin-ops";
import { headers } from "next/headers";
import { VIDEO_PASS_HEADER, verifyVideoPass } from "@/src/server/video-pass";
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
  /** Part of a generated video already paid for with a video pass: don't charge again. */
  covered?: boolean;
}

async function passCovers(workspaceId: string): Promise<boolean> {
  try {
    return Boolean(verifyVideoPass((await headers()).get(VIDEO_PASS_HEADER), workspaceId));
  } catch {
    return false;
  }
}

export async function guardProviderCall(kind?: string): Promise<ProviderCaller> {
  const user = await requireUser();
  const limit = limiterFor("expensive").take(`expensive:${user.id}`);
  if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
  // Hard cap across all instances: protects Gemini/YouTube quota and cost.
  await sharedLimit(`ai:${user.id}`, 300, 3600);
  const workspaceId = await defaultWorkspace(user);
  await requireMembership(workspaceId, user, "editor");
  const covered = await passCovers(workspaceId);
  if (!isAdmin(user)) {
    // Admin feature switches: a paused tool answers with a friendly message.
    const paused = await featureBlocked(kind);
    if (paused) throw new BackendError("FORBIDDEN", paused);
    if (!covered) await assertCredits(workspaceId, kind);
  }
  return { user, workspaceId, covered };
}

/**
 * YouTube search costs ~100 of the app's 10,000 daily API units, so each
 * user gets a daily budget of searches (shared across all instances).
 */
export async function youtubeSearchBudget(caller: ProviderCaller): Promise<void> {
  await sharedLimit(`yt-search:${caller.user.id}`, 40, 86400);
}

/** Best-effort usage record; never fails the request. */
export async function recordUsage(
  caller: ProviderCaller,
  entry: { kind: string; provider: string; model?: string; status: "completed" | "failed"; ref?: string },
): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (entry.status === "completed" && !caller.covered && !isAdmin(caller.user)) await spendCredits(caller.workspaceId, entry.kind, entry.ref).catch(() => {});
  try {
    await db`
      INSERT INTO usage_events (workspace_id, user_id, kind, units, model, provider, status, ref)
      VALUES (${caller.workspaceId}, ${caller.user.id}, ${entry.kind}, 1, ${entry.model ?? null}, ${entry.provider}, ${entry.status}, ${entry.ref ?? null})
    `;
  } catch (error) {
    console.error("usage record failed:", error instanceof Error ? error.message : String(error));
  }
  // Health watch: a tool that keeps failing pauses itself and alerts the admins.
  if (entry.status === "failed") await import("@/src/server/health").then((h) => h.watchFailure(entry.kind)).catch(() => undefined);
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
