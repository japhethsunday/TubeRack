import { createHmac, timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/src/lib/env";

/**
 * Royalty-free background music from Openverse (Jamendo, ccMixter, Freesound
 * and other open libraries). Only tracks licensed for commercial use are
 * returned, vocal tracks are filtered out, and each track carries the credit
 * line its license asks for.
 */
const API = "https://api.openverse.org/v1/audio/";
const UA = "TubeRack/1.0 (background music search)";

export const MUSIC_MOODS = {
  piano: { label: "Piano", query: "piano instrumental", tags: "piano" },
  keyboard: { label: "Keyboard", query: "keyboard synth instrumental", tags: "synthesizer electronic" },
  motivational: { label: "Motivational", query: "motivational instrumental", tags: "motivational energetic" },
  inspirational: { label: "Inspirational", query: "inspirational instrumental", tags: "inspiring uplifting" },
  cinematic: { label: "Cinematic", query: "cinematic instrumental", tags: "soundtrack epic" },
  lofi: { label: "Lo-fi", query: "lofi chill instrumental", tags: "lofi chillout" },
  ambient: { label: "Ambient", query: "ambient background", tags: "ambient" },
  corporate: { label: "Upbeat", query: "upbeat corporate background", tags: "corporate pop" },
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

// ---- Jamendo (primary when a client ID is set): instrumental filter, CC licenses. ----
const JAMENDO = "https://api.jamendo.com/v3.0/tracks/";

type JamendoRaw = {
  id?: string;
  name?: string;
  artist_name?: string;
  duration?: number;
  audio?: string;
  audiodownload?: string;
  audiodownload_allowed?: boolean;
  license_ccurl?: string;
  shareurl?: string;
};

/** "https://creativecommons.org/licenses/by-sa/3.0/" → "CC BY-SA 3.0" (null for anything non-commercial or no-derivatives). */
export function licenseFromUrl(url: string): string | null {
  const m = /licenses\/([a-z-]+)\/([\d.]+)/i.exec(url);
  if (!m) return /publicdomain\/zero/i.test(url) ? "CC0" : null;
  const kind = m[1].toLowerCase();
  if (/nc|nd/.test(kind)) return null;
  return `CC ${kind.toUpperCase()} ${m[2]}`;
}

export function jamendoTrack(r: JamendoRaw): LibraryTrack | null {
  const file = r.audiodownload_allowed !== false && r.audiodownload ? r.audiodownload : r.audio;
  if (!r.id || !file || !r.license_ccurl) return null;
  const license = licenseFromUrl(r.license_ccurl);
  if (!license) return null;
  const title = (r.name || "Untitled").trim();
  if (VOCAL.test(title)) return null;
  const creator = (r.artist_name || "Unknown artist").trim();
  return {
    id: `jm-${r.id}`,
    title,
    creator,
    source: "jamendo",
    license,
    licenseUrl: r.license_ccurl,
    attribution: `"${title}" by ${creator} (Jamendo), ${license} — ${r.license_ccurl}`,
    durationSec: typeof r.duration === "number" && r.duration > 0 ? Math.round(r.duration) : null,
    previewUrl: r.audio || file,
    fileType: "mp3",
  };
}

/** The file to store for a Jamendo track (full download when the artist allows it). */
const jamendoFiles = new Map<string, string>();

async function jamendoSearch(clientId: string, mood: MusicMoodId, page: number, extra: string, broad = false): Promise<LibraryTrack[]> {
  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: "40",
    offset: String((Math.max(1, Math.min(20, page)) - 1) * 40),
    vocalinstrumental: "instrumental",
    fuzzytags: MUSIC_MOODS[mood].tags.replace(/ /g, "+"),
    audioformat: "mp32",
    order: "popularity_total",
    durationbetween: "45_900",
    ccnc: "false",
    ccnd: "false",
  });
  if (extra) params.set("search", extra);
  if (broad) {
    params.delete("fuzzytags");
    params.set("search", MUSIC_MOODS[mood].query.split(" ")[0]);
    params.set("order", "relevance");
  }
  const body = (await get(`${JAMENDO}?${params}`)) as { headers?: { status?: string; error_message?: string }; results?: JamendoRaw[] };
  if (body.headers?.status && body.headers.status !== "success") throw new Error(`Music library: ${body.headers.error_message ?? body.headers.status}`);
  const out: LibraryTrack[] = [];
  for (const r of body.results ?? []) {
    const t = jamendoTrack(r);
    if (!t) continue;
    if (r.audiodownload_allowed !== false && r.audiodownload) jamendoFiles.set(t.id, r.audiodownload);
    out.push(t);
  }
  return out.slice(0, 24);
}

async function jamendoOne(clientId: string, id: string): Promise<LibraryTrack> {
  const params = new URLSearchParams({ client_id: clientId, format: "json", id: id.slice(3), audioformat: "mp32" });
  const body = (await get(`${JAMENDO}?${params}`)) as { results?: JamendoRaw[] };
  const raw = body.results?.[0];
  const t = raw ? jamendoTrack(raw) : null;
  if (!t || !raw) throw new Error("This track can't be used (license or format).");
  if (raw.audiodownload_allowed !== false && raw.audiodownload) jamendoFiles.set(t.id, raw.audiodownload);
  return t;
}

export function isMusicLibraryConfigured(): boolean {
  return Boolean(getServerEnv().JAMENDO_CLIENT_ID);
}

export async function searchLibraryMusic(mood: MusicMoodId, page = 1, extra = ""): Promise<LibraryTrack[]> {
  const clientId = getServerEnv().JAMENDO_CLIENT_ID;
  if (clientId) {
    // Jamendo sometimes answers empty or fails; the open library is the backup.
    const tracks = await jamendoSearch(clientId, mood, page, extra).catch((e) => {
      console.warn("[music] jamendo failed", e instanceof Error ? e.message : e);
      return [] as LibraryTrack[];
    });
    if (tracks.length) return tracks;
    // Empty answers happen now and then: retry broader (no extra words, loose tags) before the fallback.
    const retry = await jamendoSearch(clientId, mood, page, "", true).catch(() => [] as LibraryTrack[]);
    if (retry.length) return retry;
  }
  return openverseSearch(mood, page, extra);
}

async function openverseSearch(mood: MusicMoodId, page = 1, extra = ""): Promise<LibraryTrack[]> {
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
  if (/^jm-\d+$/.test(id)) {
    const clientId = getServerEnv().JAMENDO_CLIENT_ID;
    if (!clientId) throw new Error("Unknown track");
    return jamendoOne(clientId, id);
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown track");
  const track = toTrack((await get(`${API}${id}/`)) as Raw);
  if (!track) throw new Error("This track can't be used (license or format).");
  return track;
}

/** Sign a track's audio link into the preview URL, so any server instance can play it without a lookup. */
function sign(value: string): string {
  const secret = getServerEnv().JWT_SECRET || "tuberack-preview";
  return createHmac("sha256", secret).update(`music-preview:${value}`).digest("base64url").slice(0, 32);
}
export function previewPath(track: LibraryTrack): string {
  const srcs = [track.previewUrl, jamendoFiles.get(track.id)].filter((u): u is string => Boolean(u));
  const packed = Buffer.from(JSON.stringify(srcs)).toString("base64url");
  return `/api/v1/music/preview?id=${encodeURIComponent(track.id)}&s=${packed}&sig=${sign(`${track.id}|${packed}`)}`;
}
/** The audio links for a preview request: the signed ones, or (unsigned/old links) a fresh lookup. */
export async function previewSources(id: string, packed: string | null, sig: string | null): Promise<string[]> {
  if (packed && sig && packed.length < 4000) {
    const expected = sign(`${id}|${packed}`);
    if (sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      const list = JSON.parse(Buffer.from(packed, "base64url").toString("utf8")) as unknown;
      if (Array.isArray(list)) return list.filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
    }
  }
  const t = await libraryTrack(id);
  return [t.previewUrl, jamendoFiles.get(id)].filter((u): u is string => Boolean(u));
}

/** Stream a track preview through our server (music sites often refuse playback embedded on other sites). */
export async function fetchPreview(sources: string[], range: string | null, id: string): Promise<Response> {
  const tries = [sources[0], ...sources].filter(Boolean);
  const headers: Record<string, string> = { "User-Agent": UA };
  if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
  let last = "no source";
  for (const [i, src] of tries.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    try {
      const res = await fetch(src, { headers, redirect: "follow", signal: AbortSignal.timeout(20_000) });
      if (res.ok && res.body) return res;
      last = `HTTP ${res.status}`;
      await res.body?.cancel();
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  console.warn(`[music] preview ${id} failed: ${last}`);
  throw new Error(last);
}

/** Download the track's audio (size-capped) so it can be stored with the project. */
export async function downloadTrack(track: LibraryTrack, maxBytes = 25 * 1024 * 1024): Promise<{ bytes: Uint8Array; mime: string; ext: "mp3" | "wav" }> {
  const res = await fetch(jamendoFiles.get(track.id) ?? track.previewUrl, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Track download failed (${res.status})`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new Error("This track is too large to add.");
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error("This track is too large to add.");
  if (buf.byteLength < 10_000) throw new Error("The track file was empty.");
  const ext = track.fileType === "wav" ? "wav" : "mp3";
  return { bytes: buf, mime: ext === "wav" ? "audio/wav" : "audio/mpeg", ext };
}
