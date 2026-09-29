"use client";

import { useEffect, useState } from "react";
import { Music2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

interface Info {
  configured: boolean;
  paused: string | null;
  connection: { displayName: string; avatarUrl: string; createdAt: string } | null;
}

/** Settings → Connections: connect, see and disconnect the TikTok account. */
export function ConnectionsPanel() {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice] = useState(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    return q.get("tiktok_error") ? { ok: false, text: q.get("tiktok_error")! } : q.get("tiktok_connected") ? { ok: true, text: "TikTok connected." } : null;
  });
  const load = () => api.get<Info>("/api/v1/tiktok/connection").then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    void load();
  }, []);

  async function disconnect() {
    if (!window.confirm("Disconnect TikTok? Recktube will no longer be able to post to this account.")) return;
    setBusy(true);
    await api.remove("/api/v1/tiktok/connection").catch(() => undefined);
    await load();
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      {notice && <p className={cx("rounded-lg px-3 py-2 text-sm", notice.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{notice.text}</p>}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start gap-3">
          <Music2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">TikTok</p>
            <p className="text-sm text-muted-text">Post finished videos from the Video Studio straight to your TikTok account.</p>
            {!info ? (
              <p className="mt-3 text-sm text-muted-text">Loading…</p>
            ) : !info.configured ? (
              <p className="mt-3 text-sm text-muted-text">{info.paused ?? "TikTok posting isn't available yet."}</p>
            ) : info.connection ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {info.connection.avatarUrl && <img src={info.connection.avatarUrl} alt="" className="size-9 rounded-full" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{info.connection.displayName || "TikTok account"}</p>
                  <p className="text-xs text-muted-text">Connected {new Date(info.connection.createdAt).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant="outline" loading={busy} onClick={() => void disconnect()}>Disconnect</Button>
              </div>
            ) : (
              <a href="/api/v1/tiktok/start?returnTo=%2Fsettings%3Ftab%3Dconnections" className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Music2 className="size-4" aria-hidden="true" /> Connect TikTok
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
