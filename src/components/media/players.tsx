"use client";

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

/** Speech preview via system TTS. Stops other playback first. */
export function SpeechPreview({ text, voiceName, rate, pitch, lang, label }: { text: string; voiceName?: string; rate: number; pitch: number; lang: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const releaseRef = useRef<() => void>(() => {});

  useEffect(() => () => {
    releaseRef.current();
    stopSpeech();
  }, []);

  function toggle() {
    if (playing) {
      stopSpeech();
      releaseRef.current();
      setPlaying(false);
      return;
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    releaseRef.current = claimPlayback(() => {
      stopSpeech();
      setPlaying(false);
    });
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 2000));
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.lang = lang;
    const match = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
    if (match) utterance.voice = match;
    utterance.onend = () => {
      releaseRef.current();
      setPlaying(false);
    };
    utterance.onerror = () => {
      releaseRef.current();
      setPlaying(false);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  return (
    <div className={cx(!supported && "opacity-60")}>
      <Controls
        playing={playing}
        onToggle={toggle}
        onRestart={() => {
          if (playing) {
            stopSpeech();
            releaseRef.current();
            setPlaying(false);
          }
          window.setTimeout(toggle, 60);
        }}
        progress={playing ? 0.5 : 0}
        label={label}
        durationLabel={supported ? `${Math.ceil(text.split(/\s+/).length / 2.5)}s est` : "TTS unsupported here"}
      />
      {!supported && <p className="mt-1 text-xs text-muted-text">Speech synthesis is unavailable in this browser.</p>}
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

/** Uploaded audio/video file preview from a session object URL. */
export function FilePreview({ url, mime, label }: { url: string; mime: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPlay = () => {
      claimPlayback(() => el.pause());
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [url]);

  if (mime.startsWith("video/")) {
    return (
      <video
        ref={ref as React.Ref<HTMLVideoElement>}
        src={url}
        controls
        playsInline
        aria-label={label}
        className="aspect-video w-full rounded-lg border border-border bg-black"
      />
    );
  }
  return (
    <audio ref={ref as React.Ref<HTMLAudioElement>} src={url} controls aria-label={label} className="w-full" />
  );
}

/** Draft image preview from generated SVG markup (our own escaped output). */
export function DraftImage({ svg, title }: { svg: string; title: string }) {
  return (
    <div
      role="img"
      aria-label={`Draft visual: ${title}`}
      className="overflow-hidden rounded-lg border border-border [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
