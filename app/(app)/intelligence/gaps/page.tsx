"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { UsageNote } from "@/src/components/intelligence/chrome";
import { TaskRunner } from "@/src/components/intelligence/TaskRunner";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { findGaps, type CompetitorReference } from "@/src/lib/intelligence/gaps";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LoadingState } from "@/src/components/ui/feedback";
import { Breadcrumb } from "@/src/components/ui/data";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

const GAP_METHODOLOGY =
  "Local comparison only (no AI, no external data). Your project topics are matched against angle keywords; " +
  "references are compared exactly as you entered them. Outputs are prompts to investigate, not findings.";

export default function GapsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading content gaps" />}>
      <GapsBody />
    </Suspense>
  );
}

function GapsBody() {
  const { projects } = useProjects();
  const [topic, setTopic] = useState("");
  const [refTitle, setRefTitle] = useState("");
  const [refAngle, setRefAngle] = useState("");
  const [refDepth, setRefDepth] = useState<"shallow" | "solid" | "deep">("solid");
  const [references, setReferences] = useState<CompetitorReference[]>([]);

  const catalog = projects
    .filter((p) => p.status !== "archived")
    .map((p) => ({ name: p.name, topic: p.topic }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Breadcrumb trail={[{ label: "Content Intelligence", href: "/intelligence" }, { label: "Content gaps" }]} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Content gaps</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-text">
          Your catalog against a topic against references you enter. Gaps are
          prompts — competitors, volumes, and rankings are never invented.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <Textarea label="Target topic" rows={2} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Payoff-first openings for new creators" />
          <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-text" aria-label="Catalog in scope">
            Comparing against {catalog.length} local project(s)
            {catalog.length > 0 && `: ${catalog.slice(0, 4).map((c) => c.name).join(", ")}${catalog.length > 4 ? "…" : ""}`}.
          </div>
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-medium">Competing references (entered by you)</legend>
            <div className="space-y-2">
              <Input label="Video title" value={refTitle} onChange={(e) => setRefTitle(e.target.value)} placeholder="Exact title you saw" />
              <div className="grid grid-cols-2 gap-2">
                <Input label="Its angle" value={refAngle} onChange={(e) => setRefAngle(e.target.value)} placeholder="Tutorial, story…" />
                <Select label="Depth" value={refDepth} onChange={(e) => setRefDepth(e.target.value as typeof refDepth)}>
                  <option value="shallow">Shallow</option>
                  <option value="solid">Solid</option>
                  <option value="deep">Deep</option>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!refTitle.trim()) return;
                  setReferences((r) => [...r, { title: refTitle.trim(), angle: refAngle.trim() || "Unlabeled", depth: refDepth }]);
                  setRefTitle("");
                  setRefAngle("");
                }}
              >
                <Plus className="size-4" aria-hidden="true" />
                Add reference
              </Button>
            </div>
            {references.length > 0 && (
              <ul className="mt-3 space-y-1.5" aria-label="Entered references">
                {references.map((r, i) => (
                  <li key={`${r.title}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="text-xs text-muted-text">{r.angle} · {r.depth}</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${r.title}`}
                      onClick={() => setReferences((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <TaskRunner
            task="content-gap-analysis"
            contextSummary={`${catalog.length} catalogued project(s), ${references.length} reference(s)`}
            idleHint="Cross-checks angle coverage and surfaces unanswered questions from your topic."
            work={() => findGaps({ topic, catalog, references })}
            onCompleted={() => {}}
          >
            {(result) =>
              result && (
                <div className="space-y-2">
                  <p role="status" className="text-sm font-medium">{result.summary}</p>
                  <ul className="space-y-1.5" aria-label="Gap prompts">
                    {result.gaps.map((g, i) => (
                      <li key={`${g.kind}-${i}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        <p className="flex items-center justify-between gap-2 font-medium">
                          {g.title}
                          <Badge tone="info">Prompt</Badge>
                        </p>
                        <p className="mt-0.5 text-muted-text">{g.detail}</p>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/intelligence/lab?idea=${encodeURIComponent(topic)}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Develop in Idea Lab
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <MethodologyNote text={GAP_METHODOLOGY} />
                </div>
              )
            }
          </TaskRunner>
          <div className="mt-4 space-y-3">
            <UsageNote kind="research" taskLabel="content-gap-analysis" />
            <LocalStorageNote compact />
          </div>
        </div>
      </div>
    </div>
  );
}
