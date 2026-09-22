"use client";

import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { providerById, capabilityBlock, PROVIDERS } from "@/src/lib/media/providers";
import { useMedia, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { Select, Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Alert } from "@/src/components/ui/Alert";
import { EmptyState } from "@/src/components/ui/states";
import { promptToText, buildVisualPrompt } from "@/src/lib/media/prompts";
import type { SceneRef } from "@/src/components/media/image-studio";

/**
 * Video clip requests: provider-gated builder that saves full-parameter
 * drafts. No clips are synthesized on-device and none are faked — requests
 * queue for Phase 11 with everything a provider needs.
 */
export function VideoStudio({
  projectId,
  scenes,
  platform,
}: {
  projectId: string;
  scenes: SceneRef[];
  platform: string;
}) {
  const { addAsset, assetsFor } = useMedia();
  const [provider, setProvider] = useState("ai-provider");
  const [sceneId, setSceneId] = useState(scenes[0]?.id ?? "");
  const [duration, setDuration] = useState("5");
  const [motion, setMotion] = useState("Slow push-in, locked subject");
  const [instruction, setInstruction] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const scene = scenes.find((s) => s.id === sceneId);
  const block = capabilityBlock(provider, "video");
  const prompt = promptToText(
    buildVisualPrompt({
      sceneTitle: scene?.title ?? "Untitled scene",
      scriptExcerpt: scene?.scriptText ?? "",
      visualDirection: scene?.visual ?? "",
      tone: "",
      positioning: "",
      avoidStyles: "",
      visualStyle: "",
      colorDirection: "",
      platform,
      instruction,
    }),
  );
  const requests = assetsFor(projectId).filter((a) => a.kind === "video" && a.source === "provider-request");

  function saveRequest() {
    const asset = addAsset({
      projectId,
      sceneIds: sceneId ? [sceneId] : [],
      kind: "video",
      source: "provider-request",
      status: "pending",
      title: `Clip request — ${scene?.title ?? "standalone"}`,
      payload: `Provider: ${providerById(provider).label}\nDuration: ${duration}s\nAspect: ${platform === "YouTube Shorts" ? "9:16" : "16:9"}\nMotion: ${motion}\n\n${prompt}\n\nStatus: request draft — not submitted. Submits in Phase 11.`,
      mime: "application/x-tuberack-request",
      durationSec: Number(duration) || 5,
      width: platform === "YouTube Shorts" ? 540 : 960,
      height: platform === "YouTube Shorts" ? 960 : 540,
      tags: ["request", "video"],
      approval: "draft",
    });
    setSavedId(asset.id);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}{p.available ? "" : " — Phase 11"}
            </option>
          ))}
        </Select>
        {block && (
          <Alert tone="warn" title="Video synthesis needs a provider">
            {block} Save the request below — parameters, prompt, and scene link travel with it.
          </Alert>
        )}
        <Select label="Scene" value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
          <option value="">No scene — standalone request</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.number}. {s.title}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {["3", "5", "8", "10"].map((d) => (
              <option key={d} value={d}>{d} seconds</option>
            ))}
          </Select>
          <Input label="Motion direction" value={motion} onChange={(e) => setMotion(e.target.value)} />
        </div>
        <Textarea label="Extra direction" rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs font-medium">Assembled prompt (editable in Image studio)</p>
          <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-xs text-muted-text">{prompt}</pre>
        </div>
        <Button onClick={saveRequest}>
          <Clapperboard className="size-4" aria-hidden="true" />
          Save request draft
        </Button>
        {savedId && (
          <p role="status" className="text-sm text-success">
            Request saved to the library — parameters intact, nothing submitted.
          </p>
        )}
        <p className="text-xs text-muted-text">No timeline editing here — clips assemble in Video Production (Phase 8).</p>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Saved requests ({requests.length})</h3>
        {requests.length === 0 ? (
          <EmptyState title="No clip requests" body="Request drafts queue here with full parameters until providers connect." />
        ) : (
          <ul className="space-y-2" aria-label="Saved clip requests">
            {requests.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="font-medium">{r.title}</p>
                <p className="mt-0.5 text-xs text-muted-text">{r.durationSec}s · {r.width}×{r.height} · {new Date(r.createdAt).toLocaleDateString()}</p>
              </li>
            ))}
          </ul>
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}
