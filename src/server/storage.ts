import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { internalError } from "@/src/server/errors";

/**
 * Object storage adapter for the configured CloudNivo bucket.
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
  return Boolean(env.CLOUDNIVO_STORAGE_URL && env.CLOUDNIVO_SECRET_KEY && env.CLOUDNIVO_PROJECT_ID);
}

function storageHeaders(env: ReturnType<typeof getServerEnv>): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CLOUDNIVO_SECRET_KEY}`,
    "Content-Type": "application/octet-stream",
  };
}

/**
 * PUT bytes to the bucket. Throws a generic error on platform mismatch so
 * callers can fall back to inline storage with a clear message.
 */
export async function storagePut(key: string, bytes: Uint8Array, mime: string): Promise<StoragePutResult> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) throw new Error("Object storage is not configured.");
  const base = `${env.CLOUDNIVO_STORAGE_URL!.replace(/\/$/, "")}`;
  const bucket = env.CLOUDNIVO_BUCKET;
  const url = `${base}/buckets/${encodeURIComponent(bucket)}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: { ...storageHeaders(env), "Content-Type": mime || "application/octet-stream" },
      body: new Blob([bytes as unknown as BlobPart], { type: mime || "application/octet-stream" }),
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
  const base = `${env.CLOUDNIVO_STORAGE_URL!.replace(/\/$/, "")}`;
  const bucket = env.CLOUDNIVO_BUCKET;
  const url = `${base}/buckets/${encodeURIComponent(bucket)}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${env.CLOUDNIVO_SECRET_KEY}` } });
  } catch {
    throw new Error("Object storage is unreachable.");
  }
  if (response.status === 404) throw new Error("Object not found.");
  if (!response.ok) throw internalError();
  const buffer = new Uint8Array(await response.arrayBuffer());
  return { bytes: buffer, mime: response.headers.get("content-type") ?? "application/octet-stream" };
}

export async function storageDelete(key: string): Promise<void> {
  const env = getServerEnv();
  if (!isStorageConfigured(env)) return;
  const base = `${env.CLOUDNIVO_STORAGE_URL!.replace(/\/$/, "")}`;
  const bucket = env.CLOUDNIVO_BUCKET;
  const url = `${base}/buckets/${encodeURIComponent(bucket)}/objects/${key.split("/").map(encodeURIComponent).join("/")}`;
  try {
    await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${env.CLOUDNIVO_SECRET_KEY}` } });
  } catch {
    // Delete is best-effort; the DB row is the source of truth.
  }
}

/** Small-file inline fallback: BYTEA column when storage is unreachable. */
export async function inlineLimit(): Promise<number> {
  return getServerEnv().MEDIA_INLINE_LIMIT;
}
