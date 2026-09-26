import type { TextOverlay } from "@/src/lib/package/types";
import { storeThumbnailImage } from "@/src/lib/package/svg-images";

/** Text-free background art prompt (image models misspell titles; the title is added as text layers). */
export function thumbnailArtPrompt(subject: string, production?: { audience?: string; visualStyle?: string } | null): string {
  return [
    `YouTube thumbnail background art about ${subject}${production?.audience ? `, for ${production.audience}` : ""}.`,
    production?.visualStyle && `Style: ${production.visualStyle}.`,
    "One bold, expressive focal subject on the right third, strong contrast, vivid but clean colours,",
    "a plain uncluttered area on the left half for a headline.",
    "Absolutely no text, letters, numbers, words, signs, captions or logos anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The exact title as up to three short, left-aligned lines. */
export function titleOverlays(headline: string): TextOverlay[] {
  const words = headline.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const perLine = Math.max(2, Math.ceil(words.length / 3));
  const lines: string[] = [];
  for (let i = 0; i < words.length && lines.length < 3; i += perLine) lines.push(words.slice(i, i + perLine).join(" "));
  if (lines.length * perLine < words.length) lines[2] = `${lines[2]} ${words.slice(3 * perLine).join(" ")}`.trim();
  const size = lines.some((l) => l.length > 16) ? 92 : 112;
  return lines.map((text, i) => ({
    id: `ov_${Date.now().toString(36)}_${i}`,
    text: text.toUpperCase(),
    x: 6,
    y: 22 + i * (size / 7.2),
    size,
    color: "#ffffff",
    weight: 900,
    align: "left",
  }));
}

/**
 * Downscale an upload into a thumbnail base. The photo goes to file storage
 * (keeps synced SVG small); without an account it is embedded instead.
 */
export async function uploadToBase(url: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 1280 / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  const stored = jpeg ? await storeThumbnailImage(jpeg) : null;
  const dataUrl = stored ?? canvas.toDataURL("image/jpeg", 0.85);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><image href="${dataUrl}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/></svg>`;
}
