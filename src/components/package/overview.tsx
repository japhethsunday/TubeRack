"use client";

import { Download, FileJson } from "lucide-react";
import { reviewSeo } from "@/src/lib/package/seo";
import { reviewThumbnail, reviewPairing } from "@/src/lib/package/thumbnails";
import { checkConsistency } from "@/src/lib/package/platforms";
import { downloadSvg, downloadPng } from "@/src/components/package/thumbnails";
import { composeThumbnail } from "@/src/lib/package/thumbnails";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import type { PackageHealth } from "@/src/lib/package/types";

export interface OverviewInput {
  projectName: string;
  primaryTitle: string;
  durationSec: number;
  clipCount: number;
  sourceText: string;
  avoidWords: string[];
}

/** Package overview: completeness, health with reasons, real exports. */
export function PackageOverview({
  projectId,
  input,
  exportPayload,
}: {
  projectId: string;
  input: OverviewInput;
  exportPayload: () => Record<string, unknown>;
}) {
  const { variantsFor, approvedVariantFor, titlesFor, primaryTitleFor, seoFor, packsFor, itemsFor } = usePackagingExtended(projectId);

  const missing: string[] = [];
  const reviews: string[] = [];

  if (!approvedVariantFor) missing.push("Approved thumbnail — create a variant and approve it.");
  else {
    const variant = approvedVariantFor;
    const quality = reviewThumbnail(variant.overlays);
    const issues = quality.flags.filter((f) => f.level === "issue").length;
    if (issues > 0) reviews.push(`Approved thumbnail carries ${issues} quality issue(s) — open it in the Thumbnail tab.`);
    if (input.primaryTitle) {
      const pairing = reviewPairing(input.primaryTitle, variant.overlays.map((o) => o.text).join(" "));
      const repeat = pairing.find((p) => p.verdict === "repeat");
      if (repeat) reviews.push(`Title/thumbnail: ${repeat.note}`);
    }
  }
  if (!primaryTitleFor) missing.push("Primary title — save a variation and star it.");
  const seo = seoFor;
  if (seo.description.trim().split(/\s+/).filter(Boolean).length < 40) {
    missing.push("SEO description under 40 words — assemble and edit it in the SEO tab.");
  } else {
    const review = reviewSeo({
      topic: seo.topic,
      intent: seo.intent,
      title: input.primaryTitle,
      description: seo.description,
      keywords: seo.keywords,
      tags: seo.tags,
      chapters: seo.chapters,
      durationSec: input.durationSec,
    });
    const blocking = review.checks.filter((c) => c.verdict === "issue").length;
    if (blocking > 0) reviews.push(`SEO review: ${blocking} blocking check(s).`);
  }
  const youtubePack = packsFor.find((p) => p.platform === "youtube");
  if (!youtubePack || !(youtubePack.fields.title ?? "").trim()) {
    missing.push("YouTube pack title — fill it in the Platforms tab.");
  }
  const approvedItems = itemsFor.filter((i) => i.status === "approved" || i.status === "ready");
  for (const item of approvedItems) {
    const flags = checkConsistency(item, input.sourceText, input.avoidWords);
    if (flags.some((f) => f.level === "issue")) reviews.push(`Derivative “${item.kind}” has consistency issue(s) — review before publishing.`);
  }

  const health: PackageHealth = missing.length > 0 ? "missing" : reviews.length > 0 ? "review" : "ready";
  const titles = titlesFor;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Package contents" className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Package — {input.projectName}</h3>
        <dl className="mt-2 space-y-2 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Main</dt>
            <dd className="mt-0.5">
              {input.primaryTitle || "No primary title"} · {approvedVariantFor ? `Thumbnail: ${approvedVariantFor.name}` : "No approved thumbnail"} · {input.clipCount} timeline clip(s), {Math.round(input.durationSec)}s
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Discovery</dt>
            <dd className="mt-0.5 text-muted-text">
              {seo.keywords.length} keyword(s), {seo.tags.length} tag(s), {seo.hashtags.length} hashtag(s), {seo.chapters.length} chapter(s)
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Repurposing</dt>
            <dd className="mt-0.5 text-muted-text">
              {itemsFor.length} derivative(s), {approvedItems.length} approved/ready
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">Titles</dt>
            <dd className="mt-0.5 text-muted-text">{titles.length} variation(s) saved</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "tuberack-package.json";
              a.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 5000);
            }}
          >
            <FileJson className="size-4" aria-hidden="true" />
            Export package JSON
          </Button>
          {approvedVariantFor && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const svg = composeThumbnail(approvedVariantFor.baseSvg ?? "", approvedVariantFor.overlays);
                  downloadSvg(svg, "thumbnail.svg").catch(() => {});
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Thumbnail SVG
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const svg = composeThumbnail(approvedVariantFor.baseSvg ?? "", approvedVariantFor.overlays);
                  downloadPng(svg, "thumbnail.png").catch(() => {});
                }}
              >
                <Download className="size-4" aria-hidden="true" />
                Thumbnail PNG
              </Button>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-text">Exports assemble local state for handoff — nothing uploads anywhere.</p>
      </section>

      <section aria-label="Packaging health" className="rounded-xl border border-border bg-surface p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Packaging health
          <Badge tone={health === "ready" ? "ok" : health === "review" ? "warn" : "bad"}>{health === "ready" ? "Ready" : health === "review" ? "Needs review" : "Missing pieces"}</Badge>
        </h3>
        {missing.length === 0 && reviews.length === 0 ? (
          <p role="status" className="mt-2 text-sm text-muted-text">Complete: thumbnail approved, title primary, SEO substantial, YouTube pack titled. Readiness, not a performance promise.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {missing.map((m, i) => (
              <p key={`m-${i}`} role="status" className="rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">Missing: {m}</p>
            ))}
            {reviews.map((r, i) => (
              <p key={`r-${i}`} role="status" className="rounded-lg bg-warning/10 p-2.5 text-sm text-warning">{r}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function usePackagingExtended(projectId: string) {
  const base = usePackaging();
  return {
    variantsFor: base.variantsFor(projectId),
    approvedVariantFor: base.approvedVariantFor(projectId),
    titlesFor: base.titlesFor(projectId),
    primaryTitleFor: base.primaryTitleFor(projectId)?.text ?? "",
    seoFor: base.seoFor(projectId),
    packsFor: (["youtube", "shorts", "tiktok", "reels", "x", "linkedin", "facebook"] as const).map((p) => base.packFor(projectId, p)),
    itemsFor: base.itemsFor(projectId),
  };
}
