"use client";

import type { MediaAsset } from "@/src/lib/media/types";
import { downloadStored, downloadText, extFromMime, safeFileName } from "@/src/lib/download";
import { DownloadButton } from "@/src/components/ui/DownloadButton";

/** True when this asset has real bytes the user can save. */
export function canDownload(asset: MediaAsset, blobUrl?: string | null): boolean {
  if (asset.status !== "ready") return false;
  if (asset.source === "provider-output") return Boolean(asset.payload);
  if (asset.source === "local-draft") return asset.kind === "image" && asset.payload.trimStart().startsWith("<svg");
  if (asset.source === "upload-session") return Boolean(blobUrl);
  return false;
}

/** Download any finished media asset: stored Gemini/upload files, SVG drafts, or session uploads. */
export function AssetDownload({ asset, blobUrl, size = "xs" }: { asset: MediaAsset; blobUrl?: string | null; size?: "xs" | "sm" }) {
  if (!canDownload(asset, blobUrl)) return null;
  return (
    <DownloadButton
      size={size}
      onDownload={() => {
        if (asset.source === "local-draft") {
          downloadText(asset.payload, safeFileName(asset.title, "svg"), "image/svg+xml");
        } else if (asset.source === "upload-session" && blobUrl) {
          downloadStored(blobUrl, safeFileName(asset.title, extFromMime(asset.mime)));
        } else {
          downloadStored(asset.payload, safeFileName(asset.title, extFromMime(asset.mime, asset.kind === "image" ? "png" : "wav")));
        }
      }}
    />
  );
}
