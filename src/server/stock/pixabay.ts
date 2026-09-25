import { getServerEnv } from "@/src/lib/env";

/**
 * Free stock videos and photos from Pixabay (Pixabay Content License: free
 * for commercial use, no attribution required). Search results show
 * Pixabay's preview files; choosing one copies the file into the workspace,
 * as Pixabay's API terms require (no permanent hotlinking).
 */
const API = "https://pixabay.com/api/";

export type StockKind = "video" | "photo";
export type StockOrientation = "any" | "horizontal" | "vertical";

export interface StockItem {
  id: string;
  kind: StockKind;
  title: string;
  author: string;
  pageUrl: string;
  thumbnail: string;
  /** Small playable preview (videos only). */
  previewVideo: string | null;
  width: number;
  height: number;
  durationSec: number | null;
}

type VideoFile = { url?: string; width?: number; height?: number; size?: number; thumbnail?: string };
type Raw = {
  id?: number;
  pageURL?: string;
  tags?: string;
  user?: string;
  duration?: number;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  videos?: { large?: VideoFile; medium?: VideoFile; small?: VideoFile; tiny?: VideoFile };
};

export function isStockConfigured(env = getServerEnv()): boolean {
  return Boolean(env.PIXABAY_API_KEY);
}

function key(): string {
  const k = getServerEnv().PIXABAY_API_KEY;
  if (!k) throw new Error("Stock library isn't set up yet.");
  return k;
}

const titleOf = (tags: string | undefined) => {
  const t = (tags ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3).join(", ");
  return t ? t[0].toUpperCase() + t.slice(1) : "Stock clip";
};

export function toStockItem(kind: StockKind, r: Raw): StockItem | null {
  if (!r.id) return null;
  if (kind === "video") {
    const v = r.videos ?? {};
    const shown = v.medium ?? v.small ?? v.large ?? v.tiny;
    if (!shown?.url) return null;
    return {
      id: `v${r.id}`,
      kind,
      title: titleOf(r.tags),
      author: r.user ?? "",
      pageUrl: r.pageURL ?? "",
      thumbnail: v.medium?.thumbnail || v.small?.thumbnail || v.tiny?.thumbnail || "",
      previewVideo: v.tiny?.url || v.small?.url || null,
      width: shown.width ?? 0,
      height: shown.height ?? 0,
      durationSec: typeof r.duration === "number" ? r.duration : null,
    };
  }
  if (!r.webformatURL) return null;
  return {
    id: `p${r.id}`,
    kind,
    title: titleOf(r.tags),
    author: r.user ?? "",
    pageUrl: r.pageURL ?? "",
    thumbnail: r.webformatURL,
    previewVideo: null,
    width: r.imageWidth ?? 0,
    height: r.imageHeight ?? 0,
    durationSec: null,
  };
}

async function call(kind: StockKind, params: Record<string, string>): Promise<Raw[]> {
  const q = new URLSearchParams({ key: key(), safesearch: "true", ...params });
  const res = await fetch(`${API}${kind === "video" ? "videos/" : ""}?${q}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 429) throw new Error("The stock library is busy. Please try again in a minute.");
  if (!res.ok) throw new Error(`Stock search failed (${res.status}).`);
  const body = (await res.json()) as { hits?: Raw[] };
  return Array.isArray(body.hits) ? body.hits : [];
}

export async function searchStock(input: { kind: StockKind; query: string; orientation: StockOrientation; page: number }): Promise<StockItem[]> {
  const params: Record<string, string> = { q: input.query.slice(0, 100), per_page: "24", page: String(input.page) };
  if (input.kind === "photo") {
    params.image_type = "photo";
    if (input.orientation !== "any") params.orientation = input.orientation;
  } else params.video_type = "film";
  let items = (await call(input.kind, params)).map((r) => toStockItem(input.kind, r)).filter((x): x is StockItem => Boolean(x));
  // The video API has no orientation filter: apply it from the file's size.
  if (input.kind === "video" && input.orientation !== "any") {
    items = items.filter((v) => (input.orientation === "vertical" ? v.height > v.width : v.width >= v.height));
  }
  return items;
}

const MAX_BYTES = 80 * 1024 * 1024;

/** Download a stock file by id (re-read from Pixabay; client URLs are never fetched). */
export async function downloadStock(id: string): Promise<{ item: StockItem; bytes: Uint8Array; mime: string; ext: "mp4" | "jpg" }> {
  const m = /^([vp])(\d{1,12})$/.exec(id);
  if (!m) throw new Error("Unknown stock item.");
  const kind: StockKind = m[1] === "v" ? "video" : "photo";
  const [raw] = await call(kind, { id: m[2] });
  const item = raw ? toStockItem(kind, raw) : null;
  if (!raw || !item) throw new Error("This item is no longer available.");
  let url: string | undefined;
  if (kind === "video") {
    const v = raw.videos ?? {};
    // Full HD when it isn't huge; otherwise the next size down.
    const choices = [v.medium, v.small, v.large, v.tiny].filter((f): f is VideoFile => Boolean(f?.url));
    url = (choices.find((f) => (f.size ?? 0) > 0 && (f.size ?? 0) <= MAX_BYTES) ?? choices[0])?.url;
  } else url = raw.largeImageURL || raw.webformatURL;
  if (!url || !/^https:\/\/([a-z0-9-]+\.)*pixabay\.com\//i.test(url)) throw new Error("This item is no longer available.");
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error("Couldn't download this item right now.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("The file came back empty.");
  if (bytes.byteLength > MAX_BYTES) throw new Error("This clip is too large. Please choose another one.");
  return kind === "video" ? { item, bytes, mime: "video/mp4", ext: "mp4" } : { item, bytes, mime: "image/jpeg", ext: "jpg" };
}
