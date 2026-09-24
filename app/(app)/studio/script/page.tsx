"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, Undo2, Redo2, Sparkles, Plus, FileText } from "lucide-react";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts, SaveStatus, ScriptStorageNote } from "@/src/components/script/ScriptProvider";
import { useIntelQuery, UsageNote } from "@/src/components/intelligence/chrome";
import { SectionCard } from "@/src/components/script/SectionCard";
import { GenerationDialog } from "@/src/components/script/GenerationDialog";
import { SuggestionsPanel, LoopsPanel, VersionsPanel, HookBuilder } from "@/src/components/script/panels";
import { OutputSection, MethodologyNote, ContextChips } from "@/src/components/intelligence/output";
import { Breadcrumb } from "@/src/components/ui/data";
import { Button } from "@/src/components/ui/Button";
import { Textarea } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { Tabs } from "@/src/components/ui/Tabs";
import type { Script, ScriptSection } from "@/src/lib/script/types";
import {
  addSection,
  deleteSection,
  duplicateSection,
  editSectionText,
  mergeSections,
  moveSection,
  splitSection,
} from "@/src/lib/script/engine";
import { addResearchRef, removeResearchRef, detectClaims, blankSection } from "@/src/lib/script/claims";
import { scriptWords, estimateSeconds, formatDuration } from "@/src/lib/script/measure";
import { reviewSections } from "@/src/lib/script/review";
import { analyzeRetention, RETENTION_METHODOLOGY } from "@/src/lib/intelligence/retention";
import { detectWeakOpenings } from "@/src/lib/intelligence/hooks";
import { formatDef } from "@/src/lib/script/formats";
import { assembleContext } from "@/src/lib/intelligence/context";
import { cx } from "@/src/components/ui/cx";

export default function ScriptStudioPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Script Studio" />}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const { projectId } = useIntelQuery();
  const { ready: projectsReady, projects, channelName, touch } = useProjects();
  const { ready: intelReady, intelFor, dnaFor, addRetention } = useIntel();
  const scripts = useScripts();

  const [selectedId, setSelectedId] = useState<string | null>(projectId);
  const [showGenerate, setShowGenerate] = useState(false);
  const [rev, setRev] = useState(0);

  const ready = projectsReady && intelReady && scripts.ready;
  const project = projects.find((p) => p.id === (selectedId ?? projectId));
  const script = project ? scripts.scriptFor(project.id) : null;

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading Script Studio" />
      </div>
    );
  }

  if (!project) {
    const active = projects.filter((p) => p.status !== "archived");
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Script Studio" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Script Studio</h1>
          <p className="mt-1 text-sm text-muted-text">Select a project to write its script — intelligence attaches automatically.</p>
        </div>
        {active.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="Scripts live inside projects. Create one first — the studio opens with its topic, audience, and strategy attached."
            action={
              <Link href="/projects" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
                Go to projects
              </Link>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Choose a project">
            {active.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface p-4 text-left hover:border-muted-text/50"
                >
                  <span>
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-text">{channelName(p.channelId)} · {p.topic.slice(0, 60)}</span>
                  </span>
                  <FileText className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const intel = intelFor(project.id);
  const dna = dnaFor(project.channelId);

  if (!script) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }, { label: "Script" }]} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Script Studio — {project.name}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted-text">
            Start blank in your format&apos;s structure, or assemble starter sections
            from intelligence. Either way, you own every word.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <ContextChips
            context={assembleContext("brief-generation", {
              idea: project.topic,
              audience: intel.audience ? "Saved audience profile attached." : undefined,
              channelName: channelName(project.channelId),
              projectName: project.name,
              projectTopic: project.topic,
              projectGoal: project.goal,
              dna,
            })}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const def = formatDef("YouTube long-form");
                const now = new Date().toISOString();
                scripts.putScript({
                  projectId: project.id,
                  format: def.name,
                  tone: "Conversational",
                  complexity: "Beginner",
                  structure: "Standard",
                  targetWords: 900,
                  wpm: 150,
                  instruction: "",
                  sections: def.sections.map((s) => blankSection(s.type, s.heading, now)),
                  versions: [],
                  notes: "",
                  updatedAt: now,
                });
                setRev((r) => r + 1);
              }}
            >
              Start blank (long-form structure)
            </Button>
            <Button onClick={() => setShowGenerate(true)}>
              <Sparkles className="size-4" aria-hidden="true" />
              Assemble from intelligence…
            </Button>
          </div>
        </div>
        {showGenerate && (
          <GenerationDialog
            assembly={{
              topic: project.topic,
              audience: intel.audience ? [intel.audience.primary, intel.audience.problem].filter(Boolean).join(" — ") : "",
              hookText: intel.hooks.find((h) => h.status === "approved")?.text ?? intel.hooks[0]?.text ?? "",
              promiseText: intel.strategy?.promise ?? "",
              takeawayText: intel.strategy?.takeaway ?? "",
              points: (intel.strategy?.points ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
              ctaText: intel.strategy?.cta ?? "",
            }}
            context={assembleContext("brief-generation", {
              idea: project.topic,
              channelName: channelName(project.channelId),
              projectName: project.name,
              dna,
            })}
            onApply={(sections, meta) => {
              const now = new Date().toISOString();
              scripts.putScript({
                projectId: project.id,
                format: meta.format,
                tone: meta.tone,
                complexity: meta.complexity,
                structure: meta.structure,
                targetWords: meta.targetWords,
                wpm: meta.wpm,
                instruction: meta.instruction,
                sections,
                versions: [],
                notes: "",
                updatedAt: now,
              });
              setShowGenerate(false);
              setRev((r) => r + 1);
              touch(project.id);
            }}
            onClose={() => setShowGenerate(false)}
          />
        )}
      </div>
    );
  }

  return (
    <Editor
      project={project}
      script={script}
      rev={rev}
      onRev={() => setRev((r) => r + 1)}
      onGenerate={() => setShowGenerate(true)}
      showGenerate={showGenerate}
      onCloseGenerate={() => setShowGenerate(false)}
    />
  );
}

function Editor({
  project,
  script: initial,
  rev,
  onRev,
  onGenerate,
  showGenerate,
  onCloseGenerate,
}: {
  project: { id: string; name: string; topic: string; goal: string; channelId: string };
  script: Script;
  rev: number;
  onRev: () => void;
  onGenerate: () => void;
  showGenerate: boolean;
  onCloseGenerate: () => void;
}) {
  const { channelName, touch } = useProjects();
  const { intelFor, dnaFor, addRetention } = useIntel();
  const { setSections: persist, snapshot, restore, loopsFor, addLoop, resolveLoop, removeLoop, putScript, savedAt } = useScripts();

  const [sections, setSections] = useState<ScriptSection[]>(() => initial.sections);
  const [past, setPast] = useState<ScriptSection[][]>([]);
  const [future, setFuture] = useState<ScriptSection[][]>([]);
  const [wpm, setWpm] = useState(initial.wpm);
  const [query, setQuery] = useState("");
  const [scriptNotes, setScriptNotes] = useState(initial.notes);
  const persistTimer = useRef<number | null>(null);

  // Resync from the store when versions restore or assembly applies.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional resync from the external store revision.
    setSections(initial.sections);
    setPast([]);
    setFuture([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  /** Structural commit: undoable + debounced device persist. */
  function commit(next: ScriptSection[]) {
    setPast((p) => [...p.slice(-49), sections]);
    setFuture([]);
    applyLocal(next);
  }

  /** Keystroke commit: no undo spam, same debounced persist. */
  function commitQuiet(next: ScriptSection[]) {
    applyLocal(next);
  }

  function applyLocal(next: ScriptSection[]) {
    setSections(next);
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => persist(project.id, next), 700);
  }

  function undo() {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setFuture((f) => [sections, ...f].slice(0, 50));
    setPast((p) => p.slice(0, -1));
    setSections(prev);
    persist(project.id, prev);
  }

  function redo() {
    if (future.length === 0) return;
    const [next, ...rest] = future;
    setPast((p) => [...p.slice(-49), sections]);
    setFuture(rest);
    setSections(next);
    persist(project.id, next);
  }

  const intel = intelFor(project.id);
  const dna = dnaFor(project.channelId);
  const loops = loopsFor(project.id);
  const totalWords = scriptWords(sections);
  const totalSec = estimateSeconds(totalWords, wpm);
  const suggestions = useMemo(() => reviewSections(sections), [sections]);
  const retention = useMemo(
    () => analyzeRetention(sections.map((s) => ({ heading: s.heading, body: s.text }))),
    [sections],
  );
  const hookSection = sections.find((s) => s.type === "hook");
  const hookIssues = hookSection ? detectWeakOpenings(hookSection.text) : [];
  const matches = query.trim()
    ? sections.filter((s) => `${s.heading} ${s.text}`.toLowerCase().includes(query.trim().toLowerCase())).map((s) => s.id)
    : [];
  const approvedHooks = intel.hooks.filter((h) => h.status === "approved").map((h) => ({ id: h.id, text: h.text }));

  const contextSummary = assembleContext("brief-generation", {
    idea: project.topic,
    channelName: channelName(project.channelId),
    projectName: project.name,
    dna,
  });

  function applyAssembly(
    newSections: ScriptSection[],
    meta: { format: string; tone: string; complexity: string; structure: string; targetWords: number; wpm: number; instruction: string },
  ) {
    snapshot(project.id, "Pre-assembly backup", "Before applying an assembled draft.");
    putScript({
      ...initial,
      format: meta.format,
      tone: meta.tone,
      complexity: meta.complexity,
      structure: meta.structure,
      targetWords: meta.targetWords,
      wpm,
      instruction: meta.instruction,
      sections: newSections,
      updatedAt: new Date().toISOString(),
    });
    onCloseGenerate();
    onRev();
    touch(project.id);
  }

  const contextPanel = (
    <div className="space-y-4">
      <section aria-label="Project intelligence" className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Context</h2>
        <dl className="mt-2 space-y-1.5 text-sm">
          <div><dt className="text-xs text-muted-text">Topic</dt><dd>{project.topic}</dd></div>
          <div><dt className="text-xs text-muted-text">Audience</dt><dd>{intel.audience ? intel.audience.primary || "Profile saved" : "Not defined — define it in Audience intelligence."}</dd></div>
          <div><dt className="text-xs text-muted-text">Promise</dt><dd>{intel.strategy?.promise || "—"}</dd></div>
          <div><dt className="text-xs text-muted-text">Channel DNA tone</dt><dd>{dna.tone || "—"}</dd></div>
          <div><dt className="text-xs text-muted-text">Format / target</dt><dd>{initial.format} · ~{initial.targetWords} words</dd></div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          <Link href={`/intelligence/audience?project=${project.id}`} className="underline">Audience</Link>
          <Link href={`/intelligence/strategy?project=${project.id}`} className="underline">Strategy</Link>
          <Link href={`/intelligence/titles?project=${project.id}`} className="underline">Titles</Link>
          <Link href={`/intelligence/hooks?project=${project.id}`} className="underline">Hooks</Link>
        </div>
      </section>
      <section aria-label="Script notes" className="rounded-xl border border-border bg-surface p-4">
        <Textarea
          label="Script notes (private — never narrated)"
          rows={3}
          value={scriptNotes}
          onChange={(e) => {
            setScriptNotes(e.target.value);
            putScript({ ...initial, sections, notes: e.target.value, updatedAt: new Date().toISOString() });
          }}
          placeholder="Direction for yourself…"
        />
      </section>
      <ScriptStorageNote />
    </div>
  );

  const toolsPanel = (
    <div className="space-y-3">
      <OutputSection title={`Suggestions (${suggestions.length})`} defaultOpen badge="local checks">
        <SuggestionsPanel suggestions={suggestions} />
      </OutputSection>
      <OutputSection title="Retention" badge={`${retention.estimateMinutes} min est`}>
        <ul className="space-y-1.5" aria-label="Retention notes">
          {retention.flags.map((f, i) => (
            <li key={`${f.area}-${i}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <p className="font-medium">{f.area}</p>
              <p className="text-muted-text">{f.note}</p>
              <p><span className="font-medium">Fix: </span>{f.suggestion}</p>
            </li>
          ))}
        </ul>
        <MethodologyNote text="Risks to inspect, not predictions. Full method in Retention intelligence." />
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() =>
            addRetention(project.id, {
              summary: retention.summary,
              flags: retention.flags,
              estimateMinutes: retention.estimateMinutes,
            })
          }
        >
          Save review to project intel
        </Button>
      </OutputSection>
      <OutputSection title="Hook builder" badge={hookIssues.length > 0 ? `${hookIssues.length} issues` : "clean"}>
        {hookSection ? (
          <HookBuilder
            topic={project.topic}
            approvedHooks={approvedHooks}
            currentHook={hookSection.text}
            onUse={(text) => {
              snapshot(project.id, "Pre-hook backup", "Before replacing the hook.");
              commit(editSectionText(sections, hookSection.id, text));
              touch(project.id);
            }}
          />
        ) : (
          <p className="text-sm text-muted-text">No hook section — add one to build hooks against it.</p>
        )}
      </OutputSection>
      <OutputSection title={`Threads (${loops.length})`} badge={loops.some((l) => !l.payoffSectionId) ? "unpaid" : undefined}>
        <LoopsPanel
          loops={loops}
          sections={sections}
          onAdd={(input) => addLoop(project.id, input)}
          onResolve={(id, payoff) => resolveLoop(project.id, id, payoff)}
          onRemove={(id) => removeLoop(project.id, id)}
        />
      </OutputSection>
      <OutputSection title={`Versions (${initial.versions.length})`}>
        <VersionsPanel
          versions={initial.versions}
          currentSections={sections}
          onSave={(name, note) => snapshot(project.id, name, note)}
          onRestore={(versionId) => {
            restore(project.id, versionId);
            onRev();
          }}
        />
      </OutputSection>
      <UsageNote kind="text" taskLabel="script-studio" />
    </div>
  );

  const editorPanel = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
          <label htmlFor="script-search" className="sr-only">Search within script</label>
          <input
            id="script-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sections…"
            className="h-9 w-full bg-transparent text-sm placeholder:text-disabled-text focus:outline-none"
          />
          {matches.length > 0 && (
            <span className="shrink-0 text-xs text-muted-text" role="status">{matches.length} match(es)</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={past.length === 0} onClick={undo} title="Undo">
            <Undo2 className="size-4" aria-hidden="true" />
            <span className="sr-only">Undo</span>
          </Button>
          <Button size="sm" variant="ghost" disabled={future.length === 0} onClick={redo} title="Redo">
            <Redo2 className="size-4" aria-hidden="true" />
            <span className="sr-only">Redo</span>
          </Button>
          <label className="flex items-center gap-1 text-xs text-muted-text">
            WPM
            <select value={wpm} onChange={(e) => setWpm(Number(e.target.value))} aria-label="Speaking rate" className="h-8 rounded-md border border-border bg-surface px-1 text-xs">
              {[130, 140, 150, 160, 170].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="outline" onClick={onGenerate}>
            <Sparkles className="size-4" aria-hidden="true" />
            Assemble…
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const now = new Date().toISOString();
              commit(addSection(sections, "custom", "New section", undefined, now));
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Section
          </Button>
        </div>
      </div>
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-text" aria-live="polite">
        <span>{totalWords} words · {formatDuration(totalSec)} estimated · {wpm} wpm (estimate, not exact)</span>
        <SaveStatus updatedAt={initial.updatedAt} savedAt={savedAt} />
      </p>
      {query.trim() && matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Search matches">
          {matches.map((id) => {
            const s = sections.find((x) => x.id === id);
            return s ? (
              <button
                key={id}
                type="button"
                onClick={() => document.getElementById(`section-${id}`)?.scrollIntoView({ block: "center" })}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
              >
                {s.heading}
              </button>
            ) : null;
          })}
        </div>
      )}
      <div className="space-y-3">
        {sections.map((s, i) => (
          <SectionCard
            key={s.id}
            section={s}
            index={i}
            total={sections.length}
            wpm={wpm}
            topic={project?.topic ?? ""}
            claims={detectClaims(s.text)}
            match={matches.includes(s.id)}
            onText={(text) => commitQuiet(editSectionText(sections, s.id, text))}
            onNotes={(notes) =>
              commitQuiet(
                sections.map((x) => (x.id === s.id ? { ...x, creatorNotes: notes, updatedAt: new Date().toISOString() } : x)),
              )
            }
            onMove={(dir) => commit(moveSection(sections, s.id, dir))}
            onSplit={() => commit(splitSection(sections, s.id))}
            onDuplicate={() => commit(duplicateSection(sections, s.id))}
            onMerge={() => commit(mergeSections(sections, s.id))}
            onDelete={() => commit(deleteSection(sections, s.id))}
            onShorten={(text) =>
              commit(
                sections.map((x) =>
                  x.id === s.id ? { ...x, text, aiGenerated: false, edited: true, updatedAt: new Date().toISOString() } : x,
                ),
              )
            }
            onAddRef={(fact, source) => {
              const target = sections.find((x) => x.id === s.id);
              if (!target) return;
              commit(sections.map((x) => (x.id === s.id ? addResearchRef(target, fact, source) : x)));
            }}
            onRemoveRef={(refId) => {
              const target = sections.find((x) => x.id === s.id);
              if (!target) return;
              commit(sections.map((x) => (x.id === s.id ? removeResearchRef(target, refId) : x)));
            }}
          />
        ))}
      </div>
      {sections.length === 0 && (
        <EmptyState
          title="Empty script"
          body="Add sections manually or assemble starter sections from intelligence."
        />
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <Breadcrumb trail={[{ label: "Projects", href: "/projects" }, { label: project.name, href: `/projects/${project.id}` }, { label: "Script Studio" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Script Studio — {project.name}</h1>
          <p className="mt-0.5 text-xs text-muted-text">{initial.format} · {initial.tone} · {initial.complexity} · target ~{initial.targetWords} words</p>
        </div>
        <Link href={`/studio/storyboard?project=${project.id}`} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          Continue to Storyboard
        </Link>
      </div>

      <div className="lg:hidden">
        <Tabs
          defaultId="editor"
          tabs={[
            { id: "editor", label: "Editor", content: editorPanel },
            { id: "context", label: "Context", content: contextPanel },
            { id: "tools", label: `Tools (${suggestions.length})`, content: toolsPanel },
          ]}
        />
      </div>
      <div className={cx("hidden gap-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_320px]")}>
        <div>{contextPanel}</div>
        <div className="min-w-0">{editorPanel}</div>
        <div>{toolsPanel}</div>
      </div>

      {showGenerate && (
        <GenerationDialog
          assembly={{
            topic: project.topic,
            audience: intel.audience ? [intel.audience.primary, intel.audience.problem].filter(Boolean).join(" — ") : "",
            hookText: hookSection?.text ?? "",
            promiseText: intel.strategy?.promise ?? "",
            takeawayText: intel.strategy?.takeaway ?? "",
            points: (intel.strategy?.points ?? "").split("\n").map((s) => s.trim()).filter(Boolean),
            ctaText: intel.strategy?.cta ?? "",
          }}
          context={contextSummary}
          onApply={applyAssembly}
          onClose={onCloseGenerate}
        />
      )}
      <LocalStorageNote />
    </div>
  );
}
