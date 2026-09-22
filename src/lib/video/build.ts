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
    (a) => a.kind === "image" && a.source === "local-draft" && a.status === "ready" && (a.approval === "approved" || a.approval === "used") && a.sceneIds.includes(sceneId),
  );
}

function voiceFor(sceneId: string, assets: MediaAsset[]): MediaAsset | undefined {
  return assets.find(
    (a) => a.kind === "voice" && a.source === "local-draft" && a.status === "ready" && a.sceneIds.includes(sceneId),
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
    clips.push({
      ...clipBase("track_text", "text", scene?.title ?? `Scene ${seg.number}`, seg.startSec, Math.min(4, seg.durationSec)),
      sceneId: seg.sceneId,
      text: scene?.title ?? `Scene ${seg.number}`,
      style: {
        font: "system-ui, sans-serif",
        size: 40,
        weight: 700,
        align: "left",
        position: "top",
        color: "#ffffff",
        background: "rgba(0,0,0,0.55)",
        opacity: 1,
      },
    });
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

export function durationOf(clips: TimelineClip[]): number {
  return clips.reduce((n, c) => Math.max(n, c.startSec + c.durationSec), 0);
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

  if (scenes.length === 0) {
    issues.push({ severity: "block", message: "No scenes on the board.", fix: "Build scenes in the Storyboard first." });
    return issues;
  }
  if (comp.clips.length === 0) {
    issues.push({ severity: "block", message: "Timeline is empty.", fix: "Auto-build from scenes or add clips manually." });
  }

  for (const seg of sceneSegments(scenes)) {
    const sceneClips = comp.clips.filter((c) => c.sceneId === seg.sceneId);
    const hasVisual = sceneClips.some((c) => c.kind === "image" || c.kind === "video");
    if (!hasVisual) {
      issues.push({
        severity: "block",
        scene: seg.title,
        message: `Scene ${seg.number} has no visual asset.`,
        fix: "Generate a still, upload footage, or assign a library asset to the scene.",
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
    } else if (asset.source === "upload-session") {
      issues.push({ severity: "warn", message: `Clip “${clip.name}” uses a session upload.`, fix: "Re-upload if bytes expired; storage persists in Phase 11." });
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
