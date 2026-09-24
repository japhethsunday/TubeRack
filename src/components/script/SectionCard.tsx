"use client";

import { useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Copy,
  Scissors,
  Combine,
  Trash2,
  FlaskConical,
  Scissors as ShortenIcon,
  Wand2,
  StickyNote,
  BookOpen,
} from "lucide-react";
import type { Claim, ScriptSection } from "@/src/lib/script/types";
import { countWords, estimateSeconds, extractShorten } from "@/src/lib/script/measure";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Input, Textarea } from "@/src/components/ui/fields";
import { Badge } from "@/src/components/ui/Badge";
import { rewriteSectionWithProvider } from "@/src/lib/ai-client";
import { cx } from "@/src/components/ui/cx";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";

/**
 * One script section: editor, metadata, tools, notes, refs, claims.
 * Destructive or AI actions always preview first — never silent.
 */
export function SectionCard({
  section,
  index,
  total,
  wpm,
  claims,
  match,
  onText,
  onNotes,
  onMove,
  onSplit,
  onDuplicate,
  onMerge,
  onDelete,
  onShorten,
  onAddRef,
  onRemoveRef,
  topic = "",
}: {
  section: ScriptSection;
  index: number;
  total: number;
  wpm: number;
  claims: Claim[];
  match: boolean;
  onText: (text: string) => void;
  onNotes: (notes: string) => void;
  onMove: (dir: -1 | 1) => void;
  onSplit: () => void;
  onDuplicate: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onShorten: (text: string) => void;
  onAddRef: (fact: string, source: string) => void;
  onRemoveRef: (refId: string) => void;
  topic?: string;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [showRefs, setShowRefs] = useState(false);
  const [shortenPreview, setShortenPreview] = useState<string | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteNote, setRewriteNote] = useState("");
  const [rewriteDraft, setRewriteDraft] = useState<string | null>(null);
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  async function runRewrite() {
    setRewriteBusy(true);
    setRewriteError(null);
    const outcome = await rewriteSectionWithProvider({ heading: section.heading, text: section.text, instruction: rewriteNote, topic });
    setRewriteBusy(false);
    if (outcome.ok) setRewriteDraft(outcome.data.text);
    else setRewriteError(outcome.message);
  }
  const [refFact, setRefFact] = useState("");
  const [refSource, setRefSource] = useState("");
  const words = countWords(section.text);

  return (
    <article
      aria-label={`Section ${index + 1}: ${section.heading}`}
      id={`section-${section.id}`}
      className={cx(
        "rounded-xl border bg-surface p-4",
        match ? "border-primary" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs text-muted-text">
            {index + 1}
          </span>
          {section.heading}
          <Badge tone="neutral">{section.type}</Badge>
          {section.aiGenerated && <Badge tone="preview">Local assembly</Badge>}
          {section.edited && <Badge tone="info">Edited</Badge>}
        </h3>
        <p className="text-xs text-muted-text" aria-label={`${words} words, about ${estimateSeconds(words, wpm)} seconds`}>
          {words}w · ~{estimateSeconds(words, wpm)}s
        </p>
      </div>

      <div className="mt-2">
        <label htmlFor={`text-${section.id}`} className="sr-only">
          {section.heading} text
        </label>
        <textarea
          id={`text-${section.id}`}
          value={section.text}
          onChange={(e) => onText(e.target.value)}
          rows={Math.min(14, Math.max(4, Math.ceil(section.text.length / 90)))}
          placeholder="Write here — or assemble from intelligence to start…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed placeholder:text-disabled-text hover:border-muted-text/50"
        />
      </div>

      {section.aiNote && (
        <p className="mt-1.5 text-xs text-muted-text">{section.aiNote}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-1" role="toolbar" aria-label={`${section.heading} tools`}>
        <ToolButton label="Move up" disabled={index === 0} onClick={() => onMove(-1)} icon={<ArrowUp className="size-3.5" />} />
        <ToolButton label="Move down" disabled={index === total - 1} onClick={() => onMove(1)} icon={<ArrowDown className="size-3.5" />} />
        <ToolButton label="Split section" onClick={onSplit} icon={<Scissors className="size-3.5" />} />
        <ToolButton label="Duplicate" onClick={onDuplicate} icon={<Copy className="size-3.5" />} />
        <ToolButton label="Merge with next" disabled={index === total - 1} onClick={onMerge} icon={<Combine className="size-3.5" />} />
        <ToolButton
          label="Shorten (extractive preview)"
          onClick={() => setShortenPreview(extractShorten(section.text))}
          icon={<ShortenIcon className="size-3.5" />}
        />
        <ToolButton label="Rewrite" disabled={!section.text.trim()} onClick={() => { setRewriteDraft(null); setRewriteError(null); setRewriteOpen(true); }} icon={<Wand2 className="size-3.5" />} />
        <ToolButton label="Delete section" danger onClick={onDelete} icon={<Trash2 className="size-3.5" />} />
        <ToolButton
          label={showNotes ? "Hide creator notes" : "Creator notes"}
          active={showNotes}
          onClick={() => setShowNotes((s) => !s)}
          icon={<StickyNote className="size-3.5" />}
        />
        <ToolButton
          label={showRefs ? "Hide research refs" : `Research refs (${section.researchRefs.length})`}
          active={showRefs}
          onClick={() => setShowRefs((s) => !s)}
          icon={<BookOpen className="size-3.5" />}
        />
      </div>

      {claims.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Detected claims (unverified)">
          {claims.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-xs">
              <span className="text-muted-text">
                <span className="font-medium text-foreground">[{c.kind}]</span> {c.text}
              </span>
              <Badge tone="warn">Unverified</Badge>
            </li>
          ))}
        </ul>
      )}

      {showNotes && (
        <div className="mt-2 rounded-lg border border-dashed border-border p-3">
          <Textarea
            label="Creator notes (never narrated, never sent to AI unless applied)"
            rows={2}
            value={section.creatorNotes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="Private direction for yourself…"
          />
        </div>
      )}

      {showRefs && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium">Research references (verify before publishing)</p>
          {section.researchRefs.length === 0 && (
            <p className="text-xs text-muted-text">None attached. Add facts with their source — never invent citations.</p>
          )}
          <ul className="space-y-1.5">
            {section.researchRefs.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                <span>
                  <span className="block">{r.fact}</span>
                  <span className="text-muted-text">Source: {r.source} · </span>
                  <Badge tone="warn">Unverified</Badge>
                </span>
                <button type="button" onClick={() => onRemoveRef(r.id)} aria-label={`Remove reference ${r.fact.slice(0, 30)}`} className="shrink-0 rounded p-1 text-muted-text hover:text-destructive">
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input label="Fact" value={refFact} onChange={(e) => setRefFact(e.target.value)} placeholder="What the source says…" />
            <Input label="Source" value={refSource} onChange={(e) => setRefSource(e.target.value)} placeholder="URL, title, or author…" />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!refFact.trim()) return;
              onAddRef(refFact, refSource);
              setRefFact("");
              setRefSource("");
            }}
          >
            Attach reference
          </Button>
        </div>
      )}

      {shortenPreview !== null && (
        <Modal title="Shorten — review extract" description="Extractive preview: keeps the opening plus highest-density sentences." onClose={() => setShortenPreview(null)}>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
            {shortenPreview || <span className="text-muted-text">Nothing to extract — section is already minimal.</span>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShortenPreview(null)}>
              Discard
            </Button>
            <Button
              onClick={() => {
                onShorten(shortenPreview);
                setShortenPreview(null);
              }}
            >
              <FlaskConical className="size-4" aria-hidden="true" />
              Apply extract
            </Button>
          </div>
        </Modal>
      )}

      {rewriteOpen && (
        <Modal title={`Rewrite “${section.heading}”`} description="Rewrites this section. Review it before replacing — save a version first if you want to keep the original." onClose={() => setRewriteOpen(false)}>
          <div className="space-y-3">
            <Textarea
              label="How should it change? (optional)"
              rows={2}
              value={rewriteNote}
              onChange={(e) => setRewriteNote(e.target.value)}
              placeholder="e.g. punchier, add a concrete example, cut to 60 words…"
            />
            {rewriteError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{rewriteError}</p>}
            {rewriteDraft !== null && (
              <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed" aria-label="Rewritten section">
                {rewriteDraft}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRewriteOpen(false)}>
                Cancel
              </Button>
              <Button variant={rewriteDraft !== null ? "outline" : "primary"} loading={rewriteBusy} onClick={() => void runRewrite()}>
                <Wand2 className="size-4" aria-hidden="true" />
                {rewriteDraft !== null ? "Try again" : "Rewrite"}
              </Button>
              {rewriteDraft !== null && (
                <DownloadButton label="Download" onDownload={() => downloadText(rewriteDraft, safeFileName(`${section.heading} rewrite`, "txt"))} />
              )}
              {rewriteDraft !== null && (
                <Button
                  onClick={() => {
                    onText(rewriteDraft);
                    setRewriteOpen(false);
                  }}
                >
                  Replace section
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </article>
  );
}

function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
  active,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150",
        danger ? "text-destructive hover:bg-destructive/10" : "text-muted-text hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="hidden xl:inline">{label.split(" (")[0]}</span>
    </button>
  );
}
