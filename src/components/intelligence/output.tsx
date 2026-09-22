import { useState } from "react";
import { ChevronDown, Pencil, Check, X, Lightbulb } from "lucide-react";
import type { AssembledContext } from "@/src/lib/intelligence/context";
import type { DimensionRating } from "@/src/lib/intelligence/idea";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Textarea } from "@/src/components/ui/fields";
import { cx } from "@/src/components/ui/cx";

/** Native expandable section: keyboard + screen-reader support built in. */
export function OutputSection({
  title,
  badge,
  children,
  defaultOpen,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-lg border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>
          {title}
          {badge && (
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-text">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
      </summary>
      <div className="border-t border-border px-4 py-3 text-sm">{children}</div>
    </details>
  );
}

const RATING_TONES: Record<DimensionRating, "ok" | "warn" | "bad"> = {
  strong: "ok",
  developing: "warn",
  gap: "bad",
};

const RATING_LABELS: Record<DimensionRating, string> = {
  strong: "Strong",
  developing: "Developing",
  gap: "Gap",
};

/** Qualitative rating badge — never a number. */
export function RatingBadge({ rating }: { rating: DimensionRating }) {
  return <Badge tone={RATING_TONES[rating]}>{RATING_LABELS[rating]}</Badge>;
}

export function MethodologyNote({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs leading-relaxed text-muted-text">
      <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">Methodology. </span>
        {text}
      </span>
    </p>
  );
}

/** Declares exactly what fed a run: parts, completeness, gaps. */
export function ContextChips({ context }: { context: AssembledContext }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium">Assembled context</span>
        <span className="text-muted-text" aria-live="polite">
          {context.completeness}% complete
        </span>
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Context parts">
        {context.parts.map((p) => (
          <li key={p.label}>
            <Badge tone={p.present ? "ok" : "preview"}>{p.label}</Badge>
          </li>
        ))}
      </ul>
      {context.missing.length > 0 && (
        <p className="mt-2 text-xs text-muted-text">
          Missing: {context.missing.join(", ")} — runs still work, but thinner input means thinner output.
        </p>
      )}
    </div>
  );
}

/** View-then-edit field: the creator is never trapped by generated text. */
export function EditableText({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="group flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{value || <span className="text-muted-text">—</span>}</p>
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          aria-label={`Edit ${label}`}
          className="shrink-0 rounded-md p-1.5 text-muted-text opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea label={label} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          <Check className="size-4" aria-hidden="true" />
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function VersionHistory({ entries }: { entries: { at: string; kind: string; summary: string }[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-text">No versions yet — saves and reviews version here.</p>;
  }
  return (
    <ol className={cx("space-y-1.5")} aria-label="Version history">
      {entries.slice(0, 8).map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex items-baseline justify-between gap-3 text-xs">
          <span>
            <span className="font-medium capitalize">{e.kind}</span>
            <span className="text-muted-text"> — {e.summary}</span>
          </span>
          <time dateTime={e.at} className="shrink-0 text-muted-text">
            {new Date(e.at).toLocaleDateString()}
          </time>
        </li>
      ))}
    </ol>
  );
}
