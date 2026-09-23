"use client";

import { useState } from "react";
import { Wand2, Sparkles } from "lucide-react";
import { writeSeoWithProvider } from "@/src/lib/ai-client";
import type { Chapter } from "@/src/lib/package/types";
import {
  extractKeywords,
  buildDescription,
  reviewSeo,
  chaptersFromSegments,
  chaptersToText,
  formatTimestamp,
  parseTimestamp,
} from "@/src/lib/package/seo";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { ApprovalFlow } from "@/src/components/package/approval";
import { Input, Textarea, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

export interface SeoContext {
  promise: string;
  topic: string;
  takeaway: string;
  cta: string;
  audience: string;
  scriptText: string;
  segments: { title: string; startSec: number }[];
  durationSec: number;
  primaryTitle: string;
}

/** SEO workspace: structured metadata, assembled description, real review. */
export function SeoWorkspace({ projectId, context }: { projectId: string; context: SeoContext }) {
  const { seoFor, saveSeo } = usePackaging();
  const saved = seoFor(projectId);
  const [draft, setDraft] = useState(() => ({ ...saved }));
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [built, setBuilt] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const extracted = extractKeywords(context.scriptText);
  const review = reviewSeo({
    topic: draft.topic || context.topic,
    intent: draft.intent,
    title: context.primaryTitle,
    description: draft.description,
    keywords: draft.keywords,
    tags: draft.tags,
    chapters: draft.chapters,
    durationSec: context.durationSec,
  });

  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setBuilt(false);
  }

  function assemble() {
    setDraft((d) => ({
      ...d,
      topic: d.topic || context.topic,
      audience: d.audience || context.audience,
      description: buildDescription({
        promise: context.promise,
        topic: d.topic || context.topic,
        takeaway: context.takeaway,
        cta: context.cta,
        chapters: d.chapters,
        hashtags: d.hashtags,
        links,
      }),
    }));
    setBuilt(true);
  }

  async function writeWithGemini() {
    setAiBusy(true);
    setAiError(null);
    const chapters = draft.chapters
      .map((c) => `${Math.floor(c.timeSec / 60)}:${String(Math.floor(c.timeSec % 60)).padStart(2, "0")} ${c.title}`)
      .join("\n");
    const outcome = await writeSeoWithProvider({
      topic: draft.topic || context.topic,
      audience: draft.audience || context.audience,
      promise: context.promise,
      takeaway: context.takeaway,
      cta: context.cta,
      title: context.primaryTitle,
      script: context.scriptText,
      chapters,
    });
    setAiBusy(false);
    if (!outcome.ok) {
      setAiError(outcome.message);
      return;
    }
    setDraft((d) => ({
      ...d,
      topic: d.topic || context.topic,
      audience: d.audience || context.audience,
      description: outcome.data.description,
      tags: outcome.data.tags.length > 0 ? outcome.data.tags : d.tags,
      hashtags: outcome.data.hashtags.length > 0 ? outcome.data.hashtags : d.hashtags,
    }));
    setBuilt(true);
  }

  function importChapters() {
    setDraft((d) => ({ ...d, chapters: chaptersFromSegments(context.segments) }));
  }

  function persist(approval?: typeof draft.approval) {
    saveSeo({ ...draft, approval: approval ?? draft.approval, projectId });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Primary topic" value={draft.topic} onChange={(e) => set("topic", e.target.value)} placeholder={context.topic || "What is this video about?"} />
          <Input label="Secondary topics" value={draft.secondaryTopics} onChange={(e) => set("secondaryTopics", e.target.value)} placeholder="Comma-separated angles" />
          <Input label="Search intent" value={draft.intent} onChange={(e) => set("intent", e.target.value)} placeholder="e.g. learn a setup fast" />
          <Input label="Audience" value={draft.audience} onChange={(e) => set("audience", e.target.value)} placeholder={context.audience || "Who searches this?"} />
          <Select label="Category" value={draft.category} onChange={(e) => set("category", e.target.value)}>
            {["", "Education", "Entertainment", "Science & Technology", "Howto & Style", "People & Blogs", "Gaming", "Music"].map((c) => (
              <option key={c} value={c}>{c || "Select…"}</option>
            ))}
          </Select>
          <Select label="Language" value={draft.language} onChange={(e) => set("language", e.target.value)}>
            {["English", "Spanish", "French", "German", "Yoruba", "Hausa", "Igbo"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Keywords from your script ({extracted.totalWords} eligible words)</h4>
          </div>
          {extracted.keywords.length === 0 ? (
            <p className="mt-1 text-xs text-muted-text">No repeated terms yet — keywords derive from script frequency, never invented volumes.</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested keywords with real counts">
              {extracted.keywords.map((k) => {
                const on = draft.keywords.includes(k.term);
                return (
                  <li key={k.term}>
                    <button
                      type="button"
                      onClick={() => set("keywords", on ? draft.keywords.filter((x) => x !== k.term) : [...draft.keywords, k.term])}
                      aria-pressed={on}
                      title={`${k.count} occurrences`}
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"}`}
                    >
                      {k.term} ×{k.count}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input label="Tags (comma-separated)" value={draft.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
            <Input label="Hashtags (comma-separated)" value={draft.hashtags.join(", ")} onChange={(e) => set("hashtags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Chapters ({draft.chapters.length})</h4>
            <Button size="sm" variant="outline" onClick={importChapters}>
              From scene timestamps
            </Button>
          </div>
          <ChapterEditor
            chapters={draft.chapters}
            durationSec={context.durationSec}
            onChange={(chapters) => set("chapters", chapters)}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Description</h4>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={assemble}>
                <Wand2 className="size-4" aria-hidden="true" />
                Assemble draft
              </Button>
              <Button size="sm" onClick={() => void writeWithGemini()} disabled={aiBusy}>
                <Sparkles className="size-4" aria-hidden="true" />
                {aiBusy ? "Writing…" : "Write with Gemini"}
              </Button>
            </span>
          </div>
          {aiError && <p role="alert" className="mt-2 text-xs text-destructive">Gemini unavailable: {aiError}</p>}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Input label="Link label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Template" />
            <Input label="Link URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1"
            onClick={() => {
              if (linkLabel.trim() && linkUrl.trim()) {
                setLinks((l) => [...l, { label: linkLabel.trim(), url: linkUrl.trim() }]);
                setLinkLabel("");
                setLinkUrl("");
              }
            }}
          >
            Add link (only links you enter appear — nothing invented)
          </Button>
          {links.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-text" aria-label="Added links">
              {links.map((l, i) => (
                <li key={i}>{l.label}: {l.url}</li>
              ))}
            </ul>
          )}
          <Textarea label="Description (fully editable)" rows={10} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          {built && <p role="status" className="mt-1 text-xs text-success">Draft assembled — edit everything before approving.</p>}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h4 className="text-sm font-semibold">SEO review</h4>
          <p className="mt-0.5 text-xs text-muted-text">{review.summary}</p>
          <ul className="mt-2 space-y-1.5" aria-label="SEO checks">
            {review.checks.map((c) => (
              <li key={c.check} className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
                <span><span className="font-medium">{c.check}. </span><span className="text-muted-text">{c.note}</span></span>
                <Badge tone={c.verdict === "pass" ? "ok" : c.verdict === "watch" ? "warn" : "bad"}>{c.verdict}</Badge>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => persist()}>Save SEO package</Button>
            <ApprovalFlow status={draft.approval} compact onChange={(next) => { set("approval", next); persist(next); }} />
          </div>
          <div className="mt-3">
            <LocalStorageNote compact />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ChapterEditor({
  chapters,
  durationSec,
  onChange,
}: {
  chapters: Chapter[];
  durationSec: number;
  onChange: (chapters: Chapter[]) => void;
}) {
  const [time, setTime] = useState("0:00");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const timeSec = parseTimestamp(time);
    if (timeSec === null) {
      setError("Use m:ss or h:mm:ss.");
      return;
    }
    if (durationSec > 0 && timeSec > durationSec) {
      setError(`Beyond the ${formatTimestamp(durationSec)} timeline.`);
      return;
    }
    if (!title.trim()) {
      setError("Give the chapter a title.");
      return;
    }
    setError(null);
    onChange([...chapters, { timeSec, title: title.trim() }].sort((a, b) => a.timeSec - b.timeSec));
    setTitle("");
  }

  return (
    <div className="mt-2">
      {chapters.length > 0 ? (
        <ol className="space-y-1" aria-label="Chapters">
          {chapters.map((c, i) => (
            <li key={`${c.timeSec}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
              <span><span className="font-mono text-xs text-muted-text">{formatTimestamp(c.timeSec)}</span> {c.title}</span>
              <button type="button" onClick={() => onChange(chapters.filter((_, j) => j !== i))} aria-label={`Remove chapter ${c.title}`} className="text-xs text-muted-text underline">
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-text">No chapters — import from scenes or add manually. First chapter must be 0:00.</p>
      )}
      <div className="mt-2 flex gap-1.5">
        <div className="w-24">
          <Input label="Time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:15" />
        </div>
        <div className="flex-1">
          <Input label="Chapter title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Main topic" />
        </div>
        <Button size="sm" className="mt-5" onClick={add}>
          Add
        </Button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      {chapters.length > 0 && (
        <pre className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-muted/40 p-2.5 font-mono text-xs" aria-label="Chapter text preview">{chaptersToText(chapters)}</pre>
      )}
    </div>
  );
}
