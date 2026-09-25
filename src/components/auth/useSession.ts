"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/src/lib/api";
import { clearSyncedMarks } from "@/src/lib/sync";

export interface SessionInfo {
  id: string;
  email: string;
  name: string;
  email_verified_at: string | null;
}

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "signed-in"; user: SessionInfo }
  | { status: "signed-out"; user: null };

let cached: Promise<SessionState> | null = null;

const OWNER_KEY = "tuberack.owner";
/** Device caches that hold one account's workspace data. */
const ACCOUNT_KEYS = [
  "tuberack.workspace.v1",
  "tuberack.scripts.v1",
  "tuberack.video.v1",
  "tuberack.media.v1",
  "tuberack.intel.v1",
  "tuberack.package.v1",
  "tuberack.analytics.v1",
  "tuberack.recent-searches.v1",
  "tuberack.niche.shortlist",
];

/**
 * Keep device caches scoped to one account. Signed-out work is adopted by
 * the first account that signs in; a different account gets a clean slate
 * (its data loads from the server) so records never leak across accounts.
 */
function claimDeviceData(userId: string): void {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    localStorage.setItem(OWNER_KEY, userId);
    if (owner && owner !== userId) {
      for (const k of ACCOUNT_KEYS) localStorage.removeItem(k);
      clearSyncedMarks();
      window.location.reload();
    }
  } catch {
    // Storage unavailable: nothing cached to leak.
  }
}

function load(): Promise<SessionState> {
  if (!cached) {
    cached = (async (): Promise<SessionState> => {
      // Only "not signed in" (401) means signed out. Anything else — too many
      // requests, a network blip, a server hiccup — is retried, so a busy
      // moment never throws the user out of the app.
      for (let attempt = 0; ; attempt++) {
        try {
          const user = await api.get<SessionInfo | null>("/api/v1/users/me");
          if (user) claimDeviceData(user.id);
          return user ? { status: "signed-in", user } : { status: "signed-out", user: null };
        } catch (error: unknown) {
          if (error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHORIZED")) return { status: "signed-out", user: null };
          if (attempt >= 4) {
            cached = null;
            return { status: "signed-out", user: null };
          }
          await new Promise((r) => setTimeout(r, Math.min(8000, 800 * 2 ** attempt)));
        }
      }
    })();
  }
  return cached;
}

/** Current session from /api/v1/users/me, shared across components. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });
  useEffect(() => {
    let alive = true;
    void load().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** End the server session, then leave the app shell. */
export async function signOut(): Promise<void> {
  try {
    await api.post("/api/v1/auth/logout");
  } finally {
    cached = null;
    // Full navigation: every provider re-reads the new session cookie.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }
}
