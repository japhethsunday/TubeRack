"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Backend connection status: cloud (server reachable + configured) or local
 * (device-only). Providers sync when cloud is available and keep working
 * offline otherwise. Nothing sensitive is exposed — presence only.
 */

export type BackendMode = "checking" | "cloud" | "local";

interface BackendStatus {
  mode: BackendMode;
  database: boolean;
  storage: boolean;
  auth: boolean;
  email: boolean;
  checkedAt: string | null;
}

const Ctx = createContext<BackendStatus>({ mode: "checking", database: false, storage: false, auth: false, email: false, checkedAt: null });

export function useBackend(): BackendStatus {
  return useContext(Ctx);
}

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>({ mode: "checking", database: false, storage: false, auth: false, email: false, checkedAt: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/system/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.backend) return;
        const backend = payload.backend as { databaseConfigured: boolean; databaseReachable: boolean | null; storageConfigured: boolean; authReady: boolean; emailConfigured: boolean };
        const cloud = Boolean(backend.databaseConfigured && backend.databaseReachable !== false && backend.authReady);
        setStatus({
          mode: cloud ? "cloud" : "local",
          database: backend.databaseConfigured,
          storage: backend.storageConfigured,
          auth: backend.authReady,
          email: backend.emailConfigured,
          checkedAt: new Date().toISOString(),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus((s) => ({ ...s, mode: "local", checkedAt: new Date().toISOString() }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

/** Header badge: hidden when everything is connected; warns only in device-only mode. */
export function BackendBadge() {
  const status = useBackend();
  if (status.mode !== "local") return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning"
      title="Can't reach your account right now — changes stay on this device until the connection is back."
      aria-label="Offline, changes saved on this device"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
      Offline
    </span>
  );
}
