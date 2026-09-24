"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Check, Upload, ListPlus, ShieldCheck, TriangleAlert } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import type { ChannelPlan } from "@/src/lib/channel/plan";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

interface MyChannel {
  id: string;
  title: string;
  handle: string;
  description: string;
  keywords: string;
  country: string;
  thumbnail: string;
  bannerUrl: string;
  subscribers: number | null;
  videos: number | null;
}
interface Setup {
  configured: boolean;
  connected: boolean;
  canManage: boolean;
  channel: MyChannel | null;
  manual: { id: string; label: string; how: string; url: string }[];
}

/** Resize/compress a banner to 2560×1440 JPEG under 4 MB (YouTube minimum is 2048×1152). */
async function prepareBanner(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth < 2048 || img.naturalHeight < 1152) throw new Error(`Banner is ${img.naturalWidth}×${img.naturalHeight}. YouTube needs at least 2048×1152.`);
    const canvas = document.createElement("canvas");
    canvas.width = 2560;
    canvas.height = 1440;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    const k = Math.max(2560 / img.naturalWidth, 1440 / img.naturalHeight);
    ctx.drawImage(img, (2560 - img.naturalWidth * k) / 2, (1440 - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
    for (const q of [0.9, 0.8, 0.7, 0.6]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size < 4 * 1024 * 1024) return blob;
    }
    throw new Error("Could not compress the banner under 4 MB.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ChannelSetup({ plan, planId, region, keywordsField }: { plan: ChannelPlan; planId: string; region: string; keywordsField: string }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState({ description: true, keywords: true, country: Boolean(region) });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pillars, setPillars] = useState<string[]>(plan.pillars.map((p) => p.name));
  const returnTo = `/channel-creator?plan=${planId}`;

  useEffect(() => {
    let alive = true;
    api
      .get<Setup>("/api/v1/youtube/channel-setup")
      .then((s) => alive && setSetup(s))
      .catch((e: unknown) => alive && setLoadError(e instanceof ApiError ? e.message : "Could not read your YouTube connection."));
    return () => {
      alive = false;
    };
  }, []);

  const connectHref = `/api/v1/youtube/oauth/start?returnTo=${encodeURIComponent(returnTo)}`;
  const ch = setup?.channel ?? null;

  async function applyBranding() {
    setBusy("branding");
    setMsg(null);
    try {
      const patch: Record<string, string> = { planId };
      if (fields.description) patch.description = plan.about;
      if (fields.keywords) patch.keywords = keywordsField;
      if (fields.country && region) patch.country = region;
      const updated = await api.patch<MyChannel>("/api/v1/youtube/channel-setup", patch);
      setSetup((s) => (s ? { ...s, channel: updated } : s));
      const confirmed = (!fields.description || updated.description === plan.about) && (!fields.keywords || updated.keywords.length > 0);
      setMsg(confirmed ? { kind: "ok", text: "Updated on YouTube — values above are read back from your channel." } : { kind: "err", text: "YouTube accepted the request but returned different values. Check YouTube Studio." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Update failed." });
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  async function uploadBanner(file: File) {
    setBusy("banner");
    setMsg(null);
    try {
      const blob = await prepareBanner(file);
      const res = await fetch("/api/v1/youtube/banner", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const json = (await res.json()) as { data?: MyChannel; message?: string };
      if (!res.ok || !json.data) throw new Error(json.message ?? `Upload failed (${res.status}).`);
      setSetup((s) => (s ? { ...s, channel: json.data! } : s));
      setMsg({ kind: "ok", text: "Banner uploaded and set on your channel." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Banner upload failed." });
    } finally {
      setBusy(null);
    }
  }

  async function createPlaylists() {
    setBusy("playlists");
    setMsg(null);
    try {
      const chosen = plan.pillars.filter((p) => pillars.includes(p.name));
      const res = await api.post<{ created: { title: string }[]; skipped: string[] }>("/api/v1/youtube/playlists", {
        playlists: chosen.map((p) => ({ title: p.name, description: p.purpose, privacy: "public" })),
      });
      const parts = [res.created.length ? `Created ${res.created.map((c) => `“${c.title}”`).join(", ")}.` : "", res.skipped.length ? `Already existed: ${res.skipped.join(", ")}.` : ""].filter(Boolean);
      setMsg({ kind: "ok", text: parts.join(" ") || "Nothing to create." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Could not create playlists." });
    } finally {
      setBusy(null);
    }
  }

  const same = (a: string, b: string) => a.trim() === b.trim();

  return (
    <section className="rounded-xl border border-border bg-surface p-5" aria-labelledby="yt-setup">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="yt-setup" className="text-sm font-semibold">Set up on YouTube</h3>
        {ch && (
          <a href={`https://studio.youtube.com/channel/${ch.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-text hover:text-foreground">
            Open YouTube Studio <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>

      {loadError && <p className="mt-3 text-sm text-destructive">{loadError}</p>}
      {!setup && !loadError && <div className="mt-3 h-16 animate-pulse rounded-lg bg-muted" />}

      {setup && !setup.configured && <p className="mt-3 text-sm text-muted-text">Google sign-in isn’t configured on this server, so channel changes can only be made manually (steps below).</p>}

      {setup?.configured && !setup.connected && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-text">Connect your channel to apply the About text, keywords, banner and playlists directly.</p>
          <a href={connectHref} className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">Connect YouTube</a>
        </div>
      )}

      {setup?.connected && ch && (
        <>
          <div className="mt-3 flex items-center gap-3">
            {ch.thumbnail && <img src={ch.thumbnail} alt="" className="size-10 rounded-full" />}
            <div>
              <p className="font-medium">{ch.title}</p>
              <p className="text-xs text-muted-text">{ch.handle}{ch.subscribers !== null ? ` · ${ch.subscribers.toLocaleString()} subscribers` : ""}{ch.videos !== null ? ` · ${ch.videos} videos` : ""}</p>
            </div>
          </div>

          {!setup.canManage ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-sm">
              <ShieldCheck className="size-4 text-muted-text" aria-hidden="true" />
              <span className="flex-1">Editing channel details needs the “manage your YouTube account” permission.</span>
              <a href={connectHref} className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">Grant permission</a>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                {([
                  ["description", "About text", ch.description, plan.about],
                  ["keywords", "Channel keywords", ch.keywords, keywordsField],
                  ...(region ? ([["country", "Country", ch.country, region]] as const) : []),
                ] as const).map(([id, label, now, next]) => (
                  <label key={id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <input type="checkbox" checked={fields[id]} onChange={(e) => setFields({ ...fields, [id]: e.target.checked })} className="mt-1 size-4 accent-[var(--primary)]" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        {label}
                        <span className={cx("rounded px-1.5 text-[11px]", same(now, next) ? "bg-success/15 text-success" : "bg-muted text-muted-text")}>{same(now, next) ? "Matches plan" : now ? "Will replace current" : "Currently empty"}</span>
                      </span>
                      {!same(now, next) && now && <span className="mt-1 block truncate text-xs text-muted-text">Now: {now}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!confirming ? (
                  <Button size="sm" disabled={busy !== null || !(fields.description || fields.keywords || fields.country)} onClick={() => setConfirming(true)}>Apply to YouTube…</Button>
                ) : (
                  <>
                    <Button size="sm" disabled={busy !== null} onClick={() => void applyBranding()}>
                      {busy === "branding" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />} Confirm — update my channel
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
                  </>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">Channel banner</p>
                  <p className="mt-0.5 text-xs text-muted-text">JPEG or PNG, at least 2048×1152. Keep text inside the centre 1235×338 safe area.</p>
                  {ch.bannerUrl && <img src={`${ch.bannerUrl}=w640`} alt="Current banner" className="mt-2 aspect-[16/9] w-full rounded object-cover" />}
                  <label className={cx("mt-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted", busy && "pointer-events-none opacity-50")}>
                    {busy === "banner" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
                    Upload banner
                    <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBanner(f); e.target.value = ""; }} />
                  </label>
                </div>
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">Playlists from content pillars</p>
                  <ul className="mt-2 space-y-1">
                    {plan.pillars.map((p) => (
                      <li key={p.name}>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={pillars.includes(p.name)} onChange={(e) => setPillars((x) => (e.target.checked ? [...x, p.name] : x.filter((y) => y !== p.name)))} className="size-4 accent-[var(--primary)]" />
                          {p.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" className="mt-2" disabled={busy !== null || pillars.length === 0} onClick={() => void createPlaylists()}>
                    {busy === "playlists" ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <ListPlus className="size-3.5" aria-hidden="true" />} Create {pillars.length} playlist{pillars.length === 1 ? "" : "s"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {msg && <p className={cx("mt-3 rounded-lg px-3 py-2 text-sm", msg.kind === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")} role="status">{msg.text}</p>}

      {setup && (
        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-text">
            <TriangleAlert className="size-3.5" aria-hidden="true" /> Done in YouTube Studio (not possible through YouTube’s API)
          </p>
          <ol className="mt-2 space-y-2">
            {setup.manual.map((m, i) => (
              <li key={m.id} className="flex gap-3 text-sm">
                <span className="w-4 shrink-0 tabular-nums text-muted-text">{i + 1}.</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.label}</span>
                  {m.id === "name" && plan.names[0] && <span className="text-muted-text"> — e.g. “{plan.names[0].name}”</span>}
                  {m.id === "handle" && plan.handles.find((h) => h.available) && <span className="text-muted-text"> — e.g. @{plan.handles.find((h) => h.available)!.handle}</span>}
                  <span className="block text-muted-text">{m.how}</span>
                </span>
                <a href={m.url} target="_blank" rel="noreferrer" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted">
                  Open <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
