import type {
  ClipKind,
  Composition,
  HealthState,
  TimelineClip,
  TimelineTrack,
  ValidationIssue,
} from "@/src/lib/video/types";
import type { Scene } from "@/src/lib/script/types";
import type { MediaAsset } from "@/src/lib/media/types";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

/** For tests: deterministic ids. */
export function __resetVideoIds(): void {
  seq = 0;
}

const TRACK_DEFS: { kind: TimelineClip["kind"]; label: string }[] = [
  { kind: "video", label: "Video" },
  { kind: "image", label: "Images" },
  { kind: "voice", label: "Voice" },
  { kind: "music", label: "Music" },
  { kind: "sfx", label: "SFX" },
  { kind: "text", label: "Text" },
  { kind: "captions", label: "Captions" },
];

/** A new, uniquely-named track of a kind (V2, A2, T2…). */
export function newTrack(kind: TimelineClip["kind"], existing: TimelineTrack[]): TimelineTrack {
  const label = TRACK_DEFS.find((t) => t.kind === kind)?.label ?? kind;
  const n = existing.filter((t) => t.kind === kind).length + 1;
  return { id: nextId(`track_${kind}`), kind, label: `${label} ${n}`, muted: false, hidden: false };
}

export function defaultTracks(): TimelineTrack[] {
  return TRACK_DEFS.map((t) => ({
    id: `track_${t.kind}`,
    kind: t.kind,
    label: t.label,
    muted: false,
    hidden: false,
  }));
}

export function emptyComposition(projectId: string): Composition {
  return {
    projectId,
    tracks: defaultTracks(),
    clips: [],
    canvas: { preset: "youtube", aspect: "16:9", width: 1920, height: 1080 },
    updatedAt: new Date().toISOString(),
  };
}

function clipBase(trackId: string, kind: ClipKind, name: string, startSec: number, durationSec: number): TimelineClip {
  return {
    id: nextId("clip"),
    trackId,
    kind,
    name,
    startSec: Math.max(0, Math.round(startSec * 10) / 10),
    durationSec: Math.max(0.5, Math.round(durationSec * 10) / 10),
    volume: kind === "music" ? 0.35 : 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
  };
}

/** Split narration into sentence-timed caption clips across a span. Real derivation, editable after. */
export function captionsFromNarration(narration: string, startSec: number, totalSec: number): TimelineClip[] {
  const sentences =
    narration.match(/[^.!?]+[.!?]+["”)]?\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (sentences.length === 0 || totalSec <= 0) return [];
  const words = sentences.map((s) => Math.max(1, s.split(/\s+/).length));
  const totalWords = words.reduce((n, w) => n + w, 0);
  let cursor = startSec;
  return sentences.map((sentence, i) => {
    const share = words[i] / totalWords;
    const duration = Math.max(0.8, Math.round(totalSec * share * 10) / 10);
    const clip = {
      ...clipBase("track_captions", "captions", sentence.slice(0, 48), cursor, duration),
      text: sentence,
    };
    cursor = Math.round((cursor + duration) * 10) / 10;
    return clip;
  });
}

/**
 * Caption clips from real transcription timings (Gemini transcription segments),
 * offset to where the voice clip starts on the timeline. Pure.
 */
export function captionsFromSegments(
  segments: { startSec: number; endSec: number; text: string }[],
  offsetSec: number,
  clip?: { durationSec: number; inSec?: number; speed?: number },
): TimelineClip[] {
  // Audio time → timeline time for the voice clip (trim and speed applied),
  // kept in order, never overlapping, and inside the clip.
  const inSec = clip?.inSec ?? 0;
  const speed = clip?.speed && clip.speed > 0 ? clip.speed : 1;
  const limit = clip ? clip.durationSec : Infinity;
  const out: TimelineClip[] = [];
  let cursor = 0;
  for (const s of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    const text = s.text.trim();
    if (!text || !Number.isFinite(s.startSec) || !(s.endSec > s.startSec)) continue;
    let start = Math.max((s.startSec - inSec) / speed, cursor);
    let end = Math.min((s.endSec - inSec) / speed, limit);
    if (end <= 0 || start >= limit) continue;
    start = Math.max(0, start);
    if (end - start < 0.3) end = Math.min(limit, start + 0.3);
    if (end <= start) continue;
    start = Math.round(start * 100) / 100;
    end = Math.round(end * 100) / 100;
    cursor = end;
    out.push({
      ...clipBase("track_captions", "captions", text.slice(0, 48), Math.round((offsetSec + start) * 100) / 100, Math.round((end - start) * 100) / 100),
      text,
    });
  }
  return out;
}

export interface SceneSegment {
  sceneId: string;
  title: string;
  number: number;
  startSec: number;
  durationSec: number;
}

/** Scene segments tile the timeline start-to-end in board order. */
export function sceneSegments(scenes: Scene[]): SceneSegment[] {
  let cursor = 0;
  return scenes.map((s) => {
    const seg = {
      sceneId: s.id,
      title: s.title,
      number: s.number,
      startSec: Math.round(cursor * 10) / 10,
      durationSec: Math.max(1, s.durationSec),
    };
    cursor += seg.durationSec;
    return seg;
  });
}

function approvedImageFor(sceneId: string, assets: MediaAsset[]): MediaAsset | undefined {
  return assets.find(
    (a) => a.kind === "image" && a.source !== "provider-request" && a.status === "ready" && (a.approval === "approved" || a.approval === "used") && a.sceneIds.includes(sceneId),
  );
}

function voiceFor(sceneId: string, assets: MediaAsset[]): MediaAsset | undefined {
  return assets.find(
    (a) => a.kind === "voice" && a.source !== "provider-request" && a.status === "ready" && a.sceneIds.includes(sceneId),
  );
}

/**
 * Auto-build: one image + voice + title-text + captions per scene from
 * approved/assigned assets. Uploads resolve via session URLs at preview
 * time; provider requests are skipped with a validation issue, never faked.
 */
export function buildFromScenes(scenes: Scene[], assets: MediaAsset[]): TimelineClip[] {
  const clips: TimelineClip[] = [];
  for (const seg of sceneSegments(scenes)) {
    const scene = scenes.find((s) => s.id === seg.sceneId);
    const image = approvedImageFor(seg.sceneId, assets);
    if (image) {
      clips.push({
        ...clipBase("track_image", "image", image.title, seg.startSec, seg.durationSec),
        sceneId: seg.sceneId,
        assetId: image.id,
        motion: "kenburns",
      });
    }
    const voice = voiceFor(seg.sceneId, assets);
    if (voice) {
      clips.push({
        ...clipBase("track_voice", "voice", voice.title, seg.startSec, Math.min(seg.durationSec, voice.durationSec ?? seg.durationSec)),
        sceneId: seg.sceneId,
        assetId: voice.id,
      });
    }
    // On-screen text is the scene's overlay copy — never the script heading.
    const overlay = scene?.onScreenText?.trim();
    if (overlay) {
      clips.push({
        ...clipBase("track_text", "text", overlay, seg.startSec, Math.min(4, seg.durationSec)),
        sceneId: seg.sceneId,
        text: overlay,
        textAnim: "pop",
        style: {
          font: "system-ui, sans-serif",
          size: 52,
          weight: 800,
          align: "center",
          position: "top",
          color: "#ffffff",
          background: "transparent",
          opacity: 1,
        },
      });
    }
    const narration = scene?.narration?.trim() || scene?.scriptText?.trim() || "";
    for (const cap of captionsFromNarration(narration, seg.startSec, seg.durationSec)) {
      clips.push({ ...cap, sceneId: seg.sceneId });
    }
  }
  // Project music beds span the whole timeline.
  const total = sceneSegments(scenes).reduce((n, s) => n + s.durationSec, 0);
  const bed = assets.find((a) => a.kind === "music" && a.source === "local-draft" && a.status === "ready" && (a.approval === "approved" || a.approval === "used"));
  if (bed && total > 0) {
    clips.push({
      ...clipBase("track_music", "music", bed.title, 0, total),
      assetId: bed.id,
      fadeInSec: 1,
      fadeOutSec: 2,
    });
  }
  return clips;
}

/**
 * Timeline length: where the content ends. Background music never makes the
 * video longer than its visuals, voice and text (a 2-hour song under a
 * 3-minute video is a 3-minute video); music alone counts only when it's all
 * there is.
 */
export function durationOf(clips: TimelineClip[]): number {
  const end = (list: TimelineClip[]) => list.reduce((n, c) => Math.max(n, c.startSec + c.durationSec), 0);
  const content = end(clips.filter((c) => c.kind !== "music"));
  return content > 0 ? content : end(clips);
}

export function clipsAt(clips: TimelineClip[], timeSec: number): TimelineClip[] {
  return clips.filter((c) => timeSec >= c.startSec && timeSec < c.startSec + c.durationSec);
}

export function sceneAt(segments: SceneSegment[], timeSec: number): SceneSegment | null {
  return segments.find((s) => timeSec >= s.startSec && timeSec < s.startSec + s.durationSec) ?? null;
}

/** Export validation with actionable fixes. No scores, no vague failures. */
export function validateComposition(comp: Composition, scenes: Scene[], assets: MediaAsset[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(assets.map((a) => [a.id, a]));

  if (comp.clips.length === 0) {
    issues.push({ severity: "block", message: "Timeline is empty.", fix: "Import a video, or auto-build from storyboard scenes." });
    return issues;
  }
  if (!comp.clips.some((c) => c.kind === "image" || c.kind === "video" || c.kind === "text")) {
    issues.push({ severity: "block", message: "Nothing visible on the timeline.", fix: "Add a video, image, or text clip." });
  }

  // Storyboard checks only apply when the timeline was built from scenes.
  const sceneBuilt = comp.clips.some((c) => c.sceneId);
  for (const seg of sceneBuilt ? sceneSegments(scenes) : []) {
    const sceneClips = comp.clips.filter((c) => c.sceneId === seg.sceneId);
    const hasVisual = sceneClips.some((c) => c.kind === "image" || c.kind === "video");
    if (!hasVisual) {
      issues.push({
        severity: "warn",
        scene: seg.title,
        message: `Scene ${seg.number} has no visual yet — it will show the background.`,
        fix: "Use Media → Images for all scenes, upload footage, or assign a library asset.",
      });
    }
    const scene = scenes.find((s) => s.id === seg.sceneId);
    const narrationWords = (scene?.narration || scene?.scriptText || "").trim().split(/\s+/).filter(Boolean).length;
    const voiceClip = sceneClips.find((c) => c.kind === "voice");
    if (narrationWords > 20 && !voiceClip) {
      issues.push({
        severity: "warn",
        scene: seg.title,
        message: `Scene ${seg.number} has narration but no voice clip.`,
        fix: "Record a take in the Voice studio and assign it to the scene.",
      });
    }
    if (voiceClip?.assetId) {
      const asset = byId.get(voiceClip.assetId);
      const voiceSec = asset?.durationSec ?? voiceClip.durationSec;
      if (voiceSec > seg.durationSec + 1) {
        issues.push({
          severity: "warn",
          scene: seg.title,
          message: `Scene ${seg.number} voiceover (${voiceSec.toFixed(0)}s) exceeds scene duration (${seg.durationSec.toFixed(0)}s).`,
          fix: "Trim the take, extend the scene in the Storyboard, or accept the overlap.",
        });
      }
    }
    if (seg.durationSec > 90) {
      issues.push({
        severity: "warn",
        scene: seg.title,
        message: `Scene ${seg.number} runs long (~${seg.durationSec.toFixed(0)}s).`,
        fix: "Consider splitting it in the Storyboard.",
      });
    }
  }

  for (const clip of comp.clips) {
    if (!clip.assetId) continue;
    const asset = byId.get(clip.assetId);
    if (!asset) {
      issues.push({ severity: "block", message: `Clip “${clip.name}” points at a deleted asset.`, fix: "Remove or relink the clip." });
    } else if (asset.source === "provider-request") {
      issues.push({ severity: "block", message: `Clip “${clip.name}” uses a provider request, not media.`, fix: "Replace with a draft or upload — requests submit in Phase 11." });
    }
    if (clip.durationSec <= 0 || clip.startSec < 0) {
      issues.push({ severity: "block", message: `Clip “${clip.name}” has an invalid range.`, fix: "Adjust start/duration in the inspector." });
    }
  }
  return issues;
}

export function healthOf(issues: ValidationIssue[]): "ready" | "review" | "blocked" {
  if (issues.some((i) => i.severity === "block")) return "blocked";
  if (issues.some((i) => i.severity === "warn")) return "review";
  return "ready";
}
