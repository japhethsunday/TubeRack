"use client";

import { useEffect, useMemo, useState } from "react";
import { useVideo } from "@/src/components/video/VideoProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { Preview } from "@/src/components/video/Preview";
import { durationOf, sceneSegments } from "@/src/lib/video/build";
import type { RenderAsset } from "@/src/lib/video/render";

/** Plays a project's finished timeline (same compositor as export), outside the editor. */
export function ProjectPreview({ projectId }: { projectId: string }) {
  const video = useVideo();
  const media = useMedia();
  const scripts = useScripts();
  const [playhead, setPlayhead] = useState(0);
  const comp = video.ready ? video.compFor(projectId) : null;
  const assets = useMemo(() => media.assetsFor(projectId), [media, projectId]);
  const segments = useMemo(() => sceneSegments(scripts.scenesFor(projectId)), [scripts, projectId]);
  const { want } = media;
  useEffect(() => {
    if (assets.length) want(assets.map((a) => a.id));
  }, [assets, want]);

  if (!comp || comp.clips.length === 0) return <p className="text-sm text-muted-text">Preparing the preview…</p>;
  const total = durationOf(comp.clips);
  const assetFor = (assetId: string | undefined): RenderAsset | null => {
    const a = assets.find((x) => x.id === assetId);
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: media.blobUrlFor(a.id), durationSec: a.durationSec } : null;
  };
  return (
    <Preview
      comp={comp}
      segments={segments}
      duration={total}
      playhead={playhead}
      onPlayhead={setPlayhead}
      // When it finishes, go back to the first frame instead of sitting on the fade-out's black frame.
      onPlayingChange={(playing) => {
        if (!playing && playhead >= total - 0.3) setPlayhead(0);
      }}
      assetFor={assetFor}
    />
  );
}
