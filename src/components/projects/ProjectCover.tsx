"use client";

import { useMemo, useState } from "react";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { composeThumbnail } from "@/src/lib/package/thumbnails";

/**
 * Project card cover: the approved thumbnail, else the latest thumbnail
 * design, else the first generated scene image, else the project's initial.
 */
export function ProjectCover({ projectId, name }: { projectId: string; name: string }) {
  const packaging = usePackaging();
  const media = useMedia();

  const thumbSrc = useMemo(() => {
    const approved = packaging.approvedVariantFor(projectId);
    const latest = [...packaging.variantsFor(projectId)].filter((v) => v.baseSvg).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
    const pick = approved?.baseSvg ? approved : latest;
    if (!pick?.baseSvg) return null;
    const svg = composeThumbnail(pick.baseSvg, pick.overlays);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [packaging, projectId]);

  const imageSrc = useMemo(() => {
    if (thumbSrc) return null;
    const image = media
      .assetsFor(projectId)
      .find((a) => a.kind === "image" && a.status === "ready" && (a.source === "provider-output" || a.source === "upload-session"));
    if (!image) return null;
    return media.blobUrlFor(image.id) ?? (/^(https?:|\/|data:image)/.test(image.payload) ? image.payload : null);
  }, [media, projectId, thumbSrc]);

  const src = thumbSrc ?? imageSrc;
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    return (
      <span aria-hidden="true" className="flex h-full items-center justify-center text-2xl font-semibold text-disabled-text">
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- data/blob URLs and signed links, not optimisable
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="h-full w-full object-cover" />;
}
