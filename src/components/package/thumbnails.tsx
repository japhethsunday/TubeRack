"use client";

import { sanitizeSvg } from "@/src/lib/security/svg";
import { useState } from "react";
import { Plus, Trash2, Copy, Download, Check } from "lucide-react";
import type { ThumbnailVariant, TextOverlay } from "@/src/lib/package/types";
import { inlineSvgImages } from "@/src/lib/package/svg-images";
import { buildConcepts, composeThumbnail, reviewThumbnail, reviewPairing, THUMBNAIL_METHOD } from "@/src/lib/package/thumbnails";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { ApprovalFlow } from "@/src/components/package/approval";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { Modal } from "@/src/components/ui/overlays";
import { cx } from "@/src/components/ui/cx";

export interface ThumbContext {
  topic: string;
  title: string;
  audience: string;
  angle: string;
  tone: string;
  visualStyle: string;
  avoidStyles: string;
  brandColor: string;
}

let overlaySeq = 0;
function newOverlay(text: string, brandColor: string): TextOverlay {
  overlaySeq += 1;
  return {
    id: `ov_${Date.now().toString(36)}_${overlaySeq}`,
    text,
    x: 8,
    y: 62,
    size: 120,
    color: "#ffffff",
    weight: 800,
    align: "left",
  };
}

/** Download a standalone SVG file (real export preparation). */
export async function downloadSvg(composed: string, filename: string): Promise<void> {
  const svg = await inlineSvgImages(composed);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Rasterize the composed SVG to PNG via canvas (real client-side export). */
export async function downloadPng(composed: string, filename: string, width = 1280): Promise<void> {
  const svg = await inlineSvgImages(composed);
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = width / 1280;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(720 * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("PNG encoding failed.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = filename;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Concept generator: six editable archetypes from project context. */
export function ConceptBuilder({
  projectId,
  context,
  onUseConcept,
}: {
  projectId: string;
  context: ThumbContext;
  onUseConcept: (conceptId: string) => void;
}) {
  const { conceptsFor, saveConcepts } = usePackaging();
  const [concepts, setConcepts] = useState(() => conceptsFor(projectId));
  const [editing, setEditing] = useState<string | null>(null);

  function generate() {
    const built = buildConcepts(context);
    setConcepts(built);
    saveConcepts(projectId, built);
  }

  function edit(id: string, field: string, value: string) {
    const next = concepts.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    setConcepts(next);
    saveConcepts(projectId, next);
  }

  if (concepts.length === 0) {
    return (
      <EmptyState
        title="No thumbnail concepts"
        body="Generate six structured concepts from the video's topic, title, audience, and brand DNA — then edit before producing anything."
        action={<Button onClick={generate}>Generate concepts</Button>}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={generate}>
          Regenerate (keeps variants)
        </Button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2" aria-label="Thumbnail concepts">
        {concepts.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="flex items-center justify-between gap-2 text-sm font-semibold">
              {c.name}
              <Button size="sm" variant="outline" onClick={() => onUseConcept(c.id)}>
                New variant
              </Button>
            </p>
            {editing === c.id ? (
              <div className="mt-2 space-y-2">
                <Textarea label="Main visual" rows={2} value={c.visual} onChange={(e) => edit(c.id, "visual", e.target.value)} />
                <Textarea label="Text direction" rows={2} value={c.textDirection} onChange={(e) => edit(c.id, "textDirection", e.target.value)} />
                <Textarea label="Composition" rows={2} value={c.composition} onChange={(e) => edit(c.id, "composition", e.target.value)} />
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Done editing
                </Button>
              </div>
            ) : (
              <>
                <dl className="mt-2 space-y-1 text-xs">
                  <div><dt className="font-medium text-muted-text">Visual</dt><dd>{c.visual}</dd></div>
                  <div><dt className="font-medium text-muted-text">Text</dt><dd>{c.textDirection}</dd></div>
                  <div><dt className="font-medium text-muted-text">Emotion / contrast</dt><dd>{c.emotion} · {c.contrast}</dd></div>
                  <div><dt className="font-medium text-muted-text">Brand</dt><dd className="text-muted-text">{c.brandNotes}</dd></div>
                </dl>
                <button type="button" onClick={() => setEditing(c.id)} className="mt-2 text-xs font-medium underline">
                  Edit concept
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <MethodologyNote text={THUMBNAIL_METHOD} />
    </div>
  );
}

/** Variant editor: base + text overlays composed into exportable SVG. */
export function VariantEditor({
  projectId,
  variant,
  baseOptions,
  primaryTitle,
  brandColor,
}: {
  projectId: string;
  variant: ThumbnailVariant;
  baseOptions: { id: string; label: string; svg: string }[];
  primaryTitle: string;
  brandColor: string;
}) {
  const { updateVariant, removeVariant, setVariantApproval } = usePackaging();
  const [overlayDraft, setOverlayDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = variant.baseSvg
    || baseOptions.find((b) => b.id === variant.baseAssetId)?.svg
    || baseOptions[0]?.svg
    || "";
  const composed = composeThumbnail(base, variant.overlays);
  const safeComposed = sanitizeSvg(composed);
  const review = reviewThumbnail(variant.overlays);
  const pairing = reviewPairing(primaryTitle, variant.overlays.map((o) => o.text).join(" "));

  function patch(patch: Partial<ThumbnailVariant>) {
    updateVariant(projectId, variant.id, patch);
  }

  function addOverlay() {
    if (!overlayDraft.trim()) return;
    patch({ overlays: [...variant.overlays, newOverlay(overlayDraft.trim(), brandColor)] });
    setOverlayDraft("");
  }

  function patchOverlay(id: string, overlayPatch: Partial<TextOverlay>) {
    patch({ overlays: variant.overlays.map((o) => (o.id === id ? { ...o, ...overlayPatch } : o)) });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" role="img" aria-label={`Thumbnail variant: ${variant.name}`} dangerouslySetInnerHTML={{ __html: safeComposed }} />
        <div className="grid grid-cols-3 gap-2" aria-label="Preview sizes">
          {[
            { label: "Feed ~120px", width: 120 },
            { label: "Mobile ~200px", width: 200 },
            { label: "Full", width: 320 },
          ].map((p) => (
            <figure key={p.label} className="rounded-lg border border-border bg-surface p-2">
              <div className="mx-auto overflow-hidden rounded [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" style={{ width: p.width }} dangerouslySetInnerHTML={{ __html: safeComposed }} />
              <figcaption className="mt-1 text-center text-[11px] text-muted-text">{p.label}</figcaption>
            </figure>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-xs font-medium">Surroundings check</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded bg-white p-2" aria-label="On light">
              <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: safeComposed }} />
            </div>
            <div className="rounded bg-zinc-900 p-2" aria-label="On dark">
              <div className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: safeComposed }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadSvg(composed, `${variant.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.svg`).catch(() => {})}
          >
            <Download className="size-4" aria-hidden="true" />
            SVG
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => downloadPng(composed, `${variant.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`).catch(() => {})}
          >
            <Download className="size-4" aria-hidden="true" />
            PNG
          </Button>
          {confirmDelete ? (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <button type="button" onClick={() => removeVariant(projectId, variant.id)} className="font-medium text-destructive underline">Delete variant</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-text underline">Keep</button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-sm font-semibold">Text overlays ({variant.overlays.length})</h4>
          <div className="mt-2 flex gap-1.5">
            <div className="flex-1">
              <Input label="New overlay text" value={overlayDraft} onChange={(e) => setOverlayDraft(e.target.value)} placeholder="3 words max…" />
            </div>
            <Button size="sm" className="mt-5" onClick={addOverlay}>
              <Plus className="size-4" aria-hidden="true" />
              Add
            </Button>
          </div>
          <ul className="mt-3 space-y-2" aria-label="Overlays">
            {variant.overlays.map((o) => (
              <li key={o.id} className="rounded-lg bg-muted/40 p-2.5">
                <Input label="Text" value={o.text} onChange={(e) => patchOverlay(o.id, { text: e.target.value })} />
                <div className="mt-2 grid grid-cols-4 gap-2">
                  <label className="text-[11px]">X %
                    <input type="number" min={0} max={95} value={o.x} onChange={(e) => patchOverlay(o.id, { x: Number(e.target.value) || 0 })} className="mt-0.5 h-8 w-full rounded-md border border-border bg-surface px-1.5 text-xs" />
                  </label>
                  <label className="text-[11px]">Y %
                    <input type="number" min={0} max={95} value={o.y} onChange={(e) => patchOverlay(o.id, { y: Number(e.target.value) || 0 })} className="mt-0.5 h-8 w-full rounded-md border border-border bg-surface px-1.5 text-xs" />
                  </label>
                  <label className="text-[11px]">Size
                    <input type="number" min={24} max={220} value={o.size} onChange={(e) => patchOverlay(o.id, { size: Number(e.target.value) || 48 })} className="mt-0.5 h-8 w-full rounded-md border border-border bg-surface px-1.5 text-xs" />
                  </label>
                  <label className="text-[11px]">Weight
                    <Select label="Weight" value={String(o.weight)} onChange={(e) => patchOverlay(o.id, { weight: Number(e.target.value) })}>
                      <option value="500">500</option>
                      <option value="700">700</option>
                      <option value="800">800</option>
                      <option value="900">900</option>
                    </Select>
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Select label="Align" value={o.align} onChange={(e) => patchOverlay(o.id, { align: e.target.value as TextOverlay["align"] })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </Select>
                  <label className="text-[11px]">Color
                    <input type="color" value={/^#[0-9a-f]{6}$/i.test(o.color) ? o.color : "#ffffff"} onChange={(e) => patchOverlay(o.id, { color: e.target.value })} className="mt-0.5 h-8 w-full rounded border border-border" />
                  </label>
                  <div className="flex items-end">
                    <button type="button" onClick={() => patch({ overlays: variant.overlays.filter((x) => x.id !== o.id) })} aria-label={`Remove overlay ${o.text.slice(0, 20)}`} className="h-8 rounded-md px-2 text-xs text-destructive hover:bg-destructive/10">
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-sm font-semibold">Quality review</h4>
          <p className="mt-0.5 text-xs text-muted-text">{review.summary}</p>
          <ul className="mt-2 space-y-1.5" aria-label="Quality checks">
            {review.flags.map((f, i) => (
              <li key={`${f.check}-${i}`} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span><span className="font-medium">{f.check}. </span><span className="text-muted-text">{f.note}</span></span>
                <Badge tone={f.level === "pass" ? "ok" : f.level === "watch" ? "warn" : "bad"}>{f.level}</Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <h4 className="text-sm font-semibold">Title pairing {primaryTitle ? "" : "(set a primary title first)"}</h4>
          {primaryTitle ? (
            <ul className="mt-2 space-y-1.5" aria-label="Pairing notes">
              {pairing.map((p, i) => (
                <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <Badge tone={p.verdict === "complement" ? "ok" : p.verdict === "repeat" ? "warn" : "bad"}>{p.verdict}</Badge>
                  <span className="ml-2 text-muted-text">{p.note}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-text">Pairing analysis runs against the primary title in the Titles tab.</p>
          )}
        </div>

        <ApprovalFlow status={variant.approval} onChange={(next) => setVariantApproval(projectId, variant.id, next)} />
      </div>
    </div>
  );
}

/** Variant gallery: compare, duplicate, approve — never auto-replace. */
export function VariantGallery({
  projectId,
  variants,
  selectedId,
  onSelect,
  onDuplicate,
}: {
  projectId: string;
  variants: ThumbnailVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { setVariantApproval } = usePackaging();
  if (variants.length === 0) {
    return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">No variants yet — create one from a concept or a library image.</p>;
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Thumbnail variants">
      {variants.map((v) => (
        <li key={v.id}>
          <button
            type="button"
            onClick={() => onSelect(v.id)}
            aria-pressed={selectedId === v.id}
            className={cx("block w-full rounded-xl border p-2 text-left transition-colors", selectedId === v.id ? "border-primary" : "border-border hover:border-muted-text/50")}
          >
            <span className="block truncate text-xs font-medium">{v.name}</span>
            <span className="mt-1 flex gap-1">
              <Badge tone={v.approval === "approved" || v.approval === "ready" ? "ok" : v.approval === "review" ? "info" : "neutral"}>{v.approval}</Badge>
              <Badge tone="neutral">{v.overlays.length} text</Badge>
            </span>
          </button>
          <span className="mt-1 flex gap-1 px-1">
            <button type="button" onClick={() => onDuplicate(v.id)} aria-label={`Duplicate ${v.name}`} className="rounded p-1 text-muted-text hover:bg-muted">
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
            {(v.approval === "draft" || v.approval === "review") && (
              <button type="button" onClick={() => setVariantApproval(projectId, v.id, "approved")} aria-label={`Approve ${v.name}`} className="rounded p-1 text-muted-text hover:bg-muted">
                <Check className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
