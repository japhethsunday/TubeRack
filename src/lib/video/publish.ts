import type { TimelineClip } from "@/src/lib/video/types";

/**
 * Pure helpers that turn a finished production (timeline + packaging) into
 * YouTube-ready metadata. Limits follow the YouTube Data API.
 */

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
export const YT_TAGS_MAX_CHARS = 500;

export const YT_CATEGORIES: { id: string; label: string }[] = [
  { id: "27", label: "Education" },
  { id: "24", label: "Entertainment" },
  { id: "28", label: "Science & Technology" },
  { id: "26", label: "Howto & Style" },
  { id: "22", label: "People & Blogs" },
  { id: "20", label: "Gaming" },
  { id: "10", label: "Music" },
  { id: "17", label: "Sports" },
  { id: "25", label: "News & Politics" },
  { id: "23", label: "Comedy" },
  { id: "19", label: "Travel & Events" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "15", label: "Pets & Animals" },
  { id: "1", label: "Film & Animation" },
  { id: "29", label: "Nonprofits & Activism" },
];

export function categoryId(label: string): string {
  return YT_CATEGORIES.find((c) => c.label.toLowerCase() === label.trim().toLowerCase())?.id ?? "22";
}

const LANGS: Record<string, string> = { english: "en", spanish: "es", french: "fr", german: "de", yoruba: "yo", hausa: "ha", igbo: "ig", portuguese: "pt", hindi: "hi", arabic: "ar" };

export function languageCode(name: string): string {
  const n = name.trim().toLowerCase();
  if (/^[a-z]{2}(-[A-Za-z]{2})?$/.test(name.trim())) return name.trim();
  return LANGS[n] ?? "en";
}

export function clampTitle(title: string): string {
  // YouTube rejects < and > in titles.
  return title.replace(/[<>]/g, "").trim().slice(0, YT_TITLE_MAX);
}

export function fmtTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Description with chapters and hashtags appended when missing. YouTube only
 * turns timestamps into chapters when the first is 0:00 and there are ≥ 3,
 * each ≥ 10 s apart — otherwise chapters are omitted.
 */
export function buildDescription(input: { description: string; chapters: { timeSec: number; title: string }[]; hashtags: string[] }): string {
  let body = input.description.replace(/[<>]/g, "").trim();
  const chapters = [...input.chapters].filter((c) => c.title.trim()).sort((a, b) => a.timeSec - b.timeSec);
  const validChapters =
    chapters.length >= 3 && chapters[0].timeSec === 0 && chapters.every((c, i) => i === 0 || c.timeSec - chapters[i - 1].timeSec >= 10);
  if (validChapters && !/\b0:00\b/.test(body)) {
    body += `\n\nChapters\n${chapters.map((c) => `${fmtTimestamp(c.timeSec)} ${c.title.trim()}`).join("\n")}`;
  }
  const tags = input.hashtags.map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1);
  const missing = tags.filter((h) => !body.toLowerCase().includes(h.toLowerCase())).slice(0, 15);
  if (missing.length) body += `\n\n${missing.join(" ")}`;
  return body.slice(0, YT_DESCRIPTION_MAX);
}

/** Dedupe, strip invalid characters, and fit YouTube's 500-character tag budget (multi-word tags count their quotes). */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let used = 0;
  for (const raw of tags) {
    const t = raw.replace(/[<>,#]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
    if (!t || seen.has(t.toLowerCase())) continue;
    const cost = t.length + (t.includes(" ") ? 2 : 0) + (out.length ? 1 : 0);
    if (used + cost > YT_TAGS_MAX_CHARS) continue;
    used += cost;
    seen.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

function vttTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

/** WebVTT from the captions track (hidden captions tracks are excluded by the caller). */
export function buildVtt(clips: TimelineClip[]): string | null {
  const cues = clips
    .filter((c) => c.kind === "captions" && c.text?.trim() && c.durationSec > 0)
    .sort((a, b) => a.startSec - b.startSec);
  if (!cues.length) return null;
  return ["WEBVTT", "", ...cues.map((c, i) => `${i + 1}\n${vttTime(c.startSec)} --> ${vttTime(c.startSec + c.durationSec)}\n${c.text!.trim()}\n`)].join("\n");
}

/** YouTube's publishAt must be in the future (server enforces a 15-minute margin). */
export function scheduleError(localValue: string, now = Date.now()): string | null {
  if (!localValue) return null;
  const t = new Date(localValue).getTime();
  if (!Number.isFinite(t)) return "Pick a valid date and time.";
  if (t < now + 15 * 60_000) return "Schedule at least 15 minutes from now.";
  return null;
}

/**
 * Release slot for the k-th video of a batch (k = 0 posts now): one per day
 * at 17:00 local time, when Shorts viewing peaks. Returns a datetime-local
 * value ("YYYY-MM-DDTHH:mm"), or "" for "post now".
 */
export function releaseSlot(k: number, now = new Date(), hour = 17): string {
  if (k <= 0) return "";
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + k);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ReleaseTime = "now" | "morning" | "afternoon" | "evening";
export const RELEASE_HOURS: Record<Exclude<ReleaseTime, "now">, number> = { morning: 9, afternoon: 14, evening: 19 };

/**
 * When the k-th video of a batch goes out, in the viewer's local time.
 * "now": the first posts at once, the rest daily at 5 PM. A time of day:
 * one a day at that hour, starting today if it's still ahead, else tomorrow.
 * null means "post now".
 */
export function releaseAt(k: number, when: ReleaseTime = "now", startInDays = 0, now = new Date()): Date | null {
  const d = new Date(now);
  if (when === "now") {
    if (k <= 0 && startInDays <= 0) return null;
    d.setHours(17, 0, 0, 0);
    d.setDate(d.getDate() + startInDays + k);
    return d;
  }
  d.setHours(RELEASE_HOURS[when], 0, 0, 0);
  d.setDate(d.getDate() + startInDays);
  // Too close or already past today: begin tomorrow (YouTube needs some lead time).
  if (d.getTime() < now.getTime() + 20 * 60_000) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + k);
  return d;
}

/** A Date as the local "YYYY-MM-DDTHH:mm" the publish form uses. */
export function localSlot(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
