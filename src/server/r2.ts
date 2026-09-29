import { createHash, createHmac } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";

/**
 * Cloudflare R2 (S3-compatible) with AWS Signature V4 — no SDK needed.
 * Private bucket: the browser only ever gets short-lived presigned links.
 */

interface R2Env { account: string; key: string; secret: string; bucket: string }

export function r2Env(): R2Env | null {
  const e = getServerEnv();
  const t = (v?: string) => (v ?? "").trim().replace(/^["']|["']$/g, "");
  // Accept a pasted endpoint URL in place of the account ID.
  const account = t(e.R2_ACCOUNT_ID).replace(/^https?:\/\//, "").split(/[./]/)[0];
  const key = t(e.R2_ACCESS_KEY_ID);
  const secret = t(e.R2_SECRET_ACCESS_KEY);
  if (!account || !key || !secret) return null;
  // The bucket name isn't secret; default to ours if the variable is missing or misspelt.
  return { account, key, secret, bucket: t(e.R2_BUCKET) || "recktube-media" };
}

export const isR2Configured = () => Boolean(r2Env());

/**
 * New files go to R2 only after the owner switches it on in the admin (once
 * the bucket's CORS rule is in place). Reading files already on R2 works as
 * soon as R2 is configured.
 */
let activeCache: { at: number; on: boolean } | null = null;
export async function isR2Active(): Promise<boolean> {
  if (!isR2Configured()) return false;
  if (activeCache && Date.now() - activeCache.at < 30_000) return activeCache.on;
  let on = false;
  try {
    const { getDb } = await import("@/src/server/db");
    const db = getDb();
    const [r] = db ? await db`SELECT value FROM admin_settings WHERE key = 'storage_r2'` : [];
    on = Boolean((r?.value as { active?: boolean } | undefined)?.active);
  } catch {
    on = false;
  }
  activeCache = { at: Date.now(), on };
  return on;
}
export function resetR2ActiveCache(): void {
  activeCache = null;
}

/** Read the bucket's CORS rules (null when the token isn't allowed to read them). */
export async function r2CorsStatus(): Promise<"ok" | "missing" | "unknown"> {
  try {
    const res = await r2Request("GET", "", { query: { cors: "" }, timeoutMs: 10_000 });
    if (res.status === 404) return "missing";
    if (!res.ok) return "unknown";
    const xml = await res.text();
    return /recktube\.xyz/.test(xml) && /PUT/.test(xml) ? "ok" : "missing";
  } catch {
    return "unknown";
  }
}

const REGION = "auto";
const SERVICE = "s3";
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
/** RFC 3986 encoding (S3 style). */
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (key: string) => key.split("/").map(enc).join("/");

function stamp(d = new Date()) {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, day: iso.slice(0, 8) };
}

function signingKey(secret: string, day: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, day), REGION), SERVICE), "aws4_request");
}

function host(env: R2Env) {
  return `${env.account}.r2.cloudflarestorage.com`;
}

function canonicalQuery(q: Record<string, string>) {
  return Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join("&");
}

/** A presigned GET/PUT link valid for `expires` seconds. */
export function r2Presign(method: "GET" | "PUT" | "HEAD", key: string, expires = 3600, extra: Record<string, string> = {}): string {
  const env = r2Env();
  if (!env) throw new Error("R2 is not configured.");
  const { amz, day } = stamp();
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const path = `/${env.bucket}/${encPath(key)}`;
  const q: Record<string, string> = {
    ...extra,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${env.key}/${scope}`,
    "X-Amz-Date": amz,
    "X-Amz-Expires": String(Math.min(604800, Math.max(1, Math.round(expires)))),
    "X-Amz-SignedHeaders": "host",
  };
  const canonical = [method, path, canonicalQuery(q), `host:${host(env)}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(env.secret, day)).update(toSign).digest("hex");
  return `https://${host(env)}${path}?${canonicalQuery(q)}&X-Amz-Signature=${sig}`;
}

/** A signed server-side request to R2. `key` may be "" for bucket-level calls. */
export async function r2Request(
  method: "GET" | "PUT" | "HEAD" | "DELETE" | "POST",
  key: string,
  opts: { query?: Record<string, string>; body?: Buffer | Uint8Array; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Response> {
  const env = r2Env();
  if (!env) throw new Error("R2 is not configured.");
  const { amz, day } = stamp();
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const path = key ? `/${env.bucket}/${encPath(key)}` : `/${env.bucket}`;
  const body = opts.body ? Buffer.from(opts.body) : undefined;
  const payloadHash = body ? sha256(body) : sha256("");
  const headers: Record<string, string> = { ...(opts.headers ?? {}), host: host(env), "x-amz-content-sha256": payloadHash, "x-amz-date": amz };
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonical = [method, path, canonicalQuery(opts.query ?? {}), names.map((n) => `${n}:${lower[n]}\n`).join(""), names.join(";"), payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha256(canonical)].join("\n");
  const sig = createHmac("sha256", signingKey(env.secret, day)).update(toSign).digest("hex");
  const qs = canonicalQuery(opts.query ?? {});
  const { host: _h, ...sendHeaders } = headers;
  void _h;
  return fetch(`https://${host(env)}${path}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { ...sendHeaders, Authorization: `AWS4-HMAC-SHA256 Credential=${env.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}` },
    body: body as BodyInit | undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
}

export async function r2Put(key: string, bytes: Uint8Array, mime: string): Promise<void> {
  const res = await r2Request("PUT", key, { body: bytes, headers: { "content-type": mime || "application/octet-stream", "cache-control": "max-age=31536000" }, timeoutMs: 120_000 });
  if (!res.ok) throw new Error(`R2 rejected the upload (${res.status}).`);
}

export async function r2Exists(key: string): Promise<boolean> {
  const res = await r2Request("HEAD", key, { timeoutMs: 10_000 });
  return res.ok;
}

export async function r2Get(key: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const res = await r2Request("GET", key, { timeoutMs: 120_000 });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 download failed (${res.status}).`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get("content-type") ?? "application/octet-stream" };
}

const tag = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Files and sub-folders directly under `prefix` (names relative to the prefix). */
export async function r2List(prefix: string, search?: string): Promise<{ files: { name: string; size: number; createdAt: string }[]; folders: string[] }> {
  const files: { name: string; size: number; createdAt: string }[] = [];
  const folders: string[] = [];
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    const query: Record<string, string> = { "list-type": "2", prefix: search ? `${prefix}${search}` : prefix, delimiter: "/", "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await r2Request("GET", "", { query, timeoutMs: 20_000 });
    if (!res.ok) throw new Error(`R2 list failed (${res.status}).`);
    const xml = await res.text();
    for (const c of tag(xml, "Contents")) {
      const key = unxml(tag(c, "Key")[0] ?? "");
      if (!key.startsWith(prefix)) continue;
      files.push({ name: key.slice(prefix.length), size: Number(tag(c, "Size")[0] ?? 0), createdAt: tag(c, "LastModified")[0] ?? "" });
    }
    for (const p of tag(xml, "CommonPrefixes")) {
      const full = unxml(tag(p, "Prefix")[0] ?? "");
      folders.push(full.slice(prefix.length).replace(/\/$/, ""));
    }
    if ((tag(xml, "IsTruncated")[0] ?? "false") !== "true") break;
    token = unxml(tag(xml, "NextContinuationToken")[0] ?? "");
    if (!token) break;
  }
  return { files, folders };
}

/** Delete up to 1000 keys in one call. */
export async function r2DeleteMany(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>${keys.map((k) => `<Object><Key>${esc(k)}</Key></Object>`).join("")}</Delete>`;
  const body = Buffer.from(xml);
  const res = await r2Request("POST", "", { query: { delete: "" }, body, headers: { "content-type": "application/xml", "content-md5": createHash("md5").update(body).digest("base64") }, timeoutMs: 30_000 });
  if (!res.ok) throw new Error(`R2 delete failed (${res.status}).`);
}

export async function r2Ping(): Promise<boolean> {
  return (await r2Diagnose()) === null;
}

/** null when the bucket answers; otherwise a plain reason (never includes the keys). */
export async function r2Diagnose(): Promise<string | null> {
  const env = r2Env();
  if (!env) return "The R2 settings are missing in Vercel.";
  try {
    const res = await r2Request("GET", "", { query: { "list-type": "2", "max-keys": "1" }, timeoutMs: 8000 });
    if (res.ok) return null;
    const code = tag(await res.text(), "Code")[0] ?? "";
    const hints: Record<string, string> = {
      InvalidAccessKeyId: "R2_ACCESS_KEY_ID is wrong (use the Access Key ID from the R2 API token, not the token value).",
      SignatureDoesNotMatch: "R2_SECRET_ACCESS_KEY is wrong (use the Secret Access Key shown once when the token was created).",
      NoSuchBucket: `No bucket called "${env.bucket}" in this account — check R2_ACCOUNT_ID.`,
      AccessDenied: "The R2 token doesn't have access to this bucket — give it Object Read & Write on recktube-media.",
      Unauthorized: "The R2 keys were rejected — check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
    };
    return hints[code] ?? `R2 answered ${res.status}${code ? ` (${code})` : ""}.`;
  } catch (err) {
    return `Couldn't reach R2 (${err instanceof Error ? err.message : "network error"}) — check R2_ACCOUNT_ID.`;
  }
}
