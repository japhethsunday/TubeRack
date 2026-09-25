"use client";

import type { TextOverlay } from "@/src/lib/package/types";
import { useProductionContext } from "@/src/components/projects/useProductionContext";
import { useEffect, useState } from "react";
import { Plus, ImagePlus, Sparkles } from "lucide-react";
import { generateProviderImage } from "@/src/lib/ai-client";
import { GeminiAssist } from "@/src/components/intelligence/GeminiAssist";
import { safeFileName } from "@/src/lib/download";
import type { MediaAsset } from "@/src/lib/media/types";
import { storeThumbnailImage } from "@/src/lib/package/svg-images";
import { composeThumbnail, solidBase } from "@/src/lib/package/thumbnails";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { ConceptBuilder, VariantEditor, VariantGallery, downloadPng } from "@/src/components/package/thumbnails";
import type { ThumbContext } from "@/src/components/package/thumbnails";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";

/**
 * Downscale an upload into a thumbnail base. The photo goes to file storage
 * (keeps synced SVG small); without an account it is embedded instead.
 */
async function uploadToBase(url: string): Promise<string> {
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

/** Thumbnail tab: concepts → variants → editor with live quality + pairing. */
export function ThumbnailTab({
  projectId,
  context,
  primaryTitle,
  imageDrafts,
}: {
  projectId: string;
  context: ThumbContext;
  primaryTitle: string;
  imageDrafts: MediaAsset[];
}) {
  const { variantsFor, addVariant, approvedVariantFor } = usePackaging();
  const { blobUrlFor } = useMedia();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState("solid");
  const [variantName, setVariantName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [artPrompt, setArtPrompt] = useState("");
  const [artBusy, setArtBusy] = useState(false);
  const [artError, setArtError] = useState<string | null>(null);

  // The art prompt is kept per project so it is still there on return.
  const promptKey = `tuberack:thumb-prompt:${projectId}`;
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore once from device storage.
      setArtPrompt(localStorage.getItem(promptKey) ?? "");
    } catch {
      // Storage unavailable: start empty.
    }
  }, [promptKey]);
  function changePrompt(value: string) {
    setArtPrompt(value);
    try {
      localStorage.setItem(promptKey, value);
    } catch {
      // Storage unavailable: the prompt still works for this visit.
    }
  }

  const production = useProductionContext(projectId);
  const headline = (primaryTitle || context.title || "").trim();
  // Never put the title's words in the image prompt: image models misspell text.
  // The art is text-free; the exact title is added as editable text layers.
  const subject = production?.topic || context.topic || context.title || "this video";
  const defaultArtPrompt = [
    `YouTube thumbnail background art about ${subject}${production?.audience ? `, for ${production.audience}` : ""}.`,
    production?.visualStyle && `Style: ${production.visualStyle}.`,
    "One bold, expressive focal subject on the right third, strong contrast, vivid but clean colours,",
    "a plain uncluttered area on the left half for a headline.",
    "Absolutely no text, letters, numbers, words, signs, captions or logos anywhere in the image.",
  ]
    .filter(Boolean)
    .join(" ");

  /** The exact title as up to three short, left-aligned lines. */
  function headlineOverlays(): TextOverlay[] {
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

  async function generateArt() {
    setArtBusy(true);
    setArtError(null);
    const outcome = await generateProviderImage(artPrompt.trim() || defaultArtPrompt, "16:9");
    if (!outcome.ok) {
      setArtError(outcome.message);
      setArtBusy(false);
      return;
    }
    // The finished thumbnail is the art plus the exact title, saved as a
    // variant so it is there when the user comes back.
    const url = outcome.data.url;
    const svg = await uploadToBase(url).catch(
      () => `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><image href="${url}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/></svg>`,
    );
    const variant = addVariant(projectId, {
      name: `Art ${artVariants.length + 1}`,
      baseKind: "upload",
      baseSvg: svg,
      overlays: headlineOverlays(),
    });
    setSelectedId(variant.id);
    setArtBusy(false);
  }

  const variants = variantsFor(projectId);
  const artVariants = variants.filter((v) => v.baseKind === "upload" && /^Art \d+/.test(v.name));
  const latestArt = artVariants[artVariants.length - 1] ?? null;
  const latestComposed = latestArt?.baseSvg ? composeThumbnail(latestArt.baseSvg, latestArt.overlays) : null;
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0] ?? null;
  const approved = approvedVariantFor(projectId);

  const baseOptions = [
    { id: "solid", label: "Solid starter (navy → violet)", svg: solidBase("#1e1b4b", "#6d28d9") },
    ...imageDrafts
      .filter((a) => a.status === "ready" && a.source === "local-draft" && a.payload.startsWith("<svg"))
      .map((a) => ({ id: a.id, label: a.title, svg: a.payload })),
  ];

  function createVariant(conceptId?: string, baseOverride?: { id: string; svg: string }) {
    const base = baseOverride ?? baseOptions.find((b) => b.id === baseId) ?? baseOptions[0];
    const variant = addVariant(projectId, {
      name: variantName.trim() || `Variant ${variants.length + 1}`,
      conceptId,
      baseKind: "svg-draft",
      baseAssetId: base.id === "solid" ? undefined : base.id,
      baseSvg: base.svg,
      overlays: [],
    });
    setSelectedId(variant.id);
    setVariantName("");
  }

  async function importUpload(asset: MediaAsset) {
    const url = blobUrlFor(asset.id);
    if (!url) {
      setImportError("Upload bytes left with the last session — re-upload to use it as a base.");
      return;
    }
    setImportingId(asset.id);
    setImportError(null);
    try {
      const svg = await uploadToBase(url);
      const variant = addVariant(projectId, {
        name: `${asset.title} (cover)`,
        baseKind: "upload",
        baseAssetId: asset.id,
        baseSvg: svg,
        overlays: [],
      });
      setSelectedId(variant.id);
    } catch {
      setImportError("Could not read that upload — try a PNG or JPEG.");
    } finally {
      setImportingId(null);
    }
  }

  const uploads = imageDrafts.filter((a) => a.source === "upload-session" && a.status === "ready");

  return (
    <div className="space-y-6">
      <GeminiAssist
        task="thumbnail-concepts"
        saveAs={{ projectId, key: "thumbnail-concepts" }}
        title="Thumbnail concepts"
        blurb="Four distinct, honest thumbnail concepts built from this project's title, audience, and angle."
        context={{ ...context, title: primaryTitle || context.title }}
      />

      <section aria-label="Thumbnail art" className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input label="Thumbnail art prompt " value={artPrompt} onChange={(e) => changePrompt(e.target.value)} placeholder={defaultArtPrompt} />
          </div>
          <Button loading={artBusy} onClick={() => void generateArt()}>
            <Sparkles className="size-4" aria-hidden="true" /> Generate art
          </Button>
        </div>
        <p className="text-xs text-muted-text">Generates text-free 16:9 art and adds your exact title on top as editable text, so the words are always spelled right.</p>
        {artError && <p role="alert" className="text-xs text-destructive">{artError}</p>}
        {latestArt && latestComposed && (
          <div className="ui-panel flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- composed SVG thumbnail. */}
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(latestComposed)}`}
              alt={`Thumbnail: ${headline}`}
              className="aspect-video w-72 rounded-lg border border-border object-cover"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedId(latestArt.id);
                  document.getElementById("variant-editor")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Edit text & layout
              </Button>
              <Button variant="secondary" onClick={() => void downloadPng(latestComposed, safeFileName(primaryTitle || "thumbnail", "png")).catch(() => {})}>
                Download PNG
              </Button>
            </div>
          </div>
        )}
      </section>

      <ConceptBuilder projectId={projectId} context={context} onUseConcept={(conceptId) => createVariant(conceptId)} />

      <section aria-label="New variant" className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">New variant</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input label="Variant name" value={variantName} onChange={(e) => setVariantName(e.target.value)} placeholder={`Variant ${variants.length + 1}`} />
          <Select label="Base art" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            {baseOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </Select>
          <div className="flex items-end">
            <Button onClick={() => createVariant()}>
              <Plus className="size-4" aria-hidden="true" />
              Create
            </Button>
          </div>
        </div>
        {uploads.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-text">Or import a session upload as base (bytes embedded at thumbnail size)</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Uploads available as bases">
              {uploads.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    disabled={importingId === u.id}
                    onClick={() => importUpload(u)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    <ImagePlus className="size-3.5" aria-hidden="true" />
                    {importingId === u.id ? "Reading…" : u.title.length > 24 ? `${u.title.slice(0, 24)}…` : u.title}
                  </button>
                </li>
              ))}
            </ul>
            {importError && <p role="alert" className="mt-1.5 text-xs text-destructive">{importError}</p>}
          </div>
        )}
      </section>

      <section aria-label="Variants">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Variants ({variants.length})
            {approved && <Badge tone="ok" className="ml-2">Approved: {approved.name}</Badge>}
          </h3>
        </div>
        <div className="mt-2">
          <VariantGallery
            projectId={projectId}
            variants={variants}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onDuplicate={(id) => {
              const source = variants.find((v) => v.id === id);
              if (!source) return;
              const copy = addVariant(projectId, {
                name: `${source.name} (copy)`,
                conceptId: source.conceptId,
                baseKind: source.baseKind,
                baseAssetId: source.baseAssetId,
                baseSvg: source.baseSvg,
                overlays: source.overlays.map((o) => ({ ...o })),
              });
              setSelectedId(copy.id);
            }}
          />
        </div>
      </section>

      {selected && (
        <section id="variant-editor" aria-label="Variant editor">
          <h3 className="mb-2 text-sm font-semibold">Editing — {selected.name}</h3>
          <VariantEditor
            projectId={projectId}
            variant={selected}
            baseOptions={baseOptions}
            primaryTitle={primaryTitle}
            brandColor={context.brandColor}
          />
        </section>
      )}
    </div>
  );
}
