"use client";

import { useState } from "react";
import { Plus, ImagePlus } from "lucide-react";
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
