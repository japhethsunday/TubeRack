"use client";

import { useState } from "react";
import { Lightbulb, Link2, History, Check } from "lucide-react";
import type { LoopItem, ScriptSection } from "@/src/lib/script/types";
import { unpaidLoops, diffVersions, type VersionDiff } from "@/src/lib/script/engine";
import type { SectionSuggestion } from "@/src/lib/script/review";
import { hookFrameworks } from "@/src/lib/intelligence/hooks";
import { Button } from "@/src/components/ui/Button";
import { Input, Select } from "@/src/components/ui/fields";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { Modal } from "@/src/components/ui/overlays";

/** Dismissible local suggestions — specific, actionable, never overwhelming. */
export function SuggestionsPanel({ suggestions }: { suggestions: SectionSuggestion[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = suggestions.filter((s, i) => !dismissed.includes(`${s.sectionId}-${s.kind}-${i}`));
  if (visible.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">
        No suggestions — the local checks are quiet
        {suggestions.length > 0 ? " (all dismissed)." : "."}
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Writing suggestions">
      {visible.map((s, i) => (
        <li key={`${s.sectionId}-${s.kind}-${i}`} className="rounded-lg border border-border p-3 text-sm">
          <p className="flex items-center justify-between gap-2 font-medium">
            <span className="flex items-center gap-1.5">
              <Lightbulb className="size-3.5 text-warning" aria-hidden="true" />
              {s.heading} — {s.message}
            </span>
          </p>
          <p className="mt-0.5 text-muted-text">{s.detail}</p>
          <button
            type="button"
            onClick={() => setDismissed((d) => [...d, `${s.sectionId}-${s.kind}-${i}`])}
            className="mt-1.5 text-xs font-medium text-muted-text underline"
          >
            Dismiss
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Open loops, questions, promises, teasers — with payoff tracking. */
export function LoopsPanel({
  loops,
  sections,
  onAdd,
  onResolve,
  onRemove,
}: {
  loops: LoopItem[];
  sections: ScriptSection[];
  onAdd: (input: Omit<LoopItem, "id">) => void;
  onResolve: (id: string, payoffSectionId: string) => void;
  onRemove: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<LoopItem["kind"]>("loop");
  const [openedIn, setOpenedIn] = useState(sections[0]?.id ?? "");
  const unpaid = unpaidLoops(loops);

  return (
    <div className="space-y-3">
      {unpaid.length > 0 && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          {unpaid.length} unpaid {unpaid.length === 1 ? "thread" : "threads"} — every opened idea needs its payoff.
        </p>
      )}
      {loops.length === 0 ? (
        <EmptyState
          title="No threads tracked"
          body="Log loops, questions, promises, and teasers as you write, then link each to the section that pays it off."
        />
      ) : (
        <ul className="space-y-2" aria-label="Tracked threads">
          {loops.map((l) => (
            <li key={l.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center justify-between gap-2">
                <span>
                  <Badge tone={l.payoffSectionId ? "ok" : "warn"}>{l.payoffSectionId ? "Paid off" : "Open"}</Badge>{" "}
                  <span className="font-medium capitalize">{l.kind}</span>
                </span>
                <button type="button" onClick={() => onRemove(l.id)} aria-label={`Remove thread ${l.text.slice(0, 30)}`} className="text-xs text-muted-text underline">
                  Remove
                </button>
              </p>
              <p className="mt-1">{l.text}</p>
              {l.payoffSectionId ? (
                <p className="mt-1 text-xs text-muted-text">
                  Paid off in: {sections.find((s) => s.id === l.payoffSectionId)?.heading ?? "deleted section"}
                </p>
              ) : (
                <span className="mt-2 flex items-center gap-2">
                  <Select label={`Payoff section for thread`} value="" onChange={(e) => e.target.value && onResolve(l.id, e.target.value)}>
                    <option value="">Link payoff…</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.heading}
                      </option>
                    ))}
                  </Select>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
        <Input label="New thread" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. the failed launch story…" />
        <div className="grid grid-cols-2 gap-2">
          <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value as LoopItem["kind"])}>
            <option value="loop">Open loop</option>
            <option value="question">Question</option>
            <option value="promise">Promise</option>
            <option value="teaser">Teaser</option>
          </Select>
          <Select label="Opened in" value={openedIn} onChange={(e) => setOpenedIn(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.heading}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (!text.trim() || !openedIn) return;
            onAdd({ kind, text: text.trim(), openedInSectionId: openedIn });
            setText("");
          }}
        >
          Track thread
        </Button>
      </div>
    </div>
  );
}

/** Version save/restore/compare with automatic pre-restore backups. */
export function VersionsPanel({
  versions,
  currentSections,
  onSave,
  onRestore,
}: {
  versions: import("@/src/lib/script/types").ScriptVersion[];
  currentSections: ScriptSection[];
  onSave: (name: string, note: string) => void;
  onRestore: (versionId: string) => void;
}) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [diff, setDiff] = useState<(VersionDiff & { name: string }) | null>(null);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-lg border border-dashed border-border p-3">
        <Input label="Version name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hook rewrite v2" />
        <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why…" />
        <Button size="sm" variant="outline" onClick={() => { onSave(name, note); setName(""); setNote(""); }}>
          <History className="size-4" aria-hidden="true" />
          Save version
        </Button>
      </div>
      {versions.length === 0 ? (
        <p className="text-xs text-muted-text">No versions yet. Save before big rewrites — restores back up current work first.</p>
      ) : (
        <ul className="space-y-2" aria-label="Script versions">
          {versions.map((v) => (
            <li key={v.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center justify-between gap-2 font-medium">
                {v.name}
                <span className="text-xs font-normal text-muted-text">{new Date(v.at).toLocaleString()}</span>
              </p>
              {v.note && <p className="mt-0.5 text-xs text-muted-text">{v.note}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDiff({
                      name: v.name,
                      ...diffVersions(v, {
                        id: "current",
                        name: "Current",
                        note: "",
                        at: new Date().toISOString(),
                        sections: currentSections,
                      }),
                    })
                  }
                  className="text-xs font-medium text-muted-text underline"
                >
                  Compare to current
                </button>
                <button
                  type="button"
                  onClick={() => onRestore(v.id)}
                  className="text-xs font-medium text-muted-text underline"
                >
                  Restore (backs up current first)
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {diff && (
        <p role="status" className="rounded-lg bg-muted/50 p-3 text-xs">
          {diff.name}: +{diff.added} section(s), −{diff.removed}, ~{diff.changed} changed, {diff.wordDelta >= 0 ? "+" : ""}{diff.wordDelta} words vs current.
        </p>
      )}
    </div>
  );
}

/** Hook builder: frameworks + approved hooks → reviewed replacement. */
export function HookBuilder({
  topic,
  approvedHooks,
  currentHook,
  onUse,
}: {
  topic: string;
  approvedHooks: { id: string; text: string }[];
  currentHook: string;
  onUse: (text: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const frameworks = hookFrameworks(topic).slice(0, 6);

  return (
    <div className="space-y-2">
      {approvedHooks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-text">Approved in intelligence</p>
          <ul className="mt-1 space-y-1">
            {approvedHooks.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
                <span className="truncate">“{h.text}”</span>
                <button type="button" onClick={() => setConfirm(h.text)} className="shrink-0 text-xs font-medium text-muted-text underline">
                  Use
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs font-medium text-muted-text">Framework starters</p>
      <ul className="space-y-1">
        {frameworks.map((f) => (
          <li key={f.type} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{f.type}. </span>
              <span className="text-muted-text">“{f.starter}”</span>
            </span>
            <button type="button" onClick={() => setConfirm(f.starter)} className="shrink-0 text-xs font-medium text-muted-text underline">
              Use
            </button>
          </li>
        ))}
      </ul>
      {confirm !== null && (
        <Modal title="Replace the hook?" description="Current hook is snapshotted into versions first." onClose={() => setConfirm(null)}>
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="text-muted-text line-through">{currentHook || "(empty)"}</p>
            <p className="mt-1 font-medium">“{confirm}”</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Keep current
            </Button>
            <Button
              onClick={() => {
                onUse(confirm);
                setConfirm(null);
              }}
            >
              <Check className="size-4" aria-hidden="true" />
              <Link2 className="size-4" aria-hidden="true" />
              Replace hook
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
