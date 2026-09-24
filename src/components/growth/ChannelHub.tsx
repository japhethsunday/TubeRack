"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MonitorPlay as Youtube, Unplug, RefreshCw, Upload, CalendarClock, ExternalLink, CheckCircle2 } from "lucide-react";
import { growth, type ChannelAnalytics, type Connection, type MyVideo } from "@/src/lib/growth-client";
import { MetricCard, TrendChart, BarList } from "@/src/components/analytics/charts";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { Tabs } from "@/src/components/ui/Tabs";
import { Progress } from "@/src/components/ui/feedback";

const full = new Intl.NumberFormat("en");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const TRAFFIC: Record<string, string> = {
  YT_SEARCH: "YouTube search", SUGGESTED: "Suggested videos", BROWSE: "Browse / Home", EXT_URL: "External", NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists", SUBSCRIBER: "Subscriptions", SHORTS: "Shorts feed", YT_CHANNEL: "Channel pages", NO_LINK_OTHER: "Direct / unknown",
  END_SCREEN: "End screens", ANNOTATION: "Cards", HASHTAGS: "Hashtags", YT_OTHER_PAGE: "Other YouTube", RELATED_VIDEO: "Related video", SOUND_PAGE: "Sound pages",
};

function Alert({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "rounded-lg bg-destructive/10 p-3 text-sm text-destructive" : "rounded-lg bg-success/10 p-3 text-sm text-success"}>
      {children}
    </p>
  );
}

function ConnectCard({ configured }: { configured: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white"><Youtube className="size-6" aria-hidden="true" /></span>
        <div className="min-w-0 space-y-2">
          <h2 className="text-lg font-semibold">Connect your YouTube channel</h2>
          <p className="max-w-prose text-sm text-muted-text">
            See your private analytics (watch time, retention, traffic sources, subscribers gained), upload and schedule videos, and run
            thumbnail A/B tests. TubeRack asks for read-only analytics plus upload access. Tokens are encrypted, and you can disconnect anytime.
          </p>
          {configured ? (
            <a href="/api/v1/youtube/oauth/start" className="ui-lift inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Youtube className="size-4" aria-hidden="true" /> Connect with Google
            </a>
          ) : (
            <Alert tone="error">
              Google sign-in isn&apos;t configured on the server yet. The site owner needs to add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud OAuth
              client with the YouTube Data API v3 and YouTube Analytics API enabled).
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel() {
  const [days, setDays] = useState(28);
  const [data, setData] = useState<ChannelAnalytics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (d: number) => {
    setBusy(true);
    setError("");
    const o = await growth.analytics(d);
    setBusy(false);
    if (o.ok) setData(o.data);
    else setError(o.message);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch analytics when the range changes.
    void load(days);
  }, [days, load]);

  const t = data?.totals ?? {};
  const netSubs = (t.subscribersGained ?? 0) - (t.subscribersLost ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select label="Range" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
          <option value="7">Last 7 days</option>
          <option value="28">Last 28 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 365 days</option>
        </Select>
        <div className="mt-6">
          <Button size="sm" variant="outline" loading={busy} onClick={() => void load(days)}>
            <RefreshCw className="size-3.5" aria-hidden="true" /> Refresh
          </Button>
        </div>
        {data && <p className="mt-6 text-xs text-muted-text">{data.range.start} → {data.range.end} (YouTube Analytics lags ~2 days)</p>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Views" value={full.format(t.views ?? 0)} provenance="platform" />
            <MetricCard label="Watch time" value={compact.format((t.estimatedMinutesWatched ?? 0) / 60)} unit="hours" provenance="platform" />
            <MetricCard label="Avg view duration" value={fmtDur(t.averageViewDuration ?? 0)} note={`${(t.averageViewPercentage ?? 0).toFixed(1)}% of each video watched`} provenance="platform" />
            <MetricCard label="Net subscribers" value={`${netSubs >= 0 ? "+" : ""}${full.format(netSubs)}`} note={`+${full.format(t.subscribersGained ?? 0)} / −${full.format(t.subscribersLost ?? 0)}`} provenance="platform" />
            <MetricCard label="Impressions CTR" value={data.impressions.available ? `${(data.impressions.ctr ?? 0).toFixed(1)}%` : "—"} note={data.impressions.available ? `${compact.format(data.impressions.impressions ?? 0)} impressions` : "Not exposed by the API for this channel"} provenance="platform" />
            <MetricCard label="Likes" value={full.format(t.likes ?? 0)} provenance="platform" />
            <MetricCard label="Comments" value={full.format(t.comments ?? 0)} provenance="platform" />
            <MetricCard label="Shares" value={full.format(t.shares ?? 0)} provenance="platform" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title="Daily views" area points={data.daily.map((d) => ({ at: `${d.day}T12:00:00Z`, value: Number(d.views) }))} provenance="platform" />
            <TrendChart title="Daily watch time (minutes)" points={data.daily.map((d) => ({ at: `${d.day}T12:00:00Z`, value: Number(d.estimatedMinutesWatched) }))} provenance="platform" />
          </div>
          <BarList
            title="Traffic sources"
            provenance="platform"
            empty="No traffic source data for this range."
            items={data.traffic.map((r) => ({ label: TRAFFIC[String(r.insightTrafficSourceType)] ?? String(r.insightTrafficSourceType), value: full.format(Number(r.views)), numeric: Number(r.views) }))}
          />
          <section className="rounded-xl border border-border bg-surface">
            <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">Top videos in this range</h3>
            {data.topVideos.length === 0 ? (
              <p className="p-4 text-sm text-muted-text">No views in this range yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-text">
                    <tr>{["Video", "Views", "Watch hrs", "Avg duration", "Avg % viewed", "Subs gained"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.topVideos.map((v) => (
                      <tr key={String(v.video)} className="border-t border-border">
                        <td className="px-4 py-2">
                          <a href={`https://youtu.be/${String(v.video)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                            {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail. */}
                            {v.thumbnail && <img src={v.thumbnail} alt="" className="aspect-video w-20 rounded object-cover" />}
                            <span className="line-clamp-2 max-w-xs">{v.title}</span>
                          </a>
                        </td>
                        <td className="px-4 py-2 tabular-nums">{full.format(Number(v.views))}</td>
                        <td className="px-4 py-2 tabular-nums">{compact.format(Number(v.estimatedMinutesWatched) / 60)}</td>
                        <td className="px-4 py-2 tabular-nums">{fmtDur(Number(v.averageViewDuration))}</td>
                        <td className="px-4 py-2 tabular-nums">{Number(v.averageViewPercentage).toFixed(1)}%</td>
                        <td className="px-4 py-2 tabular-nums">{full.format(Number(v.subscribersGained))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function VideosPanel() {
  const [videos, setVideos] = useState<MyVideo[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const o = await growth.myVideos();
    if (o.ok) setVideos(o.data);
    else setError(o.message);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch.
    void load();
  }, [load]);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!videos) return <p className="text-sm text-muted-text">Loading your videos…</p>;
  if (videos.length === 0) return <p className="text-sm text-muted-text">No uploads yet.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {videos.map((v) => (
        <li key={v.id} className="ui-lift flex gap-3 rounded-xl border border-border bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail. */}
          <img src={v.thumbnail} alt="" className="aspect-video w-32 shrink-0 rounded-md object-cover" />
          <div className="min-w-0">
            <p className="line-clamp-2 text-sm font-medium">{v.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-text">
              <Badge tone={v.privacy === "public" ? "ok" : v.publishAt ? "info" : "neutral"}>{v.publishAt && v.privacy === "private" ? "Scheduled" : v.privacy}</Badge>
              {v.publishAt && v.privacy === "private" ? `Goes live ${new Date(v.publishAt).toLocaleString()}` : new Date(v.publishedAt).toLocaleDateString()}
              {v.views !== null && <> · {compact.format(v.views)} views</>}
            </p>
            <a href={`https://studio.youtube.com/video/${v.id}/edit`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Open in YouTube Studio <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UploadPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [schedule, setSchedule] = useState("");
  const [category, setCategory] = useState("22");
  const [kids, setKids] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone(null);
    if (!file) return setError("Choose a video file.");
    if (!title.trim()) return setError("Add a title.");
    const publishAt = schedule ? new Date(schedule).toISOString() : null;
    setProgress(0);
    const session = await growth.startUpload({
      title: title.trim(),
      description,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      categoryId: category,
      privacy,
      publishAt,
      madeForKids: kids,
      size: file.size,
      mime: file.type || "video/mp4",
    });
    if (!session.ok) {
      setProgress(null);
      return setError(session.message);
    }
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("PUT", session.data.uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && setProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      xhrRef.current = null;
      setProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const id = (JSON.parse(xhr.responseText) as { id?: string }).id;
          setDone(id ?? "uploaded");
        } catch {
          setDone("uploaded");
        }
        setFile(null);
      } else {
        setError(`YouTube rejected the upload (${xhr.status}). ${xhr.responseText.slice(0, 200)}`);
      }
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setProgress(null);
      setError("Upload interrupted — check your connection and try again.");
    };
    xhr.send(file);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <label className="block">
        <span className="text-sm font-medium">Video file</span>
        <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium" />
        {file && <span className="mt-1 block text-xs text-muted-text">{file.name} · {compact.format(file.size / 1024 / 1024)} MB · uploads straight from your browser to YouTube</span>}
      </label>
      <Input label="Title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} hint={`${title.length}/100`} />
      <Textarea label="Description" value={description} maxLength={5000} rows={5} onChange={(e) => setDescription(e.target.value)} />
      <Input label="Tags (comma-separated)" value={tags} onChange={(e) => setTags(e.target.value)} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Visibility" value={privacy} onChange={(e) => setPrivacy(e.target.value as typeof privacy)} hint={schedule ? "Scheduled videos stay private until they go live." : undefined}>
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </Select>
        <Input label="Schedule (optional)" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} hint="Goes public at this time (your local time)." />
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {[["22", "People & Blogs"], ["27", "Education"], ["28", "Science & Technology"], ["24", "Entertainment"], ["26", "Howto & Style"], ["20", "Gaming"], ["10", "Music"], ["17", "Sports"], ["25", "News & Politics"], ["23", "Comedy"], ["19", "Travel & Events"], ["2", "Autos & Vehicles"], ["15", "Pets & Animals"], ["1", "Film & Animation"]].map(([id, l]) => (
            <option key={id} value={id}>{l}</option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} /> This video is made for kids (required by YouTube/COPPA)
      </label>
      {progress !== null && <Progress value={progress} label={`Uploading to YouTube — ${progress}%`} />}
      {error && <Alert tone="error">{error}</Alert>}
      {done && (
        <Alert tone="ok">
          <CheckCircle2 className="mr-1 inline size-4" aria-hidden="true" /> Uploaded{schedule ? " and scheduled" : ""}. YouTube is processing it now.
          {done !== "uploaded" && <> <a className="underline" href={`https://studio.youtube.com/video/${done}/edit`} target="_blank" rel="noreferrer">Open in Studio</a></>}
        </Alert>
      )}
      <div className="flex gap-2">
        <Button type="submit" loading={progress !== null}>
          {schedule ? <CalendarClock className="size-4" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />} {schedule ? "Upload & schedule" : "Upload"}
        </Button>
        {progress !== null && (
          <Button type="button" variant="outline" onClick={() => { xhrRef.current?.abort(); setProgress(null); }}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

/** My Channel: OAuth connection, private analytics, uploads list, upload + schedule. */
export function ChannelHub() {
  const params = useSearchParams();
  const [state, setState] = useState<{ configured: boolean; connection: Connection | null } | null>(null);
  const [error, setError] = useState(params.get("error") ?? "");

  const load = useCallback(async () => {
    const o = await growth.connection();
    if (o.ok) setState(o.data);
    else setError(o.message);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch.
    void load();
  }, [load]);

  async function disconnect() {
    if (!confirm("Disconnect YouTube? Running thumbnail tests will pause.")) return;
    const o = await growth.disconnect();
    if (o.ok) setState((s) => (s ? { ...s, connection: null } : s));
    else setError(o.message);
  }

  return (
    <div className="space-y-5">
      {params.get("connected") && state?.connection && <Alert tone="ok">Connected to {state.connection.channelTitle}.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      {!state ? (
        <p className="text-sm text-muted-text">Checking connection…</p>
      ) : !state.connection ? (
        <ConnectCard configured={state.configured} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- remote channel avatar. */}
            {state.connection.channelThumbnail && <img src={state.connection.channelThumbnail} alt="" className="size-10 rounded-full" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{state.connection.channelTitle}</p>
              <p className="text-xs text-muted-text">Connected {new Date(state.connection.createdAt).toLocaleDateString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void disconnect()}>
              <Unplug className="size-3.5" aria-hidden="true" /> Disconnect
            </Button>
          </div>
          <Tabs
            urlParam="tab"
            tabs={[
              { id: "analytics", label: "Analytics", content: <AnalyticsPanel /> },
              { id: "videos", label: "My videos", content: <VideosPanel /> },
              { id: "upload", label: "Upload & schedule", content: <UploadPanel /> },
            ]}
          />
        </>
      )}
    </div>
  );
}
