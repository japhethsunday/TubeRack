import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { internalError } from "@/src/server/errors";

/**
 * Object storage adapter for the configured Supabase Storage bucket (private).
 * Paths are always built server-side as <workspace>/<project>/<uuid>-<safe-name>
 * so users can never traverse or guess other tenants' objects. Downloads are
 * served through our API with ownership checks — bucket URLs are never
 * exposed to bypass authorization.
 */

export interface StoragePutResult {
  key: string;
  bytes: number;
}

function safeName(name: string): string {
  const base = name.split("/").pop()?.split("\\").pop() ?? "file";
  const clean = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return clean || "file";
}

export function objectKey(workspaceId: string, projectId: string, filename: string, id: string): string {
  if ([workspaceId, projectId, id].some((p) => !p || p.includes("..") || p.includes("/"))) {
    throw new Error("Invalid storage path components.");
  }
  return `${workspaceId}/${projectId}/${id}-${safeName(filename)}`;
}

export function isStorageConfigured(env = getServerEnv()): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function authHeaders(env: ReturnType<typeof getServerEnv>): Record<string, string> {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
  };
}

function objectUrl(env: ReturnType<typeof getServerEnv>, key: string): string {
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/${encodeURIComponent(env.SUPABASE_BUCKET)}/${path}`;
}

/**
 * Upload bytes to the private Supabase bucket. Throws a generic error on
 * failure so callers can fall back to inline storage with a clear message.
 */
export async function storagePut(key: string, bytes: Uint8Array, mime: string): Promise<StoragePutResult> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) throw new Error("Object storage is not configured.");
  const type = mime || "application/octet-stream";
  let response: Response;
  try {
    response = await fetch(objectUrl(env, key), {
      method: "POST",
      headers: { ...authHeaders(env), "Content-Type": type, "x-upsert": "true" },
      body: new Blob([bytes as unknown as BlobPart], { type }),
    });
  } catch {
    throw new Error("Object storage is unreachable.");
  }
  if (!response.ok) {
    throw new Error(`Object storage rejected the upload (${response.status}).`);
  }
  return { key, bytes: bytes.byteLength };
}

export async function storageGet(key: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) throw new Error("Object storage is not configured.");
  let response: Response;
  try {
    response = await fetch(objectUrl(env, key), { headers: authHeaders(env) });
  } catch {
    throw new Error("Object storage is unreachable.");
  }
  // Supabase answers 400 with "not_found" for missing objects in some versions.
  if (response.status === 404 || response.status === 400) throw new Error("Object not found.");
  if (!response.ok) throw internalError();
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { bytes: buffer, mime: response.headers.get("content-type") ?? "application/octet-stream" };
}

export async function storageDelete(key: string): Promise<void> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) return;
  try {
    await fetch(objectUrl(env, key), { method: "DELETE", headers: authHeaders(env) });
  } catch {
    // Delete is best-effort; the DB row is the source of truth.
  }
}

/** Reachability probe for /system/status: true when the bucket answers with our key. */
export async function storagePing(): Promise<boolean> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) return false;
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${base}/storage/v1/bucket/${encodeURIComponent(env.SUPABASE_BUCKET)}`, {
      headers: authHeaders(env),
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Small-file inline fallback: BYTEA column when storage is unreachable. */
export async function inlineLimit(): Promise<number> {
  return getServerEnv().MEDIA_INLINE_LIMIT;
}

/**
 * Signed direct upload: the browser PUTs bytes straight to Supabase, so
 * large video never passes through a serverless function (4.5 MB cap).
 * The server chooses the key; the token is single-use and short-lived.
 */
export async function storageSignedUpload(key: string): Promise<string> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) throw new Error("Object storage is not configured.");
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${base}/storage/v1/object/upload/sign/${encodeURIComponent(env.SUPABASE_BUCKET)}/${path}`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`Object storage refused the upload link (${response.status}).`);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Object storage returned no upload link.");
  return `${base}/storage/v1${body.url}`;
}

/** Short-lived signed download link (served after an ownership check). */
export async function storageSignedUrl(key: string, expiresIn = 3600, downloadAs?: string): Promise<string> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) throw new Error("Object storage is not configured.");
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${base}/storage/v1/object/sign/${encodeURIComponent(env.SUPABASE_BUCKET)}/${path}`, {
    method: "POST",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (response.status === 404 || response.status === 400) throw new Error("Object not found.");
  if (!response.ok) throw internalError();
  const body = (await response.json()) as { signedURL?: string; signedUrl?: string };
  const signed = body.signedURL ?? body.signedUrl;
  if (!signed) throw internalError();
  const url = `${base}/storage/v1${signed}`;
  // Supabase: &download=<name> sets Content-Disposition: attachment.
  return downloadAs ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(downloadAs)}` : url;
}
