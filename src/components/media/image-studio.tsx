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
import { generateProviderImage, retryBusy } from "@/src/lib/ai-client";
import { api } from "@/src/lib/api";
import type { ProductionContext } from "@/src/lib/projects/production-context";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { Select, Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Progress } from "@/src/components/ui/feedback";
import { Alert } from "@/src/components/ui/Alert";
import { Badge } from "@/src/components/ui/Badge";
import { AssetDownload } from "@/src/components/media/AssetDownload";

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
 * or Gemini images, behind the capability gate. Approved drafts are
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
  context,
  onSceneVisual,
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
  /** Shared production brief: topic, audience, tone, visual identity. */
  context?: ProductionContext | null;
  /** Save a planned shot back to the storyboard so every tool shares it. */
  onSceneVisual?: (sceneId: string, visual: string) => void;
}) {
  const { addAsset, updateAsset, setApproval, assignScenes, assetsFor } = useMedia();
  const [provider, setProvider] = useState("ai-provider");
  const [sceneId, setSceneId] = useState(initialSceneId || scenes[0]?.id || "");
  const [title, setTitle] = useState("");
  const [styleId, setStyleId] = useState(POSTER_STYLES[0].id);
  const [aspect, setAspect] = useState<PosterAspect>(context?.aspect ?? "16:9");
  const [variations, setVariations] = useState(1);
  const [seed, setSeed] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [runIds, setRunIds] = useState<string[]>([]);
  const cancelRef = useRef({ cancelled: false });
  const [genError, setGenError] = useState<string | null>(null);
  const isGemini = provider === "ai-provider";

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

  /** Style line shared by every image in the project, so the video looks consistent. */
  const styleLine = [context?.visualStyle || visualStyle, colorDirection && `colours: ${colorDirection}`, context?.tone && `mood: ${context.tone}`]
    .filter(Boolean)
    .join("; ");

  /** A natural image prompt for one scene, grounded in the production brief. */
  function scenePrompt(shot: string): string {
    return [
      shot.trim(),
      context?.topic && `This image is for a YouTube video about ${context.topic}${context.audience ? `, made for ${context.audience}` : ""}.`,
      styleLine && `Style: ${styleLine}.`,
      instruction.trim(),
      (context?.avoid || dnaAvoid) && `Avoid: ${context?.avoid || dnaAvoid}.`,
      "Photographic, high detail. No text, letters, captions, logos or watermarks.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function finalPrompt(): string {
    const edited = Object.keys(promptEdits).length > 0;
    if (edited) return scenePrompt(promptSections.map((s) => promptEdits[s.label] ?? s.text).join(". "));
    const shot = scene?.visual?.trim() || [scene?.title ?? title, scene?.scriptText.slice(0, 300)].filter(Boolean).join(": ");
    return scenePrompt(shot || title || "A scene for this video");
  }

  // ---- All scenes at once -------------------------------------------------
  const [allRun, setAllRun] = useState<{ done: number; total: number; failed: number; step: string } | null>(null);
  const [skipDone, setSkipDone] = useState(true);
  const hasImage = (id: string) =>
    assetsFor(projectId).some((a) => a.kind === "image" && a.status === "ready" && a.sceneIds.includes(id) && a.source === "provider-output");

  /**
   * Plan a consistent shot for every scene from the script + production brief
   * (saved back to the storyboard), then generate one image per scene and
   * attach it to that scene.
   */
  async function generateAllScenes() {
    const todo = scenes.filter((s) => !(skipDone && hasImage(s.id)));
    if (todo.length === 0) return;
    cancelRef.current = { cancelled: false };
    const flag = cancelRef.current;
    setRunning(true);
    setGenError(null);
    setRunIds([]);
    setAllRun({ done: 0, total: todo.length, failed: 0, step: "Planning shots from the script…" });
    let shots: string[] = todo.map((s) => s.visual || `${s.title}: ${s.scriptText.slice(0, 300)}`);
    try {
      const planned = await retryBusy(() =>
        api.post<{ visuals: { visual: string }[] }>("/api/v1/ai/scene-visuals", {
          topic: context?.topic || title || "this video",
          aspect: aspect === "9:16" ? "9:16" : "16:9",
          style: styleLine,
          brief: context?.brief ?? "",
          scenes: todo.map((s) => ({ title: s.title, text: s.scriptText, direction: s.visual || undefined })),
        }),
      );
      shots = todo.map((s, i) => planned.visuals[i]?.visual || shots[i]);
      todo.forEach((s, i) => {
        if (!s.visual?.trim() && shots[i]) onSceneVisual?.(s.id, shots[i]);
      });
    } catch {
      // Planning failed: fall back to each scene's own storyboard direction and script.
    }
    let done = 0;
    let failed = 0;
    const created: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < todo.length && !flag.cancelled) {
        const i = next++;
        const s = todo[i];
        setAllRun({ done, total: todo.length, failed, step: `Scene ${s.number}: ${s.title}` });
        const asset = addAsset({
          projectId,
          sceneIds: [s.id],
          kind: "image",
          source: "provider-output",
          status: "generating",
          title: `Scene ${s.number}: ${s.title}`.slice(0, 80),
          payload: "",
          mime: "image/png",
          width: POSTER_DIMS[aspect].width,
          height: POSTER_DIMS[aspect].height,
          tags: ["generated", aspect, "scene"],
          approval: "draft",
        });
        const prompt = scenePrompt(shots[i]);
        registerRerun(asset.id, () => void generateProviderImage(prompt, aspect).then((o) => updateAsset(asset.id, o.ok ? { status: "ready", payload: o.data.url } : { status: "failed", error: o.message })));
        const outcome = await generateProviderImage(prompt, aspect);
        if (outcome.ok) {
          updateAsset(asset.id, { status: "ready", payload: outcome.data.url });
          created.push(asset.id);
          done++;
        } else {
          updateAsset(asset.id, { status: "failed", error: outcome.message });
          setGenError(outcome.message);
          failed++;
        }
        setRunIds([...created]);
        setAllRun({ done, total: todo.length, failed, step: "" });
        setProgress(Math.round(((done + failed) / todo.length) * 100));
      }
    };
    await Promise.all([worker(), worker()]);
    setAllRun({ done, total: todo.length, failed, step: "" });
    setRunning(false);
  }

  /** Gemini path: real images, one request per variation, stored server-side. */
  async function launchGemini(count?: number) {
    const n = Math.min(4, Math.max(1, count ?? variations));
    cancelRef.current = { cancelled: false };
    const flag = cancelRef.current;
    setRunning(true);
    setRunIds([]);
    setGenError(null);
    setProgress(5);
    const baseTitle = title || scene?.title || "Untitled image";
    const created: string[] = [];
    const prompt = finalPrompt();
    for (let i = 0; i < n; i++) {
      if (flag.cancelled) break;
      const asset = addAsset({
        projectId,
        sceneIds: sceneId ? [sceneId] : [],
        kind: "image",
        source: "provider-output",
        status: "generating",
        title: n > 1 ? `${baseTitle} (v${i + 1})` : baseTitle,
        payload: "",
        mime: "image/png",
        width: POSTER_DIMS[aspect].width,
        height: POSTER_DIMS[aspect].height,
        tags: ["generated", aspect],
        approval: "draft",
      });
      const variant = i === 0 ? prompt : `${prompt}\nVariation ${i + 1}: a distinctly different composition.`;
      const outcome = await generateProviderImage(variant, aspect);
      if (!outcome.ok) {
        updateAsset(asset.id, { status: "failed", error: outcome.message });
        setGenError(outcome.message);
        break;
      }
      updateAsset(asset.id, { status: "ready", payload: outcome.data.url });
      created.push(asset.id);
      setRunIds([...created]);
      setProgress(Math.round(((i + 1) / n) * 100));
    }
    setRunning(false);
    setProgress(100);
  }

  function launch(customSeed?: number, count?: number) {
    if (isGemini) {
      void launchGemini(count);
      return;
    }
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
              {p.label}
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
            <MethodologyNote text="Local assembly from scene, script, DNA, and consistency. Edit freely; this is exactly the direction used." />
          </div>
        </details>

        {running ? (
          <div className="space-y-2">
            <Progress value={progress} label={allRun ? `Scene images ${allRun.done + allRun.failed}/${allRun.total}${allRun.step ? ` — ${allRun.step}` : ""}` : isGemini ? "Generating images" : "Generating drafts on-device"} />
            <Button variant="outline" size="sm" onClick={() => { cancelRef.current.cancelled = true; }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={() => launch()} disabled={Boolean(block)}>
            <ImagePlus className="size-4" aria-hidden="true" />
            {isGemini
              ? `Generate ${variations} image${variations === 1 ? "" : "s"}`
              : `Generate ${variations} draft${variations === 1 ? "" : "s"} — free, on-device`}
          </Button>
        )}
        {isGemini && scenes.length > 0 && !running && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Button variant="outline" onClick={() => void generateAllScenes()} disabled={Boolean(block)}>
              <ImagePlus className="size-4" aria-hidden="true" />
              Images for all {skipDone ? scenes.filter((s) => !hasImage(s.id)).length : scenes.length} scenes
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-text">
              <input type="checkbox" checked={skipDone} onChange={(e) => setSkipDone(e.target.checked)} className="size-4" />
              Skip scenes that already have an image
            </label>
            <p className="text-xs text-muted-text">Plans one shot per scene from the script and your project brief, keeps one look across the video, and attaches each image to its scene.</p>
          </div>
        )}
        {allRun && !running && (
          <p className="text-xs text-muted-text" role="status">
            {allRun.done} of {allRun.total} scene images made{allRun.failed ? `; ${allRun.failed} failed — use Retry on those in the Library` : ""}.
          </p>
        )}
        {genError && (
          <Alert tone="warn" title="Images could not be generated">
            {genError}
          </Alert>
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
            {a.source === "provider-output" ? (
              // eslint-disable-next-line @next/next/no-img-element -- authenticated app URL; the optimizer cannot forward the session.
              <img src={a.payload} alt={a.title} className="aspect-video w-full rounded-lg border border-border bg-black object-contain" />
            ) : (
              <DraftImage svg={a.payload} title={a.title} />
            )}
            <p className="mt-2 truncate text-sm font-medium">{a.title}</p>
            <p className="text-xs text-muted-text">
              {a.source === "provider-output" ? "Generated" : `Seed ${a.seed}`} · {a.width}×{a.height}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <AssetDownload asset={a} />
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
