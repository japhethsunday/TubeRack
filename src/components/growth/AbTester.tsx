"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FlaskConical, Play, Square, RefreshCw, Sparkles, Trash2, Trophy, SkipForward, Check, ImagePlus, X } from "lucide-react";
import { growth, type AbTest, type MyVideo } from "@/src/lib/growth-client";
import { Select, Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const full = new Intl.NumberFormat("en");
const STATUS_TONE = { draft: "neutral", running: "info", completed: "ok", stopped: "warn" } as const;

function NewTest({ videos, onCreated }: { videos: MyVideo[]; onCreated: (t: AbTest) => void }) {
  const [videoId, setVideoId] = useState(videos[0]?.id ?? "");
  const [rotate, setRotate] = useState("24");
  const [cycles, setCycles] = useState("2");
  const [files, setFiles] = useState<{ file: File; label: string; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= 4) break;
      next.push({ file: f, label: `Variant ${String.fromCharCode(65 + next.length)}`, url: URL.createObjectURL(f) });
    }
    setFiles(next);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (files.length < 2) return setError("Add at least 2 thumbnails (JPEG or PNG, under 2 MB, 1280×720 recommended).");
    const video = videos.find((v) => v.id === videoId);
    const form = new FormData();
    form.set("videoId", videoId);
    form.set("videoTitle", video?.title ?? "");
    form.set("rotateHours", rotate);
    form.set("cycles", cycles);
    files.forEach((f) => {
      form.append("files", f.file);
      form.append("labels", f.label);
    });
    setBusy(true);
    const o = await growth.createTest(form);
    setBusy(false);
    if (!o.ok) return setError(o.message);
    files.forEach((f) => URL.revokeObjectURL(f.url));
    setFiles([]);
    onCreated(o.data);
  }

  const days = (Number(rotate) / 24) * files.length * Number(cycles);
  return (
    <form onSubmit={(e) => void create(e)} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">New thumbnail test</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Video" value={videoId} onChange={(e) => setVideoId(e.target.value)}>
          {videos.map((v) => <option key={v.id} value={v.id}>{v.title.slice(0, 70)}</option>)}
        </Select>
        <Select label="Show each thumbnail for" value={rotate} onChange={(e) => setRotate(e.target.value)}>
          <option value="24">1 day</option>
          <option value="48">2 days</option>
          <option value="72">3 days</option>
          <option value="168">1 week</option>
        </Select>
        <Select label="Rounds" value={cycles} onChange={(e) => setCycles(e.target.value)} hint="More rounds cancel out day-of-week effects.">
          {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {files.map((f, i) => (
          <div key={f.url} className="space-y-1.5">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob. */}
              <img src={f.url} alt="" className="aspect-video w-full rounded-lg border border-border object-cover" />
              <button type="button" aria-label={`Remove ${f.label}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80">
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
            <Input label={`Label ${i + 1}`} value={f.label} onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          </div>
        ))}
        {files.length < 4 && (
          <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-xs text-muted-text transition-colors hover:bg-muted">
            <ImagePlus className="size-5" aria-hidden="true" /> Add thumbnail
            <input type="file" accept="image/jpeg,image/png" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          </label>
        )}
      </div>
      {files.length >= 2 && <p className="text-xs text-muted-text">The test runs about {days} days: each thumbnail goes live in turn, then the winner stays up.</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      <Button type="submit" loading={busy}><FlaskConical className="size-4" aria-hidden="true" /> Create test</Button>
    </form>
  );
}

function TestCard({ test, onChange, onDelete }: { test: AbTest; onChange: (t: AbTest) => void; onDelete: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const results = "variants" in test.results ? test.results : null;
  const scores = test.ai_scores.scores ?? [];

  async function act(action: string, variantId?: string) {
    setBusy(action + (variantId ?? ""));
    setError("");
    const o = await growth.testAction(test.id, action, variantId);
    setBusy(null);
    if (o.ok) onChange(o.data);
    else setError(o.message);
  }

  const doneWindows = test.windows.filter((w) => w.end).length;
  const totalWindows = test.variants.length * test.cycles;
  return (
    <li className="space-y-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`https://youtu.be/${test.video_id}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{test.video_title || test.video_id}</a>
        <Badge tone={STATUS_TONE[test.status]}>{test.status}</Badge>
        {test.status === "running" && (
          <span className="text-xs text-muted-text">
            Round {Math.min(totalWindows, doneWindows + 1)} of {totalWindows} · next swap {test.next_rotate_at ? new Date(test.next_rotate_at).toLocaleString() : "—"}
          </span>
        )}
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" loading={busy === "score"} onClick={() => void act("score")}><Sparkles className="size-3.5" aria-hidden="true" /> Gemini review</Button>
          {test.status === "draft" && <Button size="sm" loading={busy === "start"} onClick={() => void act("start")}><Play className="size-3.5" aria-hidden="true" /> Start test</Button>}
          {test.status === "running" && (
            <>
              <Button size="sm" variant="outline" loading={busy === "rotate"} onClick={() => void act("rotate")}><SkipForward className="size-3.5" aria-hidden="true" /> Swap now</Button>
              <Button size="sm" variant="outline" loading={busy === "stop"} onClick={() => void act("stop")}><Square className="size-3.5" aria-hidden="true" /> Stop</Button>
            </>
          )}
          {(test.status === "completed" || test.status === "stopped" || test.status === "running") && test.windows.some((w) => w.end) && (
            <Button size="sm" variant="outline" loading={busy === "refresh"} onClick={() => void act("refresh")}><RefreshCw className="size-3.5" aria-hidden="true" /> Refresh results</Button>
          )}
          {test.status !== "running" && (
            <button type="button" aria-label="Delete test" onClick={onDelete} className="rounded-md p-1.5 text-muted-text transition-colors hover:bg-muted hover:text-destructive"><Trash2 className="size-4" aria-hidden="true" /></button>
          )}
        </span>
      </div>
      {(error || test.error) && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error || test.error}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {test.variants.map((v, i) => {
          const r = results?.variants.find((x) => x.variantId === v.id);
          const s = scores.find((x) => x.variantId === v.id);
          const live = test.status === "running" && test.current_index === i;
          const winner = results?.winnerId === v.id;
          return (
            <div key={v.id} className={cx("space-y-2 rounded-lg border p-2", winner ? "border-success" : live ? "border-primary" : "border-border")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL via redirect. */}
              <img src={`/api/v1/abtests/${test.id}/image?variant=${v.id}`} alt={v.label} className="aspect-video w-full rounded object-cover" loading="lazy" />
              <p className="flex flex-wrap items-center gap-1 text-sm font-medium">
                {v.label}
                {live && <Badge tone="info">Live now</Badge>}
                {winner && <Badge tone="ok"><Trophy className="mr-0.5 inline size-3" aria-hidden="true" />Winner</Badge>}
                {test.ai_scores.pickVariantId === v.id && <Badge tone="neutral">Gemini pick</Badge>}
              </p>
              {r && r.days > 0 && (
                <p className="text-xs tabular-nums text-muted-text">
                  {results?.metric === "ctr" && r.ctr !== null ? <><b className="text-foreground">{r.ctr.toFixed(2)}% CTR</b> · {full.format(r.impressions ?? 0)} impr · </> : null}
                  {full.format(Math.round(r.viewsPerDay))} views/day · {r.days}d
                </p>
              )}
              {s && <p className="text-xs"><span className="font-semibold">AI score {s.score}</span> <span className="text-muted-text">— {s.strengths[0] ?? ""}{s.weaknesses[0] ? `; ${s.weaknesses[0]}` : ""}</span></p>}
              {test.status !== "running" && test.status !== "draft" && (
                <Button size="sm" variant="outline" loading={busy === `apply${v.id}`} onClick={() => void act("apply", v.id)}><Check className="size-3.5" aria-hidden="true" /> Make live</Button>
              )}
            </div>
          );
        })}
      </div>
      {results && (
        <p className="rounded-lg bg-muted/50 p-3 text-sm">
          {results.note}
          {results.liftPct !== null && results.winnerId && <> Lift over runner-up: <b>{results.liftPct.toFixed(1)}%</b>.</>}
          {results.confidence !== null && <> Confidence: <b>{Math.round(results.confidence * 100)}%</b>.</>}
          <span className="block text-xs text-muted-text">YouTube Analytics lags 2–3 days — refresh results after that for final numbers.</span>
        </p>
      )}
      {test.ai_scores.reasoning && <p className="text-xs text-muted-text"><Sparkles className="mr-1 inline size-3" aria-hidden="true" />{test.ai_scores.reasoning}</p>}
    </li>
  );
}

/** Thumbnail A/B testing on the connected channel: rotate variants, measure, keep the winner. */
export function AbTester() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [videos, setVideos] = useState<MyVideo[]>([]);
  const [tests, setTests] = useState<AbTest[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const c = await growth.connection();
    if (!c.ok) return setError(c.message);
    setConnected(Boolean(c.data.connection));
    if (!c.data.connection) return;
    const [v, t] = await Promise.all([growth.myVideos(), growth.tests()]);
    if (v.ok) setVideos(v.data.filter((x) => x.privacy !== "private" || x.publishAt));
    else setError(v.message);
    if (t.ok) setTests(t.data);
    else setError(t.message);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch.
    void load();
  }, [load]);

  if (connected === false) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm">
        <p className="font-medium">Connect your YouTube channel to run thumbnail tests.</p>
        <p className="mt-1 text-muted-text">TubeRack swaps the live thumbnail on your video on a schedule and reads the results from YouTube Analytics.</p>
        <Link href="/youtube" className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">Connect YouTube</Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {connected === null || tests === null ? (
        <p className="text-sm text-muted-text">Loading…</p>
      ) : (
        <>
          {videos.length > 0 ? (
            <NewTest videos={videos} onCreated={(t) => setTests([t, ...tests])} />
          ) : (
            <p className="text-sm text-muted-text">Upload or publish a video first. Tests run on public, unlisted, or scheduled videos.</p>
          )}
          <p className="text-xs text-muted-text">
            How it works: each thumbnail is shown for the chosen period, in rounds. Swaps happen automatically every morning (or use “Swap now”).
            When YouTube exposes impressions and CTR for your video, the winner is picked on CTR with a significance test. Otherwise it&apos;s picked on views per day, labelled as directional.
          </p>
          <ul className="space-y-4">
            {tests.map((t) => (
              <TestCard
                key={t.id}
                test={t}
                onChange={(nt) => setTests(tests.map((x) => (x.id === nt.id ? nt : x)))}
                onDelete={() => void growth.deleteTest(t.id).then((o) => (o.ok ? setTests(tests.filter((x) => x.id !== t.id)) : setError(o.message)))}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
