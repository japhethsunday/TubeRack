"use client";

import { useState } from "react";
import { Plus, Search as SearchIcon } from "lucide-react";
import { Breadcrumb, Pagination, Table } from "@/src/components/ui/data";
import { Button } from "@/src/components/ui/Button";
import { IconButton } from "@/src/components/ui/IconButton";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Checkbox, Radio, Switch } from "@/src/components/ui/choices";
import { Tabs } from "@/src/components/ui/Tabs";
import { Badge } from "@/src/components/ui/Badge";
import { Avatar } from "@/src/components/ui/Avatar";
import { Tooltip } from "@/src/components/ui/Tooltip";
import { Dropdown } from "@/src/components/ui/Dropdown";
import { Modal, Drawer } from "@/src/components/ui/overlays";
import { Alert } from "@/src/components/ui/Alert";
import { Search, CommandMenu } from "@/src/components/ui/search";
import { Progress, LoadingState, Skeleton } from "@/src/components/ui/feedback";
import { EmptyState, ErrorState } from "@/src/components/ui/states";
import { Section, ConfirmDialog } from "@/src/components/ui/Section";
import { useToast } from "@/src/components/ui/Toast";
import { AIGenerationPanel } from "@/src/components/patterns/AIGenerationPanel";
import { AssetGrid, type MediaAsset } from "@/src/components/patterns/media";
import { ProjectProgress } from "@/src/components/patterns/ProjectProgress";
import { PREVIEW_PROGRESS } from "@/src/config/preview";
import { lightPalette, typeClasses, TYPE_VARIANTS } from "@/src/design/tokens";

const ROWS = [
  { id: "r1", name: "Hook analysis", kind: "Text", cost: "4 credits" },
  { id: "r2", name: "Thumbnail B", kind: "Image", cost: "12 credits" },
];

const GALLERY_ASSETS: MediaAsset[] = [
  { id: "g1", title: "Ready still", kind: "Image", meta: "16:9", status: "ready" },
  { id: "g2", title: "Rendering clip", kind: "Video", meta: "0:24", status: "processing" },
  { id: "g3", title: "Failed upload", kind: "Video", meta: "1:02", status: "failed" },
  { id: "g4", title: "Chosen frame", kind: "Image", meta: "9:16", status: "selected" },
];

/**
 * Design system gallery: every component, every state, one audit surface.
 * Interactive demos are real client behavior; data shown is static.
 */
export default function DesignPage() {
  const { push } = useToast();
  const [overlay, setOverlay] = useState<"none" | "modal" | "drawer" | "confirm">("none");
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [demoError, setDemoError] = useState(true);
  const [notify, setNotify] = useState(true);
  const [choice, setChoice] = useState("a");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Design system</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Tokens, components, and patterns every studio builds on. Toggle the
          theme in the header — every swatch below adapts. Nothing here calls a
          backend.
        </p>
      </div>

      <Section title="Color tokens" description="Semantic only. Components reference tokens, never hex values.">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Light palette">
          {Object.entries(lightPalette).map(([key, hex]) => (
            <li key={key} className="rounded-lg border border-border p-2">
              <span aria-hidden="true" className="block h-10 rounded-md border border-border" style={{ backgroundColor: hex }} />
              <p className="mt-1.5 text-xs font-medium">{key}</p>
              <p className="font-mono text-[11px] text-muted-text">{hex} · light</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Typography" description="Hierarchy through size and weight — never decoration.">
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          {TYPE_VARIANTS.map((v) => (
            <p key={v} className={typeClasses[v]}>
              {v} — The quick brown fox holds past thirty seconds
            </p>
          ))}
        </div>
      </Section>

      <Section title="Buttons" description="Five variants, three sizes, loading and disabled states.">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button loading>Generating</Button>
          <Button disabled>Disabled</Button>
          <IconButton icon={Plus} label="Add item" />
          <IconButton icon={SearchIcon} label="Search" size="sm" />
        </div>
      </Section>

      <Section title="Forms" description="Labels, hints, errors, and keyboard-native controls.">
        <div className="grid gap-4 rounded-xl border border-border bg-surface p-5 sm:grid-cols-2">
          <Input label="Project title" placeholder="Name it…" hint="Shown across the workspace." />
          <Input label="Slug" defaultValue="bad slug!!" error="Use lowercase letters, numbers, and dashes." />
          <Textarea label="Brief" placeholder="Angle, audience, stakes…" />
          <Select label="Aspect ratio" defaultValue="16:9">
            <option>16:9</option>
            <option>9:16</option>
            <option>1:1</option>
          </Select>
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox label="Notify on complete" defaultChecked />
            <Radio label="Option A" name="demo" checked={choice === "a"} onChange={() => setChoice("a")} />
            <Radio label="Option B" name="demo" checked={choice === "b"} onChange={() => setChoice("b")} />
            <Switch label="Auto captions" checked={notify} onCheckedChange={setNotify} />
          </div>
          <div className="flex items-center gap-2">
            <Dropdown label="Voice" options={[
              { id: "v1", label: "Warm narrator", hint: "EN" },
              { id: "v2", label: "Documentary", hint: "EN" },
              { id: "v3", label: "Energetic", hint: "EN", disabled: true },
            ]} />
            <Tooltip tip="Voices arrive in Phase 7">
              <span className="text-xs text-muted-text underline decoration-dotted">Why limited?</span>
            </Tooltip>
          </div>
        </div>
      </Section>

      <Section title="Navigation" description="Tabs, breadcrumbs, pagination, search, and the ⌘K menu.">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: "Preview" }]} />
          <Tabs
            tabs={[
              { id: "t1", label: "Overview", content: <p className="text-sm text-muted-text">Tab panels switch instantly with arrow-key support.</p> },
              { id: "t2", label: "Script", badge: "draft", content: <p className="text-sm text-muted-text">Badges mark counts or status per tab.</p> },
            ]}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Pagination page={page} totalPages={5} onChange={setPage} />
            <div className="w-64">
              <Search value={query} onChange={setQuery} placeholder="Filter…" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setPalette(true)}>
              Open command menu
            </Button>
          </div>
        </div>
        <CommandMenu open={palette} onClose={() => setPalette(false)} />
      </Section>

      <Section title="Feedback" description="Alerts, progress, skeletons, badges, and avatars.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Alert tone="info" title="Render queued">Position 3 in line. You can keep editing.</Alert>
            <Alert tone="ok" title="Thumbnail saved">Variant B is now the default.</Alert>
            <Alert tone="warn" title="Quota low">YouTube API usage is at 80% for today.</Alert>
            <Alert tone="bad" title="Render failed">Scene 3 timed out. Retry it without restarting.</Alert>
            <Progress value={62} label="Uploading assets" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">Draft</Badge>
              <Badge tone="ok">Published</Badge>
              <Badge tone="warn">Review</Badge>
              <Badge tone="bad">Failed</Badge>
              <Badge tone="info">Queued</Badge>
              <Badge tone="preview">Preview</Badge>
              <Avatar name="Ada Lovelace" />
              <Avatar name="Preview User" size="sm" />
            </div>
          </div>
          <div className="space-y-4">
            <LoadingState label="Loading storyboard" lines={2} />
            <Skeleton className="h-10 w-48" />
            {demoError ? (
              <ErrorState
                title="Preview render failed"
                body="The worker timed out after 120 seconds on scene 2. Your timeline is intact."
                onRetry={() => setDemoError(false)}
              />
            ) : (
              <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
                Recovered — retry cleared the demo error.{" "}
                <button type="button" onClick={() => setDemoError(true)} className="underline">
                  Break it again
                </button>
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Overlays" description="Modal, drawer, confirmation, and toasts — all Escape-dismissable.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOverlay("modal")}>Open modal</Button>
          <Button variant="outline" onClick={() => setOverlay("drawer")}>Open drawer</Button>
          <Button variant="outline" onClick={() => setOverlay("confirm")}>Delete something</Button>
          <Button variant="outline" onClick={() => push({ title: "Saved to preview", body: "Toasts confirm without blocking." })}>
            Fire toast
          </Button>
        </div>
        {overlay === "modal" && (
          <Modal title="Schedule publish" description="Pick a slot — scheduling wires up in Phase 9." onClose={() => setOverlay("none")}>
            <EmptyState title="No destinations connected" body="YouTube, TikTok, and Reels destinations connect in Phase 9 + 11." />
          </Modal>
        )}
        {overlay === "drawer" && (
          <Drawer title="Version history" description="Every AI iteration is kept." onClose={() => setOverlay("none")}>
            <EmptyState title="No versions yet" body="Accepted, edited, and rejected generations will version here from Phase 6." />
          </Drawer>
        )}
        {overlay === "confirm" && (
          <Modal title="Delete asset?" onClose={() => setOverlay("none")}>
            <ConfirmDialog
              title="Delete asset?"
              body="This removes the preview asset from the set. This cannot be undone once storage ships."
              confirmLabel="Delete"
              onConfirm={() => setOverlay("none")}
              onCancel={() => setOverlay("none")}
            />
          </Modal>
        )}
      </Section>

      <Section title="Data" description="Tables paginate; narrow screens scroll horizontally.">
        <Table
          caption="Generation ledger preview"
          columns={[
            { key: "name", header: "Operation", render: (r) => <span className="font-medium">{r.name}</span> },
            { key: "kind", header: "Kind", render: (r) => r.kind },
            { key: "cost", header: "Cost", render: (r) => r.cost },
          ]}
          rows={ROWS}
        />
      </Section>

      <Section title="AI pattern" description="Generate → progress → accept / edit / regenerate. Provider boundary enforced.">
        <AIGenerationPanel
          title="Hook generator"
          capability="Text · hooks"
          boundaryNote="No text provider is connected in Phase 2. Generation, approval history, and credit metering wire up in Phases 6, 10, and 11."
        />
      </Section>

      <Section title="Media & progress" description="Asset states and the project pipeline at a glance.">
        <div className="grid gap-4 lg:grid-cols-2">
          <AssetGrid assets={GALLERY_ASSETS} />
          <div className="rounded-xl border border-border bg-surface p-5">
            <ProjectProgress items={PREVIEW_PROGRESS} />
          </div>
        </div>
      </Section>

      <Section title="States everywhere" description="Empty states explain purpose and next step.">
        <EmptyState
          title="Analytics connects in Phase 10"
          body="Watch-time, CTR, and retention will stream in from real publishes — charts are never fabricated."
        />
      </Section>
    </div>
  );
}
