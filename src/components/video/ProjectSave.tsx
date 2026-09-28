"use client";

import { useEffect, useMemo } from "react";
import { useVideo } from "@/src/components/video/VideoProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { ExportStudio } from "@/src/components/video/ExportStudio";
import { durationOf, healthOf, validateComposition } from "@/src/lib/video/build";
import type { RenderAsset } from "@/src/lib/video/render";

/** Render a project's video in the browser and save it to this phone or computer — no publishing. */
export function ProjectSave({ projectId, projectName }: { projectId: string; projectName: string }) {
  const video = useVideo();
  const media = useMedia();
  const scripts = useScripts();
  const comp = video.ready ? video.compFor(projectId) : null;
  const assets = useMemo(() => media.assetsFor(projectId), [media, projectId]);
  const scenes = useMemo(() => scripts.scenesFor(projectId), [scripts, projectId]);
  const { want } = media;
  useEffect(() => {
    if (assets.length) want(assets.map((a) => a.id));
  }, [assets, want]);

  if (!comp || comp.clips.length === 0 || !media.ready || !scripts.ready) return <p className="text-sm text-muted-text">Preparing…</p>;
  const issues = validateComposition(comp, scenes, assets);
  const assetFor = (assetId: string | undefined): RenderAsset | null => {
    const a = assets.find((x) => x.id === assetId);
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: media.blobUrlFor(a.id), durationSec: a.durationSec } : null;
  };
  return <ExportStudio comp={comp} duration={durationOf(comp.clips)} projectName={projectName} issues={issues} health={healthOf(issues)} assetFor={assetFor} inOut={null} />;
}
