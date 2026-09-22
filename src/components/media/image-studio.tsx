"use client";

import { useRef, useState } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import type { MediaAsset } from "@/src/lib/media/types";
import { providerById, capabilityBlock, PROVIDERS } from "@/src/lib/media/providers";
import { buildPoster, seedFromText, POSTER_STYLES, POSTER_DIMS } from "@/src/lib/media/svg";
import type { PosterAspect } from "@/src/lib/media/svg";
import { buildVisualPrompt, PROMPT_METHOD, type PromptSection } from "@/src/lib/media/prompts";
import { useMedia, runLocalJob, MediaStorageNote } from "@/src/components/media/MediaProvider";
import { DraftImage } from "@/src/components/media/players";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { Select, Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";

export interface SceneRef {
  id: string;
  title: string;
  number: number;
  scriptText: string;
  visual: string;
}

const ASPECTS: PosterAspect[] = ["16:9", "9:16", "1:1"];

/**
 * Image studio: on-device SVG drafts (variations, compare, approve, assign)
 * or provider request drafts behind the capability gate. Approved drafts are
 * never auto-replaced — variations are always new assets.
 */
export function ImageStudio({
  projectId,
  scenes,
  dnaTone,
  dnaPositioning,
  dnaAvoid,
  visualStyle,
  colorDirection,
  platform,
  registerRerun,
  initialSceneId,
}: {
  projectId: string;
  scenes: SceneRef[];
  dnaTone: string;
  dnaPositioning: string;
  dnaAvoid: string;
  visualStyle: string;
  colorDirection: string;
  platform: string;
  registerRerun: (assetId: string, fn: () => void) => void;
  initialSceneId?: string;
}) {
  const { addAsset, updateAsset, setApproval, assignScenes } = useMedia();
  const [provider, setProvider] = useState("on-device");
  const [sceneId, setSceneId] = useState(initialSceneId || scenes[0]?.id || "");
  const [title, setTitle] = useState("");
  const [styleId, setStyleId] = useState(POSTER_STYLES[0].id);
  const [aspect, setAspect] = useState<PosterAspect>("16:9");
  const [variations, setVariations] = useState(2);
  const [seed, setSeed] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runIds, setRunIds] = useState<string[]>([]);
  const cancelRef = useRef({ cancelled: false });

  const scene = scenes.find((s) => s.id === sceneId);
  const promptSections: PromptSection[] = buildVisualPrompt({
    sceneTitle: scene?.title ?? title,
    scriptExcerpt: scene?.scriptText ?? "",
    visualDirection: scene?.visual ?? "",
    tone: dnaTone,
    positioning: dnaPositioning,
    avoidStyles: dnaAvoid,
    visualStyle,
    colorDirection,
    platform,
    instruction,
  });
  const [promptEdits, setPromptEdits] = useState<Record<string, string>>({});

  const block = capabilityBlock(provider, "image");
  const effectiveSeed = seed ?? seedFromText(`${title}|${sceneId}|${styleId}`);

  function launch(customSeed?: number, count?: number) {
    const seedBase = customSeed ?? effectiveSeed;
    const n = Math.min(4, Math.max(1, count ?? variations));
    cancelRef.current = { cancelled: false };
    const flag = cancelRef.current;
    setRunning(true);
    setRunIds([]);
    const created: string[] = [];

    const params = {
      title: title || scene?.title || "Untitled draft",
      style: styleId,
      aspect,
      seed: String(seedBase),
      scene: sceneId,
      mood: dnaTone,
    };
    const asset = addAsset({
      projectId,
      sceneIds: [],
      kind: "image",
      source: "local-draft",
      status: "pending",
      title: params.title,
      payload: "",
      mime: "image/svg+xml",
      width: POSTER_DIMS[aspect].width,
      height: POSTER_DIMS[aspect].height,
      seed: seedBase,
      tags: ["draft", styleId, aspect],
      approval: "draft",
    });

    const rerun = () => launch(seedBase, n);
    registerRerun(asset.id, rerun);

    void runLocalJob(
      (status, p) => {
        updateAsset(asset.id, { status });
        setProgress(p);
      },
      [
        { label: "prepare", work: () => undefined },
        {
          label: "generate",
          work: () => {
            for (let i = 0; i < n; i++) {
              if (flag.cancelled) break;
              if (i === 0) {
                updateAsset(asset.id, {
                  payload: buildPoster({ seed: seedBase, title: params.title, styleId, aspect, mood: dnaTone }),
                });
                created.push(asset.id);
              } else {
                const extra = addAsset({
                  projectId,
                  sceneIds: [],
                  kind: "image",
                  source: "local-draft",
                  status: "ready",
                  title: `${params.title} (v${i + 1})`,
                  payload: buildPoster({ seed: seedBase + i * 7919, title: params.title, styleId, aspect, mood: dnaTone }),
                  mime: "image/svg+xml",
                  width: POSTER_DIMS[aspect].width,
                  height: POSTER_DIMS[aspect].height,
                  seed: seedBase + i * 7919,
                  tags: ["draft", styleId, aspect, "variation"],
                  approval: "draft",
                });
                created.push(extra.id);
                registerRerun(extra.id, rerun);
              }
            }
          },
        },
      ],
      () => flag.cancelled,
    ).then((ok) => {
      if (!ok) updateAsset(asset.id, { status: "cancelled" });
      setRunning(false);
      setProgress(100);
      setRunIds(created);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <Select label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} hint="Capability-gated: unsupported options explain themselves.">
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}{p.available ? "" : " — Phase 11"}
            </option>
          ))}
        </Select>

        {block ? (
          <Alert tone="warn" title={providerById(provider).available ? "Not supported here" : "Provider not connected"}>
            {block}
          </Alert>
        ) : null}

        <Select label="Scene (optional)" value={sceneId} onChange={(e) => setSceneId(e.target.value)}>
          <option value="">No scene — standalone draft</option>
          {scenes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.number}. {s.title}
            </option>
          ))}
        </Select>
        <Input label="Title on the draft" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={scene?.title ?? "Draft title…"} />
        <div className="grid grid-cols-2 gap-3">
          <Select label="Style" value={styleId} onChange={(e) => setStyleId(e.target.value)}>
            {POSTER_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label} — {s.blurb}</option>
            ))}
          </Select>
          <Select label="Aspect" value={aspect} onChange={(e) => setAspect(e.target.value as PosterAspect)}>
            {ASPECTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
          <Select label="Variations" value={String(variations)} onChange={(e) => setVariations(Number(e.target.value))}>
            {["1", "2", "3", "4"].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
          <Input label={`Seed (stable — same seed, same draft)`} inputMode="numeric" value={String(effectiveSeed)} onChange={(e) => setSeed(Number.parseInt(e.target.value, 10) || null)} />
        </div>
        <Textarea label="Extra direction (optional)" rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. leave headroom for captions…" />

        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Prompt assistant — structured direction ({promptSections.length} sections)
          </summary>
          <div className="space-y-2 border-t border-border p-3">
            {promptSections.map((s) => (
              <div key={s.label}>
                <label className="text-xs font-medium" htmlFor={`prompt-${s.label}`}>{s.label}</label>
                <textarea
                  id={`prompt-${s.label}`}
                  rows={2}
                  value={promptEdits[s.label] ?? s.text}
                  onChange={(e) => setPromptEdits((p) => ({ ...p, [s.label]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
                />
              </div>
            ))}
            <MethodologyNote text="Local assembly from scene, script, DNA, and consistency. Edit freely — this direction travels with provider requests in Phase 11." />
          </div>
        </details>

        {running ? (
          <div className="space-y-2">
            <Progress value={progress} label="Generating drafts on-device" />
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current.cancelled = true; }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={() => launch()} disabled={Boolean(block)}>
            <ImagePlus className="size-4" aria-hidden="true" />
            Generate {variations} draft{variations === 1 ? "" : "s"} — free, on-device
          </Button>
        )}
        <p className="text-xs text-muted-text">Seeds make drafts reproducible. Variations never replace approved work.</p>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">This run {runIds.length > 0 && <Badge tone="neutral">{runIds.length} new</Badge>}</h3>
        {runIds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-text">
            Results land here with approve + assign controls. Everything also lives in the Library.
          </p>
        ) : (
          <RunResults assetIds={runIds} sceneId={sceneId} onMore={() => launch(effectiveSeed + 131, 2)} />
        )}
        <MediaStorageNote compact />
      </div>
    </div>
  );
}

function RunResults({ assetIds, sceneId, onMore }: { assetIds: string[]; sceneId: string; onMore: () => void }) {
  const { assets, setApproval, assignScenes } = useMedia();
  const items = assetIds.map((id) => assets.find((a) => a.id === id)).filter((a): a is MediaAsset => Boolean(a));
  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Generated drafts">
        {items.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-surface p-3">
            <DraftImage svg={a.payload} title={a.title} />
            <p className="mt-2 truncate text-sm font-medium">{a.title}</p>
            <p className="text-xs text-muted-text">Seed {a.seed} · {a.width}×{a.height}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.approval !== "approved" ? (
                <button type="button" onClick={() => setApproval(a.id, "approved")} className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">
                  Approve
                </button>
              ) : (
                <Badge tone="ok">Approved</Badge>
              )}
              {sceneId && !a.sceneIds.includes(sceneId) && (
                <button type="button" onClick={() => assignScenes(a.id, [...a.sceneIds, sceneId])} className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted">
                  Assign to scene
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={onMore}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Two more variations (new seeds)
      </Button>
    </div>
  );
}
