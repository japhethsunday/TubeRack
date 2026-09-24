"use client";

import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useState } from "react";
import { Plus, Trash2, Star, Sparkles } from "lucide-react";
import { suggestTitlesWithProvider } from "@/src/lib/ai-client";
import { Alert } from "@/src/components/ui/Alert";
import { generateTitleDirections } from "@/src/lib/intelligence/titles";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { ApprovalFlow } from "@/src/components/package/approval";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import type { PackTitle } from "@/src/lib/package/types";
import { DownloadButton } from "@/src/components/ui/DownloadButton";
import { downloadText, safeFileName } from "@/src/lib/download";

/** Title packaging: variations, compare, primary, intel reuse. */
export function TitlesTab({
  projectId,
  topic,
  audience,
  promise = "",
  scriptText = "",
}: {
  projectId: string;
  topic: string;
  audience: string;
  promise?: string;
  scriptText?: string;
}) {
  const { titlesFor, addTitle, primaryTitleFor } = usePackaging();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("Curiosity");
  const [showDirections, setShowDirections] = useState(false);
  const intel = useIntel();
  const [freshTitles, setAiTitles] = useState<{ text: string; category: string }[] | null>(null);
  const savedTitles = intel.outputFor(projectId, "title-suggestions");
  const aiTitles = freshTitles ?? parseSavedTitles(savedTitles?.text);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  async function suggest() {
    setAiBusy(true);
    setAiError(null);
    const outcome = await suggestTitlesWithProvider({
      topic,
      audience,
      promise,
      takeaway: "",
      cta: "",
      title: primaryTitleFor(projectId)?.text ?? "",
      script: scriptText,
      chapters: "",
    });
    setAiBusy(false);
    if (outcome.ok) {
      setAiTitles(outcome.data.titles);
      intel.saveOutputFor(projectId, "title-suggestions", JSON.stringify(outcome.data.titles), "Title suggestions");
    }
    else setAiError(outcome.message);
  }

  const titles = titlesFor(projectId);
  const primary = primaryTitleFor(projectId);
  const directions = generateTitleDirections(topic, audience);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">Variations</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="Title text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Fix your hook in 8 seconds" />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {["Curiosity", "Benefit", "Story", "Question", "Specific outcome", "Contrarian", "Educational"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              if (!text.trim()) return;
              addTitle(projectId, text, category);
              setText("");
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Save variation
          </Button>
          <Button size="sm" variant="outline" onClick={() => void suggest()} disabled={aiBusy || !topic.trim()}>
            <Sparkles className="size-4" aria-hidden="true" />
            {aiBusy ? "Suggesting…" : "Suggest titles"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowDirections((s) => !s)}>
            {showDirections ? "Hide" : "Browse"} 8 direction templates
          </Button>
        </div>
        {aiError && (
          <Alert tone="warn" title="Suggestions unavailable">
            {aiError}
          </Alert>
        )}
        {aiTitles && (
          <DownloadButton
            size="xs"
            label="Download titles"
            onDownload={() => downloadText(aiTitles.map((t) => `${t.text}  [${t.category}]`).join("\n"), safeFileName(`${topic} titles`, "txt"))}
          />
        )}
        {aiTitles && (
          <ul className="space-y-1.5" aria-label="Title suggestions">
            {aiTitles.map((t) => (
              <li key={t.text} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-sm">
                <span>
                  “{t.text}” <span className="text-xs text-muted-text">{t.category} · {t.text.length} chars</span>
                </span>
                <button type="button" onClick={() => addTitle(projectId, t.text, t.category)} className="shrink-0 text-xs font-medium underline">
                  Save
                </button>
              </li>
            ))}
          </ul>
        )}
        {showDirections && (
          <ul className="space-y-2" aria-label="Title direction templates">
            {directions.map((d) => (
              <li key={d.category} className="rounded-lg bg-muted/40 p-2.5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-text">{d.category}</p>
                {d.variants.map((v) => (
                  <p key={v} className="mt-1 flex items-center justify-between gap-2">
                    <span>“{v}”</span>
                    <button type="button" onClick={() => addTitle(projectId, v, d.category)} className="shrink-0 text-xs font-medium underline">
                      Save
                    </button>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-text">
          Strategic difference, not winners: curiosity opens gaps, benefit promises outcomes, story borrows
          emotion. Nothing here is declared a guaranteed performer.
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Saved titles ({titles.length})
          {primary && <Badge tone="ok">Primary: {primary.text.length > 32 ? `${primary.text.slice(0, 32)}…` : primary.text}</Badge>}
        </h3>
        {titles.length === 0 ? (
          <EmptyState title="No titles saved" body="Save variations or direction templates. The first becomes primary — change it anytime." />
        ) : (
          <ul className="space-y-2" aria-label="Saved titles">
            {titles.map((t) => (
              <TitleRow key={t.id} projectId={projectId} title={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TitleRow({ projectId, title }: { projectId: string; title: PackTitle }) {
  const { editTitle, setTitleStatus, setPrimaryTitle, removeTitle } = usePackaging();
  const [value, setValue] = useState(title.text);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dirty = value !== title.text;

  function commit() {
    if (dirty && value.trim()) {
      try {
        editTitle(projectId, title.id, value);
      } catch {
        setValue(title.text);
      }
    } else {
      setValue(title.text);
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-3">
      <Input
        label={`Title — ${title.category}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setValue(title.text);
        }}
      />
      {dirty && <p className="mt-1 text-xs text-muted-text">Unsaved edit — blur or Enter to save (returns to draft for re-review).</p>}
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-text">
        <Badge tone="neutral">{title.category}</Badge>
        {title.isPrimary && <Badge tone="ok">Primary</Badge>}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ApprovalFlow status={title.status} compact onChange={(next) => setTitleStatus(projectId, title.id, next)} />
        {!title.isPrimary && (
          <button type="button" onClick={() => setPrimaryTitle(projectId, title.id)} aria-label={`Make primary: ${title.text.slice(0, 30)}`} className="rounded p-1.5 text-muted-text hover:bg-muted">
            <Star className="size-3.5" aria-hidden="true" />
          </button>
        )}
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <button type="button" onClick={() => removeTitle(projectId, title.id)} className="font-medium text-destructive underline">Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-text underline">Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label={`Delete title ${title.text.slice(0, 30)}`} className="rounded p-1.5 text-muted-text hover:text-destructive">
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

function parseSavedTitles(text: string | undefined): { text: string; category: string }[] | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return Array.isArray(v) ? v.filter((t): t is { text: string; category: string } => typeof t?.text === "string" && typeof t?.category === "string") : null;
  } catch {
    return null;
  }
}
