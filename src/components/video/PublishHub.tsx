"use client";

import { useEffect, useState } from "react";
import { Camera, Check, Loader2, MonitorPlay, Music2, Send, Users } from "lucide-react";
import { api } from "@/src/lib/api";
import { growth } from "@/src/lib/growth-client";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { PublishDialog, type Prerendered, type PublishSource } from "@/src/components/video/PublishToYouTube";
import { TikTokDialog, type TikTokConnection } from "@/src/components/video/PostToTikTok";

type PlatformId = "youtube" | "tiktok";

interface PlatformRow {
  id: PlatformId | "instagram" | "facebook";
  label: string;
  icon: typeof MonitorPlay;
  /** null while checking; "soon" = not available yet. */
  state: "connected" | "not-connected" | "soon" | null;
  account?: string;
}

/**
 * One Publish button for every platform: post the same video to all
 * connected platforms at once, to a chosen few, or to just one. Each
 * platform's own window opens in turn (its settings differ), and the video
 * is rendered once and reused.
 */
export function PublishHub({ source, prerendered, openSignal }: { source: PublishSource; prerendered?: Prerendered | null; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  const [lastSignal, setLastSignal] = useState(openSignal ?? 0);
  if ((openSignal ?? 0) !== lastSignal) {
    setLastSignal(openSignal ?? 0);
    if (openSignal) setOpen(true);
  }
  // Back from connecting TikTok: go straight to its window.
  const [queue, setQueue] = useState<PlatformId[]>(() => {
    if (typeof window === "undefined") return [];
    const q = new URLSearchParams(window.location.search);
    return q.get("tiktok_connected") || q.get("tiktok_error") ? ["tiktok"] : [];
  });
  // A render made while publishing (e.g. for YouTube) is reused by the next platform.
  const [madeHere, setRendered] = useState<Prerendered | null>(null);
  const rendered = madeHere ?? prerendered ?? null;
  const [tiktok, setTiktok] = useState<TikTokConnection | null>(null);
  const [yt, setYt] = useState<{ connected: boolean; channel: string } | null>(null);
  // Everything connected is ticked unless the person unticks it.
  const [unpicked, setUnpicked] = useState<Set<PlatformId>>(new Set());
  useEffect(() => {
    void api.get<TikTokConnection>("/api/v1/tiktok/connection").then(setTiktok).catch(() => setTiktok(null));
    void growth.connection().then((c) => setYt(c.ok && c.data.connection ? { connected: true, channel: c.data.connection.channelTitle } : { connected: false, channel: "" }));
  }, [open]);

  const rows: PlatformRow[] = [
    { id: "youtube", label: "YouTube", icon: MonitorPlay, state: yt === null ? null : yt.connected ? "connected" : "not-connected", account: yt?.channel },
    ...(tiktok?.configured
      ? [{ id: "tiktok" as const, label: "TikTok", icon: Music2, state: tiktok.connection ? ("connected" as const) : ("not-connected" as const), account: tiktok.connection?.displayName }]
      : []),
    { id: "instagram", label: "Instagram Reels", icon: Camera, state: "soon" },
    { id: "facebook", label: "Facebook", icon: Users, state: "soon" },
  ];
  const connected = rows.filter((r): r is PlatformRow & { id: PlatformId } => r.state === "connected" && (r.id === "youtube" || r.id === "tiktok")).map((r) => r.id);


  function start(list: PlatformId[]) {
    if (!list.length) return;
    setOpen(false);
    setQueue(list);
  }
  const current = queue[0] ?? null;
  const next = () => setQueue((q) => q.slice(1));
  const toggle = (id: PlatformId) =>
    setUnpicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const pickedList = connected.filter((id) => !unpicked.has(id));

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setUnpicked(new Set());
          setOpen(true);
        }}
      >
        <Send className="size-4" aria-hidden="true" /> Publish
      </Button>

      {open && (
        <Modal title="Publish" description="Post this video to one platform, a few, or all of them at once." onClose={() => setOpen(false)}>
          <ul className="space-y-2">
            {rows.map((r) => {
              const Icon = r.icon;
              const usable = r.state === "connected" && (r.id === "youtube" || r.id === "tiktok");
              return (
                <li key={r.id} className={cx("flex items-center gap-3 rounded-xl border border-border p-3", !usable && "opacity-75")}>
                  <input
                    type="checkbox"
                    aria-label={`Include ${r.label}`}
                    disabled={!usable}
                    checked={usable && !unpicked.has(r.id as PlatformId)}
                    onChange={() => toggle(r.id as PlatformId)}
                    className="size-5 shrink-0 accent-[var(--primary)] sm:size-4"
                  />
                  <Icon className="size-5 shrink-0 text-muted-text" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{r.label}</span>
                    <span className="block truncate text-xs text-muted-text">
                      {r.state === null ? "Checking…" : r.state === "soon" ? "Coming soon — download the export and upload it in the app" : r.state === "connected" ? r.account || "Connected" : "Not connected"}
                    </span>
                  </span>
                  {r.state === null && <Loader2 className="size-4 animate-spin text-muted-text" aria-hidden="true" />}
                  {usable && (
                    <Button size="sm" variant="outline" onClick={() => start([r.id as PlatformId])}>
                      Only here
                    </Button>
                  )}
                  {r.state === "not-connected" && (
                    <a
                      href={r.id === "youtube" ? "/youtube" : "/settings?tab=connections"}
                      className="inline-flex h-8 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                    >
                      Connect
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" disabled={pickedList.length === 0} onClick={() => start(pickedList)}>
              <Check className="size-4" aria-hidden="true" /> Publish to selected ({pickedList.length})
            </Button>
            <Button disabled={connected.length === 0} onClick={() => start(connected)}>
              <Send className="size-4" aria-hidden="true" /> Publish to all connected
            </Button>
          </div>
          {connected.length > 1 && <p className="mt-3 text-xs text-muted-text">Each platform opens in turn so you can check its settings. The video is made once and reused.</p>}
        </Modal>
      )}

      {current === "youtube" && <PublishDialog source={source} prerendered={rendered} onRendered={setRendered} onClose={next} />}
      {current === "tiktok" && tiktok && <TikTokDialog source={source} prerendered={rendered} info={tiktok} onClose={next} />}
    </>
  );
}
