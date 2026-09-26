"use client";

import { useEffect, useMemo } from "react";
import { useVideo } from "@/src/components/video/VideoProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { PublishButton } from "@/src/components/video/PublishToYouTube";
import { sizeFor } from "@/src/components/video/ExportStudio";
import { durationOf, healthOf, validateComposition } from "@/src/lib/video/build";
import type { RenderAsset } from "@/src/lib/video/render";

/**
 * "Publish to YouTube" from the project page: renders the project's timeline
 * in the browser and runs the same upload flow as the Video Studio.
 */
export function ProjectPublish({ projectId, projectName, topic }: { projectId: string; projectName: string; topic?: string }) {
  const video = useVideo();
  const media = useMedia();
  const scripts = useScripts();
  const comp = video.ready ? video.compFor(projectId) : null;
  const assets = useMemo(() => media.assetsFor(projectId), [media, projectId]);
  const scenes = useMemo(() => scripts.scenesFor(projectId), [scripts, projectId]);
  // Files kept on this device (your uploads) are needed to render the video.
  const { want } = media;
  useEffect(() => {
    if (assets.length) want(assets.map((a) => a.id));
  }, [assets, want]);

  if (!comp || comp.clips.length === 0 || !media.ready || !scripts.ready) return null;
  const issues = validateComposition(comp, scenes, assets);
  const assetFor = (assetId: string | undefined): RenderAsset | null => {
    const a = assets.find((x) => x.id === assetId);
    return a ? { kind: a.kind, source: a.source, payload: a.payload, mime: a.mime, title: a.title, blobUrl: media.blobUrlFor(a.id), durationSec: a.durationSec } : null;
  };
  return (
    <PublishButton
      source={{
        projectId,
        projectName,
        topic,
        comp,
        duration: durationOf(comp.clips),
        fps: 30,
        health: healthOf(issues),
        blockingIssues: issues.filter((i) => i.severity === "block").map((i) => i.message),
        assetFor,
        render: { ...sizeFor(comp, 1080), fps: 30 },
      }}
    />
  );
}
