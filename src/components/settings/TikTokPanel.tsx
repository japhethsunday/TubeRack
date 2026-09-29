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
export function ConnectionsPanel({ returnTo = "/settings?tab=connections" }: { returnTo?: string } = {}) {
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
              <>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {info.connection.avatarUrl && <img src={info.connection.avatarUrl} alt="" className="size-9 rounded-full" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{info.connection.displayName || "TikTok account"}</p>
                  <p className="text-xs text-muted-text">Connected {new Date(info.connection.createdAt).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant="outline" loading={busy} onClick={() => void disconnect()}>Disconnect</Button>
              </div>
              <TikTokStatsView returnTo={returnTo} />
              </>
            ) : (
              <a href={`/api/v1/tiktok/start?returnTo=${encodeURIComponent(returnTo)}`} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                <Music2 className="size-4" aria-hidden="true" /> Connect TikTok
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Stats {
  followers: number;
  following: number;
  likes: number;
  videoCount: number;
  videos: { id: string; title: string; cover: string; url: string; created: string; views: number; likes: number; comments: number; shares: number }[];
}
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Followers, likes and recent videos (shown once the stats permissions are enabled). */
function TikTokStatsView({ returnTo }: { returnTo: string }) {
  const [data, setData] = useState<{ state: string; stats?: Stats } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ state: string; stats?: Stats }>("/api/v1/tiktok/stats").then(setData).catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load TikTok stats."));
  }, []);
  if (err) return <p className="mt-3 text-sm text-destructive">{err}</p>;
  if (!data || data.state === "unavailable" || data.state === "not_connected") return null;
  if (data.state === "reconnect") {
    return (
      <p className="mt-3 text-sm text-muted-text">
        Reconnect TikTok to see your followers, likes and video stats here.{" "}
        <a href={`/api/v1/tiktok/start?returnTo=${encodeURIComponent(returnTo)}`} className="text-primary hover:underline">Reconnect</a>
      </p>
    );
  }
  const s = data.stats!;
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Followers", v: s.followers },
          { label: "Following", v: s.following },
          { label: "Total likes", v: s.likes },
          { label: "Videos", v: s.videoCount },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-text">{k.label}</p>
            <p className="text-xl font-semibold">{compact.format(k.v)}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Recent videos</p>
        {s.videos.length === 0 ? (
          <p className="text-sm text-muted-text">No videos yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {s.videos.map((v) => (
              <li key={v.id} className="flex items-center gap-3 p-2">
                {v.cover && <img src={v.cover} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <a href={v.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-sm font-medium hover:underline">{v.title}</a>
                  <p className="text-xs text-muted-text">{v.created ? new Date(v.created).toLocaleDateString() : ""}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-3 text-right text-xs sm:grid-cols-4">
                  <span title="Views">{compact.format(v.views)} views</span>
                  <span title="Likes">{compact.format(v.likes)} likes</span>
                  <span title="Comments" className="hidden sm:inline">{compact.format(v.comments)} comments</span>
                  <span title="Shares" className="hidden sm:inline">{compact.format(v.shares)} shares</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
