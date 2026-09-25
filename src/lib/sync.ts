"use client";

import { useEffect, useRef } from "react";
import { api, ApiError } from "@/src/lib/api";
import type { SyncKind } from "@/src/lib/sync-map";

/**
 * Bundle sync between this device and the account.
 *
 * Guarantees:
 * - Never loses unsynced work: pulls merge INTO the device copy (newest
 *   edit wins per item), they never replace it.
 * - Deletions on another device propagate: an item this device already
 *   synced that is now missing on the server is removed locally.
 * - Pushes are debounced, retried with backoff until they succeed, and
 *   flushed when the tab is hidden or closed.
 * - Open tabs refresh from the server when they regain focus, but never
 *   while they still have unsent changes.
 */

export interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

// ---------- merge ----------

type Stamped = { updatedAt?: string; at?: string; createdAt?: string };

/** Last-modified time of a record (0 when unknown). */
export function stampOf(x: unknown): number {
  const s = (x ?? {}) as Stamped;
  const t = Date.parse(s.updatedAt ?? s.at ?? s.createdAt ?? "");
  return Number.isFinite(t) ? t : 0;
}

const SYNCED_PREFIX = "tuberack.synced.";

function readSynced(scope: string): Set<string> {
  try {
    const raw = localStorage.getItem(SYNCED_PREFIX + scope);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Remember which ids the server has seen for a collection. */
export function rememberSynced(scope: string, ids: Iterable<string>, replace = false): void {
  try {
    const set = replace ? new Set<string>() : readSynced(scope);
    for (const id of ids) set.add(id);
    localStorage.setItem(SYNCED_PREFIX + scope, JSON.stringify([...set].slice(-5000)));
  } catch {
    // Storage unavailable: merges fall back to keeping local-only items.
  }
}

export function clearSyncedMarks(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(SYNCED_PREFIX)) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Merge a collection: newest edit wins for items on both sides; local-only
 * items are kept unless this device synced them before (then they were
 * deleted elsewhere). With a scope, the server's ids are remembered.
 */
export function mergeById<T extends { id: string }>(local: T[], remote: T[], scope?: string): T[] {
  const synced = scope ? readSynced(scope) : new Set<string>();
  const remoteIds = new Set(remote.map((r) => r.id));
  const localById = new Map(local.map((l) => [l.id, l]));
  const out: T[] = [];
  for (const r of remote) {
    const l = localById.get(r.id);
    out.push(l && stampOf(l) > stampOf(r) ? l : r);
  }
  for (const l of local) {
    if (remoteIds.has(l.id)) continue;
    if (scope && synced.has(l.id)) continue; // deleted on another device
    out.push(l);
  }
  if (scope) rememberSynced(scope, remoteIds, true);
  return out;
}

/** Same as mergeById for id-keyed maps. */
export function mergeMaps<T>(local: Record<string, T>, remote: Record<string, T>, scope?: string): Record<string, T> {
  const synced = scope ? readSynced(scope) : new Set<string>();
  const out: Record<string, T> = {};
  for (const [k, r] of Object.entries(remote)) {
    const l = local[k];
    out[k] = l !== undefined && stampOf(l) > stampOf(r) ? l : r;
  }
  for (const [k, l] of Object.entries(local)) {
    if (k in remote) continue;
    if (scope && synced.has(k)) continue;
    out[k] = l;
  }
  if (scope) rememberSynced(scope, Object.keys(remote), true);
  return out;
}

/** Record every id in a pushed body as synced (arrays of {id} and id-keyed maps). */
function rememberPushed(kind: SyncKind, body: unknown): void {
  if (!body || typeof body !== "object") return;
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key.startsWith("deleted")) continue;
    if (Array.isArray(value)) {
      const ids = value.map((v) => (v && typeof v === "object" ? (v as { id?: unknown }).id : undefined)).filter((id): id is string => typeof id === "string");
      if (ids.length) rememberSynced(`${kind}.${key}`, ids);
    } else if (value && typeof value === "object") {
      rememberSynced(`${kind}.${key}`, Object.keys(value));
    }
  }
}

// ---------- transport ----------

export async function pullBundle(kind: SyncKind, cloud: boolean, query?: string): Promise<unknown | null> {
  if (!cloud) return null;
  try {
    const data = await api.get<unknown>(`/api/v1/sync/${kind}${query ?? ""}`);
    return data;
  } catch (error) {
    if (error instanceof ApiError && (error.isUnavailable() || error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN" || error.code === "NOT_FOUND")) {
      return null;
    }
    throw error;
  }
}

export async function pushBundle(kind: SyncKind, cloud: boolean, body: unknown): Promise<SyncResult | null> {
  if (!cloud) return null;
  try {
    const data = await api.put<SyncResult>(`/api/v1/sync/${kind}`, body);
    rememberPushed(kind, body);
    return data;
  } catch (error) {
    if (error instanceof ApiError && (error.isUnavailable() || error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      return null;
    }
    throw error;
  }
}

// ---------- reliable push queue ----------

interface Pending {
  body: unknown;
  onResult?: (r: SyncResult) => void;
  timer: number | null;
  attempt: number;
  inFlight: boolean;
}

const queue = new Map<SyncKind, Pending>();
const listeners = new Set<() => void>();
let status: "idle" | "saving" | "retrying" | "too-large" = "idle";

function setStatus(next: typeof status) {
  if (status === next) return;
  status = next;
  for (const l of listeners) l();
}

export function syncStatus(): typeof status {
  return status;
}

export function onSyncStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True while this tab has changes for `kind` that the server hasn't confirmed. */
export function hasPendingPush(kind: SyncKind): boolean {
  return queue.has(kind);
}

function refreshStatus() {
  if (queue.size === 0) setStatus(status === "too-large" ? "too-large" : "idle");
  else setStatus([...queue.values()].some((p) => p.attempt > 0) ? "retrying" : "saving");
}

async function flush(kind: SyncKind) {
  const p = queue.get(kind);
  if (!p || p.inFlight) return;
  if (p.timer) window.clearTimeout(p.timer);
  p.timer = null;
  p.inFlight = true;
  const body = p.body;
  let ok = false;
  let fatal = false;
  try {
    const result = await pushBundle(kind, true, body);
    if (result) {
      ok = true;
      p.onResult?.(result);
    }
  } catch (error) {
    // Payload too large or rejected as invalid: retrying the same body can't succeed.
    fatal = error instanceof ApiError && (error.status === 413 || error.code === "VALIDATION_ERROR");
    if (fatal) console.error(`sync ${kind} rejected:`, error instanceof Error ? error.message : error);
  }
  p.inFlight = false;
  const latest = queue.get(kind);
  if (fatal && latest && latest.body === body) {
    queue.delete(kind);
    setStatus("too-large");
    return;
  }
  if (ok) lastPushed.set(kind, JSON.stringify(body));
  if (ok && latest && latest.body === body) {
    queue.delete(kind);
  } else if (latest) {
    if (!ok) latest.attempt += 1;
    // Newer changes arrived meanwhile, or the push failed: go again.
    const delay = ok ? 300 : Math.min(60_000, 2_000 * 2 ** Math.min(latest.attempt, 5));
    latest.timer = window.setTimeout(() => void flush(kind), delay);
  }
  refreshStatus();
}

/**
 * Queue the latest bundle for `kind`. Debounced; retried with backoff until
 * the server confirms; flushed immediately when the tab is hidden.
 */
/** The last body each kind saved successfully: identical saves are skipped. */
const lastPushed = new Map<SyncKind, string>();

export function schedulePush(kind: SyncKind, body: unknown, onResult?: (r: SyncResult) => void, delayMs = 800): void {
  ensureLifecycleHooks();
  if (!queue.has(kind) && lastPushed.get(kind) === JSON.stringify(body)) return;
  const existing = queue.get(kind);
  if (existing?.timer) window.clearTimeout(existing.timer);
  const p: Pending = { body, onResult, timer: null, attempt: existing?.attempt ?? 0, inFlight: existing?.inFlight ?? false };
  queue.set(kind, p);
  p.timer = window.setTimeout(() => void flush(kind), delayMs);
  refreshStatus();
}

let hooked = false;
function ensureLifecycleHooks() {
  if (hooked || typeof window === "undefined") return;
  hooked = true;
  const flushAll = () => {
    for (const [kind, p] of queue) {
      if (p.inFlight) continue;
      // keepalive lets the request finish after the tab closes (≤ 64 KB bodies).
      const json = JSON.stringify(p.body);
      if (json.length < 60_000) {
        try {
          void fetch(`/api/v1/sync/${kind}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: json, keepalive: true });
          continue;
        } catch {
          // fall back to a normal flush
        }
      }
      void flush(kind);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", flushAll);
  window.addEventListener("online", () => {
    for (const kind of queue.keys()) void flush(kind);
  });
  window.addEventListener("beforeunload", (e) => {
    if ([...queue.values()].some((p) => p.attempt > 0)) {
      // Unsaved changes that failed to reach the server: warn before leaving.
      e.preventDefault();
    }
  });
}

// ---------- refresh on focus ----------

/**
 * Call `refresh` when this tab regains focus (throttled), so changes made on
 * another device appear without a reload. Skipped while pushes are pending.
 */
export function useRemoteRefresh(kind: SyncKind, enabled: boolean, refresh: () => void, minIntervalMs = 15_000): void {
  const last = useRef(0);
  const fn = useRef(refresh);
  useEffect(() => {
    fn.current = refresh;
  });
  useEffect(() => {
    if (!enabled) return;
    last.current = Date.now();
    const maybe = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < minIntervalMs) return;
      if (hasPendingPush(kind)) return;
      last.current = Date.now();
      fn.current();
    };
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    const interval = window.setInterval(maybe, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
      window.clearInterval(interval);
    };
  }, [kind, enabled, minIntervalMs]);
}
