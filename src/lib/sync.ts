"use client";

import { api, ApiError } from "@/src/lib/api";
import type { SyncKind } from "@/src/lib/sync-map";

/**
 * Bundle sync with graceful degradation. Cloud mode talks to
 * /api/v1/sync/:bundle (validated server-side, workspace-scoped);
 * any unavailability falls back to device-local storage without errors.
 * Local storage always mirrors as the offline cache.
 */

export interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

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
    const data = await api.put<{ inserted: number; updated: number; deleted: number; skipped: number }>(`/api/v1/sync/${kind}`, body);
    return data;
  } catch (error) {
    if (error instanceof ApiError && (error.isUnavailable() || error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      return null;
    }
    throw error;
  }
}

/** Union by id with server winning conflicts (safe both-ways merge). */
export function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) merged.set(item.id, item);
  return [...merged.values()];
}

/** Union of string-keyed maps with server winning conflicts. */
export function mergeMaps<T>(local: Record<string, T>, remote: Record<string, T>): Record<string, T> {
  return { ...local, ...remote };
}
