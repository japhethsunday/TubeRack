import Link from "next/link";
import { ArrowLeft, FlaskConical, PenLine, Image as ImageIcon } from "lucide-react";
import { Tabs } from "@/src/components/ui/Tabs";
import { Breadcrumb } from "@/src/components/ui/data";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { AIGenerationPanel } from "@/src/components/patterns/AIGenerationPanel";
import { ProjectProgress } from "@/src/components/patterns/ProjectProgress";
import { AssetGrid, type MediaAsset } from "@/src/components/patterns/media";
import { EditorLayout } from "@/src/components/patterns/EditorLayout";
import { Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { InfoLine } from "@/src/components/ui/Toast";
import { PREVIEW_PROJECT, PREVIEW_PROGRESS } from "@/src/config/preview";

const VALID_TABS = [
  "overview",
  "strategy",
  "research",
  "script",
  "storyboard",
  "assets",
  "audio",
  "video",
  "thumbnail",
  "seo",
  "publishing",
] as const;

const PREVIEW_ASSETS: MediaAsset[] = [
  { id: "a1", title: "Hook frame — neon desk (preview)", kind: "Image", meta: "16:9 · AI", status: "selected" },
  { id: "a2", title: "B-roll — studio pan (preview)", kind: "Video", meta: "0:12 · Stock", status: "ready" },
  { id: "a3", title: "Thumbnail variant B (preview)", kind: "Image", meta: "16:9 · AI", status: "processing" },
  { id: "a4", title: "Cold open take 2 (preview)", kind: "Video", meta: "0:31 · Upload", status: "failed" },
];

function ContextRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-text">{k}</dt>
      <dd className="text-right text-sm">{v}</dd>
    </div>
  );
}

/**
 * Project workspace (visual foundation): context indicator, stage tabs,
 * progress, editor layout. All data static and labeled Preview.
 */
export default async function PreviewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const initial = VALID_TABS.includes(stage as (typeof VALID_TABS)[number])
    ? (stage as string)
    : "storyboard";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb
        trail={[
          { label: "Projects", href: "/projects" },
          { label: PREVIEW_PROJECT.title },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-text">
            <span className="font-semibold uppercase tracking-[0.15em]">
              {PREVIEW_PROJECT.workspace}
            </span>
            <Badge tone="preview">Preview</Badge>
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {PREVIEW_PROJECT.title}
          </h1>
          <p className="mt-1 text-xs text-muted-text">
            Current stage: <span className="font-medium text-foreground">Storyboard</span> ·{" "}
            {PREVIEW_PROJECT.updatedAt}
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All projects
        </Link>
      </div>

      <Tabs
        defaultId={initial}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <section aria-label="Project context" className="rounded-xl border border-border bg-surface p-5">
                  <h3 className="text-sm font-semibold">Project context</h3>
                  <dl className="mt-2">
                    <ContextRow k="Topic" v="Hooks that hold past 30 seconds (preview)" />
                    <ContextRow k="Audience" v="New creators under 10k subs (preview)" />
                    <ContextRow k="Niche" v="Creator education (preview)" />
                    <ContextRow k="Angle" v="Payoff-first openings (preview)" />
                  </dl>
                </section>
                <section aria-label="Progress" className="rounded-xl border border-border bg-surface p-5">
                  <ProjectProgress items={PREVIEW_PROGRESS} />
                </section>
              </div>
            ),
          },
          {
            id: "strategy",
            label: "Strategy",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <AIGenerationPanel
                  title="Positioning assistant"
                  capability="Text · strategy"
                  boundaryNote="Strategy generation connects to a text provider in Phase 11. Opportunity scoring arrives with Content Intelligence (Phase 5)."
                />
                <EmptyState
                  title="No opportunities yet"
                  body="Niche gaps, competitor angles, and title tests will list here once research and intelligence ship."
                />
              </div>
            ),
          },
          {
            id: "research",
            label: "Research",
            content: (
              <EmptyState
                icon={FlaskConical}
                title="No sources collected"
                body="Web, YouTube, and competitor research with source-linked evidence arrives in Phase 5. AI claims will always cite sources — never present guesses as facts."
              />
            ),
          },
          {
            id: "script",
            label: "Script",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <AIGenerationPanel
                  title="Script draft"
                  capability="Text · script"
                  boundaryNote="Script generation, retention analysis, and versioning connect in Phase 6 + 11."
                />
                <EmptyState
                  icon={PenLine}
                  title="No script sections yet"
                  body="Hook, body, payoff, and CTA sections with pacing analysis will live here."
                />
              </div>
            ),
          },
          {
            id: "storyboard",
            label: "Storyboard",
            badge: "current",
            content: (
              <div className="space-y-4">
                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Storyboard scenes (preview)">
                  {[
                    ["Scene 1 — Hook", "0:00–0:18 · payoff first"],
                    ["Scene 2 — Stakes", "0:18–0:45 · restate problem"],
                    ["Scene 3 — Payoff I", "0:45–1:30 · first win"],
                    ["Scene 4 — Open loop", "1:30–2:10 · tease payoff II"],
                    ["Scene 5 — CTA", "2:10–2:30 · subscribe + next video"],
                  ].map(([t, d]) => (
                    <li key={t} className="rounded-xl border border-border bg-surface p-4">
                      <p className="text-sm font-medium">{t}</p>
                      <p className="mt-0.5 text-xs text-muted-text">{d}</p>
                      <div aria-hidden="true" className="mt-3 aspect-video rounded-lg bg-muted" />
                    </li>
                  ))}
                </ol>
                <InfoLine>Scene durations, pacing checks, and pattern interrupts attach in Phase 6.</InfoLine>
              </div>
            ),
          },
          {
            id: "assets",
            label: "Assets",
            content: (
              <div className="space-y-3">
                <p className="flex items-center gap-2 text-sm text-muted-text">
                  <ImageIcon className="size-4" aria-hidden="true" />
                  Static preview set — uploads and generation arrive in Phase 7 + 11.
                </p>
                <AssetGrid assets={PREVIEW_ASSETS} />
              </div>
            ),
          },
          {
            id: "audio",
            label: "Audio",
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <section aria-label="Voice" className="rounded-xl border border-border bg-surface p-5">
                  <h3 className="text-sm font-semibold">Voice</h3>
                  <p className="mt-1 text-sm text-muted-text">Narration track (preview): warm, measured, 145 wpm.</p>
                  <div aria-hidden="true" className="mt-3 flex h-12 items-center gap-1">
                    {[8, 14, 10, 18, 12, 20, 9, 15, 11, 17, 13, 10, 16, 12, 14].map((h, i) => (
                      <span key={i} className="w-1.5 rounded bg-muted-text/40" style={{ height: `${h * 2}px` }} />
                    ))}
                  </div>
                </section>
                <EmptyState
                  title="No voice or music generated"
                  body="TTS voices, music beds, SFX, and captions connect in Phase 7 + 11. Waveforms above are decorative preview."
                />
              </div>
            ),
          },
          {
            id: "video",
            label: "Video",
            content: <EditorLayout />,
          },
          {
            id: "thumbnail",
            label: "Thumbnail",
            content: (
              <EmptyState
                title="No thumbnails yet"
                body="Generation, variants, and CTR-minded review arrive in Phase 9. Thumbnails inherit brand DNA automatically."
              />
            ),
          },
          {
            id: "seo",
            label: "SEO",
            content: (
              <form
                onSubmit={(e) => e.preventDefault()}
                className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6 lg:grid-cols-2"
                aria-label="SEO package (preview)"
              >
                <Input label="Title" defaultValue="I tested 30 hooks so you don't have to (preview)" />
                <Input label="Tags" defaultValue="hooks, retention, youtube growth (preview)" />
                <div className="lg:col-span-2">
                  <Textarea
                    label="Description"
                    rows={4}
                    defaultValue="Chapters, links, and keywords will be composed here (preview)."
                  />
                </div>
                <div className="lg:col-span-2">
                  <InfoLine>SEO saving and multi-platform adaptation arrive in Phase 9.</InfoLine>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button disabled title="Saving arrives in Phase 9">Save SEO package</Button>
                  </div>
                </div>
              </form>
            ),
          },
          {
            id: "publishing",
            label: "Publishing",
            content: (
              <EmptyState
                title="Nothing queued for publish"
                body="Scheduling, exports, repurposing derivatives, and release checklists arrive in Phase 9 + 11."
              />
            ),
          },
        ]}
      />
    </div>
  );
}
