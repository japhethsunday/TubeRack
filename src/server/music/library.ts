/**
 * Royalty-free background music from Openverse (Jamendo, ccMixter, Freesound
 * and other open libraries). Only tracks licensed for commercial use are
 * returned, vocal tracks are filtered out, and each track carries the credit
 * line its license asks for.
 */
const API = "https://api.openverse.org/v1/audio/";
const UA = "TubeRack/1.0 (background music search)";

export const MUSIC_MOODS = {
  piano: { label: "Piano", query: "piano instrumental" },
  keyboard: { label: "Keyboard", query: "keyboard synth instrumental" },
  motivational: { label: "Motivational", query: "motivational instrumental" },
  inspirational: { label: "Inspirational", query: "inspirational instrumental" },
  cinematic: { label: "Cinematic", query: "cinematic instrumental" },
  lofi: { label: "Lo-fi", query: "lofi chill instrumental" },
  ambient: { label: "Ambient", query: "ambient background" },
  corporate: { label: "Upbeat", query: "upbeat corporate background" },
} as const;
export type MusicMoodId = keyof typeof MUSIC_MOODS;

export interface LibraryTrack {
  id: string;
  title: string;
  creator: string;
  source: string;
  license: string;
  licenseUrl: string;
  attribution: string;
  durationSec: number | null;
  previewUrl: string;
  fileType: string;
}

const VOCAL = /\b(vocal|vocals|voice|lyrics?|sing(?:ing|er)?|rap|acapella|a cappella|spoken|podcast|speech|narration|feat\.?|ft\.)\b/i;
const OK_TYPES = new Set(["mp3", "wav"]);

type Raw = {
  id?: string;
  title?: string;
  creator?: string;
  source?: string;
  provider?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
  attribution?: string;
  duration?: number | null;
  url?: string;
  filetype?: string | null;
  tags?: { name?: string }[];
  alt_files?: { url?: string; filetype?: string }[] | null;
};

function fileType(r: Raw): string {
  const t = (r.filetype || r.url?.split("?")[0].split(".").pop() || "").toLowerCase();
  return t === "mpeg" ? "mp3" : t;
}

export function toTrack(r: Raw): LibraryTrack | null {
  if (!r.id || !r.url) return null;
  const type = fileType(r);
  if (!OK_TYPES.has(type)) return null;
  const words = `${r.title ?? ""} ${(r.tags ?? []).map((t) => t.name ?? "").join(" ")}`;
  if (VOCAL.test(words)) return null;
  // Non-commercial and no-derivatives licenses are excluded by the search; double-check here.
  if (/nc|nd|sampling/i.test(r.license ?? "")) return null;
  const license = `${(r.license ?? "").toUpperCase() === "CC0" ? "CC0" : `CC ${(r.license ?? "").toUpperCase()}`} ${r.license_version ?? ""}`.trim();
  const title = (r.title || "Untitled").trim();
  const creator = (r.creator || "Unknown artist").trim();
  return {
    id: r.id,
    title,
    creator,
    source: r.source || r.provider || "",
    license,
    licenseUrl: r.license_url ?? "",
    attribution: r.attribution?.trim() || `"${title}" by ${creator}, ${license}${r.license_url ? ` (${r.license_url})` : ""}`,
    durationSec: typeof r.duration === "number" && r.duration > 0 ? Math.round(r.duration / 1000) : null,
    previewUrl: r.url,
    fileType: type,
  };
}

async function get(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Music library ${res.status}`);
  return res.json();
}

export async function searchLibraryMusic(mood: MusicMoodId, page = 1, extra = ""): Promise<LibraryTrack[]> {
  const q = `${MUSIC_MOODS[mood].query} ${extra}`.trim();
  const params = new URLSearchParams({
    q,
    license_type: "commercial,modification",
    category: "music",
    page_size: "40",
    page: String(Math.max(1, Math.min(10, page))),
    mature: "false",
  });
  const body = (await get(`${API}?${params}`)) as { results?: Raw[] };
  const tracks = (body.results ?? []).map(toTrack).filter((t): t is LibraryTrack => t !== null);
  // Background beds need some length: drop very short clips.
  return tracks.filter((t) => t.durationSec === null || t.durationSec >= 30).slice(0, 24);
}

export async function libraryTrack(id: string): Promise<LibraryTrack> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown track");
  const track = toTrack((await get(`${API}${id}/`)) as Raw);
  if (!track) throw new Error("This track can't be used (license or format).");
  return track;
}

/** Download the track's audio (size-capped) so it can be stored with the project. */
export async function downloadTrack(track: LibraryTrack, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; mime: string; ext: "mp3" | "wav" }> {
  const res = await fetch(track.previewUrl, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Track download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new Error("This track is too large to add.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error("This track is too large to add.");
  if (buf.byteLength < 10_000) throw new Error("The track file was empty.");
  const ext = track.fileType === "wav" ? "wav" : "mp3";
  return { bytes: buf, mime: ext === "wav" ? "audio/wav" : "audio/mpeg", ext };
}
