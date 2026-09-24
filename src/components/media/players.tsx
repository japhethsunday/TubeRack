"use client";

import { sanitizeSvg } from "@/src/lib/security/svg";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Volume2 } from "lucide-react";
import { stopSpeech } from "@/src/lib/media/audio";
import { cx } from "@/src/components/ui/cx";

/**
 * Exclusive playback: starting any preview stops the others (speech +
 * WebAudio + media elements). Module-level coordinator, no backend.
 */
type Stopper = () => void;
let current: { id: number; stop: Stopper } | null = null;
let seq = 0;

export function claimPlayback(stop: Stopper): () => void {
  const id = (seq += 1);
  current?.stop();
  current = { id, stop };
  return () => {
    if (current?.id === id) current = null;
  };
}

export function stopAllPlayback(): void {
  current?.stop();
  current = null;
  stopSpeech();
}

function Controls({
  playing,
  onToggle,
  onRestart,
  progress,
  label,
  durationLabel,
  volume,
  onVolume,
}: {
  playing: boolean;
  onToggle: () => void;
  onRestart: () => void;
  progress: number;
  label: string;
  durationLabel: string;
  volume?: number;
  onVolume?: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        aria-pressed={playing}
        className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
      >
        {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
      </button>
      <button
        type="button"
        onClick={onRestart}
        aria-label={`Restart ${label}`}
        className="rounded-md p-2 text-muted-text hover:bg-muted hover:text-foreground"
      >
        <RotateCcw className="size-4" aria-hidden="true" />
      </button>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full bg-primary transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-text">{durationLabel}</span>
      {onVolume && (
        <label className="flex shrink-0 items-center gap-1 text-muted-text">
          <Volume2 className="size-4" aria-hidden="true" />
          <span className="sr-only">Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume ?? 1}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="w-16"
          />
        </label>
      )}
    </div>
  );
}

/** Split text into sentence-sized pieces; browsers stop long single utterances early. */
function speechChunks(text: string): string[] {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (cur && cur.length + p.length > 220) {
      out.push(cur.trim());
      cur = "";
    }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Speech preview via system TTS: reads the full text, with real progress. Stops other playback first. */
export function SpeechPreview({ text, voiceName, rate, pitch, lang, label }: { text: string; voiceName?: string; rate: number; pitch: number; lang: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const releaseRef = useRef<() => void>(() => {});
  const runRef = useRef(0);

  useEffect(() => () => {
    runRef.current += 1;
    releaseRef.current();
    stopSpeech();
  }, []);

  function stop() {
    runRef.current += 1;
    stopSpeech();
    releaseRef.current();
    setPlaying(false);
  }

  function start() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const run = (runRef.current += 1);
    releaseRef.current = claimPlayback(() => {
      runRef.current += 1;
      stopSpeech();
      setPlaying(false);
    });
    const chunks = speechChunks(text);
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
    window.speechSynthesis.cancel();
    setProgress(0);
    setPlaying(true);
    const speak = (i: number) => {
      if (run !== runRef.current) return;
      if (i >= chunks.length) {
        releaseRef.current();
        setPlaying(false);
        setProgress(1);
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[i]);
      u.rate = rate;
      u.pitch = pitch;
      u.lang = lang;
      if (voice) u.voice = voice;
      u.onend = () => {
        setProgress((i + 1) / chunks.length);
        speak(i + 1);
      };
      u.onerror = () => {
        if (run !== runRef.current) return;
        releaseRef.current();
        setPlaying(false);
      };
      window.speechSynthesis.speak(u);
    };
    speak(0);
  }

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const words = text.split(/\s+/).filter(Boolean).length;
  const total = Math.ceil(words / (2.5 * rate));

  return (
    <div className={cx(!supported && "opacity-60")}>
      <Controls
        playing={playing}
        onToggle={() => (playing ? stop() : start())}
        onRestart={() => {
          stop();
          window.setTimeout(start, 60);
        }}
        progress={progress}
        label={label}
        durationLabel={supported ? `~${fmtTime(total)}` : "Unavailable"}
      />
      {!supported && <p className="mt-1 text-xs text-muted-text">Speech preview is unavailable in this browser.</p>}
    </div>
  );
}

/** Buffer preview for synthesized music/SFX with seek + volume. */
export function BufferPreview({ buffer, context, label }: { buffer: AudioBuffer | null; context: AudioContext | null; label: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const nodes = useRef<{ source?: AudioBufferSourceNode; gain?: GainNode; release?: () => void }>({});
  const raf = useRef(0);
  const startedAt = useRef(0);
  const offset = useRef(0);

  function teardown() {
    window.cancelAnimationFrame(raf.current);
    try {
      nodes.current.source?.stop();
    } catch {
      // Already stopped.
    }
    nodes.current.source?.disconnect();
    nodes.current = {};
  }

  useEffect(() => () => {
    teardown();
    nodes.current.release?.();
  }, []);

  if (!buffer || !context) {
    return <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-text">Render a preview first — audio synthesizes on-device.</p>;
  }
  const duration = buffer.duration;

  function tick() {
    const elapsed = offset.current + (context as AudioContext).currentTime - startedAt.current;
    setProgress(Math.min(1, elapsed / duration));
    if (elapsed >= duration) {
      stop();
      return;
    }
    raf.current = window.requestAnimationFrame(tick);
  }

  function play(from = 0) {
    teardown();
    const release = claimPlayback(stop);
    nodes.current.release = release;
    const source = context!.createBufferSource();
    source.buffer = buffer;
    const gain = context!.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(context!.destination);
    startedAt.current = context!.currentTime;
    offset.current = from;
    source.onended = () => {
      if (nodes.current.source === source) {
        release();
        setPlaying(false);
        setProgress(from >= duration ? 1 : progress);
      }
    };
    source.start(0, from % duration);
    nodes.current.source = source;
    nodes.current.gain = gain;
    setPlaying(true);
    raf.current = window.requestAnimationFrame(tick);
  }

  function stop() {
    teardown();
    nodes.current.release?.();
    nodes.current.release = undefined;
    setPlaying(false);
  }

  return (
    <Controls
      playing={playing}
      onToggle={() => (playing ? stop() : play(offset.current >= duration ? 0 : offset.current))}
      onRestart={() => play(0)}
      progress={progress}
      label={label}
      durationLabel={`${duration.toFixed(1)}s`}
      volume={volume}
      onVolume={(v) => {
        setVolume(v);
        if (nodes.current.gain && context) nodes.current.gain.gain.setValueAtTime(v, context.currentTime);
      }}
    />
  );
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

/**
 * Media player for audio and video files (uploads, generated voice, music):
 * play/pause, draggable seek bar, elapsed/total time, ±10 s skip, speed,
 * volume, a loading state, and a clear error with Retry instead of a
 * silent dead control. Only one preview plays at a time.
 */
export function MediaPlayer({ url, mime, label }: { url: string; mime: string; label: string }) {
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const isVideo = mime.startsWith("video/");
  // Retry re-requests the file (fresh signed link for stored files).
  const src = attempt === 0 || url.startsWith("blob:") || url.startsWith("data:") ? url : `${url}${url.includes("?") ? "&" : "?"}r=${attempt}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let release: () => void = () => {};
    const on = {
      play: () => {
        release = claimPlayback(() => el.pause());
        setPlaying(true);
      },
      pause: () => {
        release();
        setPlaying(false);
      },
      ended: () => {
        release();
        setPlaying(false);
      },
      timeupdate: () => setTime(el.currentTime),
      durationchange: () => setDuration(Number.isFinite(el.duration) ? el.duration : 0),
      loadedmetadata: () => {
        setDuration(Number.isFinite(el.duration) ? el.duration : 0);
        setBuffering(false);
      },
      canplay: () => setBuffering(false),
      waiting: () => setBuffering(true),
      playing: () => setBuffering(false),
      error: () => {
        setBuffering(false);
        setPlaying(false);
        const code = el.error?.code;
        setError(
          code === 4
            ? "This file can't be played in this browser, or it is no longer available."
            : code === 2
              ? "The file couldn't be downloaded. Check your connection and retry."
              : "Playback failed. Retry, or download the file to play it on your device.",
        );
      },
    };
    for (const [k, fn] of Object.entries(on)) el.addEventListener(k, fn);
    return () => {
      for (const [k, fn] of Object.entries(on)) el.removeEventListener(k, fn);
      release();
    };
  }, [src]);

  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed, src]);

  if (!url) {
    return <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-text">No file yet.</p>;
  }

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "NotAllowedError") return;
        setError("Playback failed. Retry, or download the file to play it on your device.");
      });
    } else el.pause();
  }

  function seek(to: number) {
    const el = ref.current;
    if (!el || !duration) return;
    el.currentTime = Math.max(0, Math.min(duration, to));
    setTime(el.currentTime);
  }

  function retry() {
    setError(null);
    setBuffering(true);
    setTime(0);
    setAttempt((n) => n + 1);
  }

  const common = {
    src,
    preload: "metadata" as const,
    playsInline: true,
    "aria-label": label,
    onClick: isVideo ? toggle : undefined,
  };

  return (
    <div className="space-y-2">
      {isVideo ? (
        <div className="relative overflow-hidden rounded-lg border border-border bg-black">
          <video ref={ref as React.Ref<HTMLVideoElement>} {...common} className="aspect-video w-full cursor-pointer" />
          {buffering && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            </div>
          )}
        </div>
      ) : (
        <audio ref={ref as React.Ref<HTMLAudioElement>} {...common} className="hidden" />
      )}

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" onClick={retry} className="rounded-md border border-destructive/40 px-2.5 py-1 font-medium hover:bg-destructive/10">
            Retry
          </button>
        </div>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-surface p-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? `Pause ${label}` : `Play ${label}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90"
            >
              {buffering && playing ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" aria-hidden="true" />
              ) : playing ? (
                <Pause className="size-4" aria-hidden="true" />
              ) : (
                <Play className="size-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(time, duration || 0)}
              onChange={(e) => seek(Number(e.target.value))}
              disabled={!duration}
              aria-label={`Seek ${label}`}
              className="h-1.5 w-full min-w-16 flex-1 cursor-pointer accent-[var(--primary)]"
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-0.5 text-[11px] text-muted-text">
            <span className="tabular-nums">
              {fmtTime(time)} / {buffering && !duration ? "…" : fmtTime(duration)}
            </span>
            <span className="flex items-center gap-0.5">
              <button type="button" onClick={() => seek(time - 10)} aria-label="Back 10 seconds" className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
                −10s
              </button>
              <button type="button" onClick={() => seek(time + 10)} aria-label="Forward 10 seconds" className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground">
                +10s
              </button>
              <button
                type="button"
                onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}
                aria-label={`Playback speed ${speed}×`}
                className="rounded-md px-1.5 py-0.5 tabular-nums hover:bg-muted hover:text-foreground"
              >
                {speed}×
              </button>
              <button
                type="button"
                onClick={() => setVolume((v) => (v > 0 ? 0 : 1))}
                aria-label={volume > 0 ? "Mute" : "Unmute"}
                className="rounded-md p-1 hover:bg-muted hover:text-foreground"
              >
                <Volume2 className={cx("size-3.5", volume === 0 && "opacity-40")} aria-hidden="true" />
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Audio/video file preview (kept for existing call sites). */
export function FilePreview(props: { url: string; mime: string; label: string }) {
  return <MediaPlayer {...props} />;
}

/** Draft image preview from generated SVG markup (our own escaped output). */
export function DraftImage({ svg, title }: { svg: string; title: string }) {
  return (
    <div
      role="img"
      aria-label={`Draft visual: ${title}`}
      className="overflow-hidden rounded-lg border border-border [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
