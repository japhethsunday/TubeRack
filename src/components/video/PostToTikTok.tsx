"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Music2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Select, Textarea } from "@/src/components/ui/fields";
import { cx } from "@/src/components/ui/cx";
import { renderComposition } from "@/src/lib/video/render";
import { uploadToCloud } from "@/src/lib/media/cloud-upload";
import type { Prerendered, PublishSource } from "@/src/components/video/PublishToYouTube";

interface Connection {
  configured: boolean;
  paused: string | null;
  connection: { openId: string; displayName: string; avatarUrl: string } | null;
}

interface Creator {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
}

/** True when this browser can build the H.264 + AAC MP4 TikTok accepts (Chrome/Edge yes; Firefox usually not). */
async function canMakeTikTokMp4(): Promise<boolean> {
  if (typeof window === "undefined" || !("VideoEncoder" in window) || !("AudioEncoder" in window)) return false;
  const v = await VideoEncoder.isConfigSupported({ codec: "avc1.42e028", width: 720, height: 1280, bitrate: 4_000_000, framerate: 30 }).catch(() => null);
  const a = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 }).catch(() => null);
  return Boolean(v?.supported && a?.supported);
}

const PRIVACY_LABEL: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

/** Header button: shown only when TikTok posting is available. */
export function PostToTikTokButton({ source, prerendered }: { source: PublishSource; prerendered?: Prerendered | null }) {
  const [info, setInfo] = useState<Connection | null>(null);
  // Back from connecting TikTok: reopen the posting window.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const q = new URLSearchParams(window.location.search);
    return Boolean(q.get("tiktok_connected") || q.get("tiktok_error"));
  });
  useEffect(() => {
    void api.get<Connection>("/api/v1/tiktok/connection").then(setInfo).catch(() => setInfo(null));
  }, []);
  if (!info?.configured) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Music2 className="size-4" aria-hidden="true" /> <span className="sm:hidden">TikTok</span><span className="hidden sm:inline">Post to TikTok</span>
      </Button>
      {open && <TikTokDialog source={source} prerendered={prerendered ?? null} info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

type Phase = "idle" | "render" | "upload" | "send" | "processing" | "done" | "failed";

function TikTokDialog({ source, prerendered, info, onClose }: { source: PublishSource; prerendered: Prerendered | null; info: Connection; onClose: () => void }) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [creatorErr, setCreatorErr] = useState<string | null>(null);
  const [notice] = useState(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("tiktok_error") ? { ok: false, text: q.get("tiktok_error")! } : q.get("tiktok_connected") ? { ok: true, text: "TikTok connected." } : null;
  });
  const [caption, setCaption] = useState(source.projectName);
  const [mode, setMode] = useState<"direct" | "draft">("direct");
  const [privacy, setPrivacy] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercial, setCommercial] = useState(false);
  const [yourBrand, setYourBrand] = useState(false);
  const [branded, setBranded] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceKind, setSourceKind] = useState<"project" | "file">("project");
  const [picked, setPicked] = useState<File | null>(null);
  const [mp4Ok, setMp4Ok] = useState<boolean | null>(null);
  useEffect(() => {
    void canMakeTikTokMp4().then(setMp4Ok);
  }, []);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const cancelled = useRef(false);
  const abort = useRef<AbortController | null>(null);

  /** Stop any work in progress and close. Once TikTok has the video, it keeps processing on its side. */
  function close() {
    cancelled.current = true;
    abort.current?.abort();
    onClose();
  }

  useEffect(() => {
    // Clean the connect result out of the address bar.
    const url = new URL(window.location.href);
    if (url.searchParams.has("tiktok_connected") || url.searchParams.has("tiktok_error")) {
      url.searchParams.delete("tiktok_connected");
      url.searchParams.delete("tiktok_error");
      window.history.replaceState(null, "", url.toString());
    }
    if (!info.connection) return;
    api.get<Creator>("/api/v1/tiktok/creator").then(setCreator).catch((e) => setCreatorErr(e instanceof Error ? e.message : "Couldn't load your TikTok account."));
    return () => {
      cancelled.current = true;
    };
  }, [info.connection]);

  const returnTo = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  const connectHref = `/api/v1/tiktok/start?returnTo=${encodeURIComponent(returnTo)}`;
  const tooLong = sourceKind === "project" && Boolean(creator?.max_video_post_duration_sec && source.duration > creator.max_video_post_duration_sec);
  const fileMissing = sourceKind === "file" && !picked;
  const brandedPrivate = branded && privacy === "SELF_ONLY";
  const busy = phase === "render" || phase === "upload" || phase === "send" || phase === "processing";
  const canPost =
    !busy && phase !== "done" && !tooLong && !fileMissing && !brandedPrivate && Boolean(creator) &&
    (mode === "draft" || (privacy && (!commercial || yourBrand || branded)));

  async function post() {
    setMsg(null);
    cancelled.current = false;
    const ac = new AbortController();
    abort.current = ac;
    try {
      let blob: Blob | null = sourceKind === "file" ? picked : (prerendered?.blob ?? null);
      let mime = sourceKind === "file" ? picked?.type || "video/mp4" : (prerendered?.mime ?? "video/mp4");
      if (sourceKind === "file" && !blob) throw new Error("Choose a video file first.");
      if (!blob) {
        setPhase("render");
        const out = await renderComposition({
          comp: source.comp,
          duration: source.duration,
          width: source.render?.width ?? source.comp.canvas.width,
          height: source.render?.height ?? source.comp.canvas.height,
          fps: source.render?.fps ?? source.fps,
          assetFor: source.assetFor,
          signal: ac.signal,
          onProgress: (p) => setProgress(Math.round(p.ratio * 100)),
        });
        blob = out.blob;
        mime = out.mime;
      }
      setPhase("upload");
      setProgress(0);
      const cleanMime = mime.split(";")[0] || "video/mp4";
      const { fileUrl } = await uploadToCloud(blob, cleanMime, (r) => setProgress(Math.round(r * 100)), ac.signal);
      if (ac.signal.aborted) return;
      setPhase("send");
      const res = await api.post<{ publishId: string }>("/api/v1/tiktok/post", {
        fileUrl,
        mode,
        caption,
        privacy: mode === "direct" ? privacy : "",
        disableComment: !allowComment,
        disableDuet: !allowDuet,
        disableStitch: !allowStitch,
        brandOrganic: commercial && yourBrand,
        brandContent: commercial && branded,
        isAigc: true,
        projectId: source.projectId,
      });
      setPhase("processing");
      for (let i = 0; i < 60 && !cancelled.current; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const s = await api.get<{ status: string; done: boolean; failed: boolean; reason: string }>(`/api/v1/tiktok/status?publishId=${encodeURIComponent(res.publishId)}`);
        if (s.failed) throw new Error(`TikTok couldn't post the video${s.reason ? ` (${s.reason.replace(/_/g, " ")})` : ""}.`);
        if (s.done) {
          setPhase("done");
          setMsg(mode === "draft" ? "Sent to your TikTok inbox. Open TikTok to finish and post it." : "Posted to TikTok. It may take a few minutes to appear on your profile.");
          return;
        }
      }
      setPhase("done");
      setMsg("TikTok is still processing the video. It will appear on your profile once TikTok finishes.");
    } catch (e) {
      if (ac.signal.aborted || cancelled.current) return;
      setPhase("failed");
      setMsg(e instanceof Error ? e.message : "Posting to TikTok failed.");
    }
  }

  const stepLabel: Record<Phase, string> = {
    idle: "",
    render: `Preparing the video… ${progress}%`,
    upload: `Uploading… ${progress}%`,
    send: "Sending to TikTok…",
    processing: "TikTok is processing the video…",
    done: "",
    failed: "",
  };

  return (
    <Modal title="Post to TikTok" description="Send this video to your TikTok account." onClose={close} wide>
      <div className="space-y-4">
        {notice && <p className={cx("rounded-lg px-3 py-2 text-sm", notice.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{notice.text}</p>}
        {!info.connection ? (
          <div className="rounded-xl border border-border p-4">
            <p className="font-medium">Connect your TikTok account</p>
            <p className="mt-1 text-sm text-muted-text">You&apos;ll sign in on TikTok and allow Recktube to post videos you choose. You can disconnect at any time.</p>
            <a href={connectHref} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Music2 className="size-4" aria-hidden="true" /> Connect TikTok
            </a>
          </div>
        ) : !creator ? (
          <p className="text-sm text-muted-text">{creatorErr ?? "Loading your TikTok account…"}{creatorErr && <> <a href={connectHref} className="text-primary hover:underline">Reconnect TikTok</a></>}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              {creator.creator_avatar_url && <img src={creator.creator_avatar_url} alt="" className="size-10 rounded-full" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{creator.creator_nickname || info.connection.displayName}</p>
                <p className="truncate text-xs text-muted-text">{creator.creator_username ? `@${creator.creator_username}` : "TikTok account"}</p>
              </div>
              <a href={connectHref} className="text-xs text-primary hover:underline">Switch account</a>
            </div>

            <fieldset className="space-y-2 text-sm">
              <legend className="mb-1 font-medium">Video to send</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" disabled={busy} onClick={() => setSourceKind("project")} className={cx("rounded-xl border p-3 text-left", sourceKind === "project" ? "border-primary bg-primary/5" : "border-border")}>
                  <p className="font-medium">This project</p>
                  <p className="text-xs text-muted-text">{prerendered ? "Uses the video you just exported." : `${source.projectName} · made from the timeline`}</p>
                </button>
                <button type="button" disabled={busy} onClick={() => setSourceKind("file")} className={cx("rounded-xl border p-3 text-left", sourceKind === "file" ? "border-primary bg-primary/5" : "border-border")}>
                  <p className="font-medium">A video file</p>
                  <p className="text-xs text-muted-text">Choose an MP4 or MOV from your computer.</p>
                </button>
              </div>
              {sourceKind === "file" && (
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  disabled={busy}
                  onChange={(e) => setPicked(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm"
                />
              )}
              {sourceKind === "project" && mp4Ok === false && (
                <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  This browser can&apos;t make the MP4 format TikTok needs (Firefox usually can&apos;t), so TikTok may reject it. Open Recktube in Chrome or Edge to post this project, or choose an MP4 file instead.
                </p>
              )}
            </fieldset>

            {tooLong && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">This video is {Math.round(source.duration)}s long; this TikTok account can post up to {creator.max_video_post_duration_sec}s. Trim it in the studio first.</p>}

            <div className="grid gap-2 sm:grid-cols-2">
              {(["direct", "draft"] as const).map((m) => (
                <button key={m} type="button" disabled={busy} onClick={() => setMode(m)} className={cx("rounded-xl border p-3 text-left text-sm", mode === m ? "border-primary bg-primary/5" : "border-border")}>
                  <p className="font-medium">{m === "direct" ? "Post now" : "Send to TikTok drafts"}</p>
                  <p className="text-xs text-muted-text">{m === "direct" ? "Posts to your profile with the settings below." : "Arrives in your TikTok inbox to edit and post in the app."}</p>
                </button>
              ))}
            </div>

            {mode === "direct" && (
              <>
                <Textarea label="Caption" value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 2200))} rows={3} hint={`${caption.length}/2200 · add #hashtags and @mentions here`} disabled={busy} />
                <Select label="Who can view this video" value={privacy} onChange={(e) => setPrivacy(e.target.value)} disabled={busy}>
                  <option value="" disabled>Choose…</option>
                  {(creator.privacy_level_options ?? []).map((p) => (
                    <option key={p} value={p} disabled={branded && p === "SELF_ONLY"}>{PRIVACY_LABEL[p] ?? p}{branded && p === "SELF_ONLY" ? " (not for branded content)" : ""}</option>
                  ))}
                </Select>
                <fieldset className="space-y-2 text-sm">
                  <legend className="mb-1 font-medium">Allow users to</legend>
                  {[
                    { label: "Comment", on: allowComment, set: setAllowComment, off: creator.comment_disabled },
                    { label: "Duet", on: allowDuet, set: setAllowDuet, off: creator.duet_disabled },
                    { label: "Stitch", on: allowStitch, set: setAllowStitch, off: creator.stitch_disabled },
                  ].map((t) => (
                    <label key={t.label} className={cx("flex items-center gap-2", t.off && "opacity-50")}>
                      <input type="checkbox" checked={t.on && !t.off} disabled={busy || t.off} onChange={(e) => t.set(e.target.checked)} />
                      {t.label}{t.off ? " (turned off in your TikTok settings)" : ""}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="space-y-2 rounded-xl border border-border p-3 text-sm">
                  <label className="flex items-center justify-between gap-2 font-medium">
                    Disclose video content
                    <input type="checkbox" checked={commercial} disabled={busy} onChange={(e) => { setCommercial(e.target.checked); if (!e.target.checked) { setYourBrand(false); setBranded(false); } }} />
                  </label>
                  <p className="text-xs text-muted-text">Turn on if this video promotes yourself, a brand, product or service.</p>
                  {commercial && (
                    <div className="space-y-2 pt-1">
                      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={yourBrand} disabled={busy} onChange={(e) => setYourBrand(e.target.checked)} /><span><span className="font-medium">Your brand</span><br /><span className="text-xs text-muted-text">You&apos;re promoting yourself or your own business. Labelled &quot;Promotional content&quot;.</span></span></label>
                      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={branded} disabled={busy} onChange={(e) => { setBranded(e.target.checked); if (e.target.checked && privacy === "SELF_ONLY") setPrivacy(""); }} /><span><span className="font-medium">Branded content</span><br /><span className="text-xs text-muted-text">You&apos;re promoting another brand or a third party. Labelled &quot;Paid partnership&quot;.</span></span></label>
                      {!yourBrand && !branded && <p className="text-xs text-destructive">Choose at least one to continue.</p>}
                    </div>
                  )}
                </fieldset>
                <p className="text-xs text-muted-text">
                  The video will be labelled as AI-generated content. By posting, you agree to TikTok&apos;s{" "}
                  {commercial && branded && (<><a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" className="text-primary hover:underline">Branded Content Policy</a> and </>)}
                  <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" className="text-primary hover:underline">Music Usage Confirmation</a>.
                </p>
              </>
            )}

            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-text"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> {stepLabel[phase]}</p>
            )}
            {msg && <p className={cx("rounded-lg px-3 py-2 text-sm", phase === "failed" ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>{phase === "done" && <Check className="mr-1 inline size-4" aria-hidden="true" />}{msg}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={close}>{phase === "done" ? "Close" : "Cancel"}</Button>
              {phase !== "done" && (
                <Button onClick={() => void post()} disabled={!canPost} loading={busy}>
                  {phase === "failed" ? "Try again" : mode === "draft" ? "Send to TikTok" : "Post"}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-text">After you post, it can take a few minutes for TikTok to process the video and show it on your profile.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
