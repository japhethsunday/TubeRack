import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { internalError } from "@/src/server/errors";
import { isR2Active, isR2Configured, strictUploadsOn, r2DeleteMany, r2Exists, r2Get, r2List, r2Ping, r2Presign, r2Put } from "@/src/server/r2";

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

/** Supabase Storage (the original store, kept as fallback for older files). */
function supaConfigured(env = getServerEnv()): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Any file storage available: Cloudflare R2 (new files) or Supabase Storage. */
export function isStorageConfigured(env = getServerEnv()): boolean {
  return isR2Configured() || supaConfigured(env);
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
  if (await isR2Active()) {
    await r2Put(key, bytes, mime);
    locationCache.set(key, "r2");
    return { key, bytes: bytes.byteLength };
  }
  const env = getServerEnv();
  if (!supaConfigured(env)) throw new Error("Object storage is not configured.");
  const type = mime || "application/octet-stream";
  let response: Response;
  try {
    response = await fetch(objectUrl(env, key), {
      method: "POST",
      // Stored files never change (unique names): let browsers keep them.
      headers: { ...authHeaders(env), "Content-Type": type, "x-upsert": "true", "cache-control": "max-age=31536000" },
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
  if (isR2Configured()) {
    const hit = await r2Get(key);
    if (hit) return hit;
  }
  const env = getServerEnv();
  if (!supaConfigured(env)) throw new Error("Object not found.");
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
  if (isR2Configured()) await r2DeleteMany([key]).catch(() => undefined);
  locationCache.delete(key);
  const env = getServerEnv();
  if (!supaConfigured(env)) return;
  try {
    await fetch(objectUrl(env, key), { method: "DELETE", headers: authHeaders(env) });
  } catch {
    // Delete is best-effort; the DB row is the source of truth.
  }
}

/** Reachability probe for /system/status: true when the bucket answers with our key. */
export async function storagePing(): Promise<boolean> {
  if (await isR2Active()) return r2Ping();
  const env = getServerEnv();
  if (!supaConfigured(env)) return false;
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
export async function storageSignedUpload(key: string, pin?: { mime: string; size: number }): Promise<string> {
  if (await isR2Active()) {
    locationCache.set(key, "r2");
    // Pin the size and type so a link can't be reused for a bigger or different file.
    const headers: Record<string, string> = pin && (await strictUploadsOn()) ? { "content-type": pin.mime, "content-length": String(pin.size) } : {};
    return r2Presign("PUT", key, 3600, {}, headers);
  }
  const env = getServerEnv();
  if (!supaConfigured(env)) throw new Error("Object storage is not configured.");
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
/**
 * Signed links are reused while they stay valid: the same URL each time lets
 * the browser use its cached copy instead of downloading the file again.
 */
const signedCache = new Map<string, { url: string; until: number }>();
/** Where each file lives (new files: R2; older ones may still be on Supabase). */
const locationCache = new Map<string, "r2" | "supabase">();

async function locate(key: string): Promise<"r2" | "supabase"> {
  if (!isR2Configured()) return "supabase";
  const known = locationCache.get(key);
  if (known) return known;
  const where = (await r2Exists(key).catch(() => false)) ? "r2" : supaConfigured() ? "supabase" : "r2";
  if (locationCache.size > 20000) locationCache.clear();
  locationCache.set(key, where);
  return where;
}

export async function storageSignedUrl(key: string, expiresIn = 3600, downloadAs?: string): Promise<string> {
  const cacheKey = `${key}|${downloadAs ?? ""}`;
  const hit = signedCache.get(cacheKey);
  if (hit && hit.until > Date.now() + 10 * 60_000) return hit.url;
  const url = await signFresh(key, expiresIn, downloadAs);
  if (signedCache.size > 5000) signedCache.clear();
  signedCache.set(cacheKey, { url, until: Date.now() + expiresIn * 1000 });
  return url;
}

async function signFresh(key: string, expiresIn: number, downloadAs?: string): Promise<string> {
  if ((await locate(key)) === "r2") {
    const extra: Record<string, string> = downloadAs ? { "response-content-disposition": `attachment; filename="${downloadAs.replace(/"/g, "")}"` } : {};
    return r2Presign("GET", key, expiresIn, extra);
  }
  const env = getServerEnv();
  if (!supaConfigured(env)) throw new Error("Object storage is not configured.");
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

export interface StoredObject { name: string; size: number; createdAt: string }

/** List the files directly under a folder (e.g. "<workspace>/generated/"), all pages. */
export async function storageList(prefix: string): Promise<StoredObject[]> {
  return (await storageListAll(prefix)).files;
}

/** Files and sub-folders directly under a folder. */
export async function storageListAll(prefix: string, search?: string): Promise<{ files: StoredObject[]; folders: string[] }> {
  const empty = { files: [] as StoredObject[], folders: [] as string[] };
  const parts = await Promise.all([isR2Configured() ? r2List(prefix, search) : empty, supaConfigured() ? supaListAll(prefix, search) : empty]);
  const seen = new Set<string>();
  const files = [...parts[0].files, ...parts[1].files].filter((f) => (seen.has(f.name) ? false : (seen.add(f.name), true)));
  return { files, folders: [...new Set([...parts[0].folders, ...parts[1].folders])] };
}

/** Files and folders in Supabase Storage only (used by the move to R2). */
export async function supaListAll(prefix: string, search?: string): Promise<{ files: StoredObject[]; folders: string[] }> {
  const env = getServerEnv();
  if (!supaConfigured(env)) return { files: [], folders: [] };
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const out: StoredObject[] = [];
  const folders: string[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const res = await fetch(`${base}/storage/v1/object/list/${encodeURIComponent(env.SUPABASE_BUCKET)}`, {
      method: "POST",
      headers: { ...authHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" }, ...(search ? { search } : {}) }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`storage list failed (${res.status})`);
    const rows = (await res.json()) as { name: string; id: string | null; created_at?: string; metadata?: { size?: number } | null }[];
    for (const r of rows) {
      if (r.id) out.push({ name: r.name, size: Number(r.metadata?.size ?? 0), createdAt: r.created_at ?? "" });
      else folders.push(r.name);
    }
    if (rows.length < 1000) break;
  }
  return { files: out, folders };
}

/** Delete many files in one call (full keys). */
export async function storageDeleteMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  if (isR2Configured()) await r2DeleteMany(keys);
  for (const k of keys) locationCache.delete(k);
  await supaDeleteMany(keys);
}

/** Delete from Supabase Storage only. */
export async function supaDeleteMany(keys: string[]): Promise<void> {
  const env = getServerEnv();
  if (!supaConfigured(env) || !keys.length) return;
  const base = env.SUPABASE_URL!.replace(/\/$/, "");
  const res = await fetch(`${base}/storage/v1/object/${encodeURIComponent(env.SUPABASE_BUCKET)}`, {
    method: "DELETE",
    headers: { ...authHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: keys }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`storage delete failed (${res.status})`);
}
