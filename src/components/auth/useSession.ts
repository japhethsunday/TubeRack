"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/src/lib/api";

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

function load(): Promise<SessionState> {
  if (!cached) {
    cached = api
      .get<SessionInfo | null>("/api/v1/users/me")
      .then((user): SessionState => (user ? { status: "signed-in", user } : { status: "signed-out", user: null }))
      .catch((error: unknown): SessionState => {
        // Transient failures should not pin the tab to "signed out".
        if (!(error instanceof ApiError) || error.isUnavailable()) cached = null;
        return { status: "signed-out", user: null };
      });
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
