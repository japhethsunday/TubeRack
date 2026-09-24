"use client";

import { useState } from "react";
import { Plus, ImagePlus, Sparkles } from "lucide-react";
import { generateProviderImage } from "@/src/lib/ai-client";
import { GeminiAssist } from "@/src/components/intelligence/GeminiAssist";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadStored, safeFileName } from "@/src/lib/download";
import type { MediaAsset } from "@/src/lib/media/types";
import { solidBase } from "@/src/lib/package/thumbnails";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { useMedia } from "@/src/components/media/MediaProvider";
import { ConceptBuilder, VariantEditor, VariantGallery } from "@/src/components/package/thumbnails";
import type { ThumbContext } from "@/src/components/package/thumbnails";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";

/** Downscale an upload to a data-URL base (real bytes embedded for export). */
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
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
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
  const [artUrl, setArtUrl] = useState<string | null>(null);
  const [artError, setArtError] = useState<string | null>(null);

  const defaultArtPrompt = `Eye-catching YouTube thumbnail background for a video titled "${primaryTitle || context.title}". Bold focal subject, high contrast, clean negative space on one side for large text, no words or letters in the image.`;

  async function generateArt() {
    setArtBusy(true);
    setArtError(null);
    const outcome = await generateProviderImage(artPrompt.trim() || defaultArtPrompt, "16:9");
    if (!outcome.ok) {
      setArtError(outcome.message);
      setArtBusy(false);
      return;
    }
    setArtUrl(outcome.data.url);
    try {
      const svg = await uploadToBase(outcome.data.url);
      const variant = addVariant(projectId, {
        name: `Gemini art ${variants.length + 1}`,
        baseKind: "upload",
        baseSvg: svg,
        overlays: [],
      });
      setSelectedId(variant.id);
    } catch {
      setArtError("The image was generated but could not be loaded into the editor. You can still download it below.");
    }
    setArtBusy(false);
  }

  const variants = variantsFor(projectId);
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
        title="Thumbnail concepts with Gemini"
        blurb="Four distinct, honest thumbnail concepts built from this project's title, audience, and angle."
        context={{ ...context, title: primaryTitle || context.title }}
      />

      <section aria-label="Gemini thumbnail art" className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input label="Thumbnail art prompt (Gemini image)" value={artPrompt} onChange={(e) => setArtPrompt(e.target.value)} placeholder={defaultArtPrompt} />
          </div>
          <Button loading={artBusy} onClick={() => void generateArt()}>
            <Sparkles className="size-4" aria-hidden="true" /> Generate art
          </Button>
        </div>
        <p className="text-xs text-muted-text">Generates a real 16:9 image with Gemini and opens it as a new variant, ready for your text overlays.</p>
        {artError && <p role="alert" className="text-xs text-destructive">{artError}</p>}
        {artUrl && (
          <div className="ui-panel flex flex-wrap items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL. */}
            <img src={artUrl} alt="Gemini thumbnail art" className="aspect-video w-60 rounded-lg border border-border object-cover" />
            <DownloadButton onDownload={() => downloadStored(artUrl, safeFileName(primaryTitle || "thumbnail", "png"))} />
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
        <section aria-label="Variant editor">
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
