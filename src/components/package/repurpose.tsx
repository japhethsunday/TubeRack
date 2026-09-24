"use client";

import { useState } from "react";
import { Sparkles, Copy, Trash2 } from "lucide-react";
import { PLATFORMS, ADAPTATION_RULES, findMoments, adaptMoment, checkConsistency, type Moment } from "@/src/lib/package/platforms";
import type { RepurposeKind } from "@/src/lib/package/types";
import { GeminiAssist } from "@/src/components/intelligence/GeminiAssist";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { ApprovalFlow } from "@/src/components/package/approval";
import { Select, Input, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { EmptyState } from "@/src/components/ui/states";
import { MethodologyNote } from "@/src/components/intelligence/output";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import type { PlatformId } from "@/src/lib/package/types";

const KINDS: { id: RepurposeKind; label: string; platforms: PlatformId[] }[] = [
  { id: "short-clip", label: "Short clip plan", platforms: ["shorts", "tiktok", "reels"] },
  { id: "tiktok-script", label: "TikTok script", platforms: ["tiktok"] },
  { id: "reel-caption", label: "Reel caption", platforms: ["reels"] },
  { id: "x-post", label: "X post", platforms: ["x"] },
  { id: "x-thread", label: "X thread", platforms: ["x"] },
  { id: "linkedin-post", label: "LinkedIn post", platforms: ["linkedin"] },
  { id: "instagram-caption", label: "Instagram caption", platforms: ["reels"] },
  { id: "community-post", label: "Community post", platforms: ["youtube"] },
  { id: "quote", label: "Quote graphic", platforms: ["reels", "x", "linkedin"] },
  { id: "carousel", label: "Carousel concept", platforms: ["reels", "linkedin"] },
  { id: "blog-outline", label: "Blog outline", platforms: ["youtube"] },
  { id: "newsletter", label: "Newsletter section", platforms: ["youtube"] },
];

export interface RepurposeContext {
  hooks: { id: string; text: string }[];
  sections: { id: string; type: string; heading: string; text: string }[];
  claims: { text: string; kind: string }[];
  hashtags: string[];
  cta: string;
  avoidWords: string[];
  sourceLabel: string;
}

/** Repurposing engine: moments → platform adaptations → edited approvals. */
export function RepurposeWorkspace({ projectId, context }: { projectId: string; context: RepurposeContext }) {
  const { itemsFor, addItem, updateItem, setItemStatus, removeItem } = usePackaging();
  const [momentId, setMomentId] = useState<string>("");
  const [kind, setKind] = useState<RepurposeKind>("x-post");
  const [platform, setPlatform] = useState<PlatformId>("x");
  const [cta, setCta] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const moments = findMoments({ hooks: context.hooks, sections: context.sections, claims: context.claims });
  const moment = moments.find((m) => m.id === momentId) ?? moments[0] ?? null;
  const kindDef = KINDS.find((k) => k.id === kind);
  const items = itemsFor(projectId);
  const sourceText = context.sections.map((s) => s.text).join("\n");

  function generate() {
    if (!moment) return;
    const target = kindDef?.platforms.includes(platform) ? platform : (kindDef?.platforms[0] ?? platform);
    const out = adaptMoment(moment, kind, target, {
      cta: cta.trim() || context.cta,
      hashtags: context.hashtags,
    });
    addItem(projectId, {
      kind,
      platform: target,
      hook: out.hook,
      body: out.body,
      cta: out.cta,
      sourceRef: `${moment.source} — “${moment.text.slice(0, 80)}”`,
    });
  }

  return (
    <div className="space-y-4">
    <GeminiAssist
      task="repurpose-plan"
      title="Repurpose"
      blurb="Writes ready-to-post Shorts scripts, a thread, a LinkedIn post, and a community post from this script."
      disabledReason={context.sections.length === 0 ? "Write the script first ; repurposing uses your real sections." : undefined}
      context={{
        source: context.sourceLabel,
        hooks: context.hooks.map((h) => h.text),
        sections: context.sections.map((s) => ({ heading: s.heading, text: s.text.slice(0, 700) })),
        hashtags: context.hashtags,
        cta: context.cta,
        avoidWords: context.avoidWords.filter(Boolean),
      }}
    />
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">1 · Pick a moment ({moments.length} found)</h3>
        {moments.length === 0 ? (
          <EmptyState
            title="No reusable moments yet"
            body="Approve hooks, write climax sections, or record statistic claims — moments surface here automatically."
          />
        ) : (
          <ul className="max-h-56 space-y-1.5 overflow-y-auto" aria-label="Reusable moments">
            {moments.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMomentId(m.id)}
                  aria-pressed={moment?.id === m.id}
                  className={`w-full rounded-lg border p-2.5 text-left text-sm transition-colors ${moment?.id === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-text">
                    {m.kind} · {m.source}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block">{m.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-sm font-semibold">2 · Adapt it</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select label="Format" value={kind} onChange={(e) => {
            const next = e.target.value as RepurposeKind;
            setKind(next);
            const def = KINDS.find((k) => k.id === next);
            if (def && !def.platforms.includes(platform)) setPlatform(def.platforms[0]);
          }}>
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </Select>
          <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label} — {p.captionTarget}</option>
            ))}
          </Select>
        </div>
        <Input label="CTA override (optional)" value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Defaults to project CTA" />
        <Button onClick={generate} disabled={!moment}>
          <Sparkles className="size-4" aria-hidden="true" />
          Generate adaptation
        </Button>
        <MethodologyNote text="Deterministic reshaping (truncate, reorder, hashtag, CTA) of the selected moment under per-platform rules. No new facts are ever introduced by the adapter — flags below prove it." />
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Derivatives ({items.length}) — edit everything, approve explicitly</h3>
        {items.length === 0 ? (
          <EmptyState title="Nothing repurposed yet" body="Generated outputs land here editable. Approval never publishes — publishing is a separate later workflow." />
        ) : (
          <ul className="space-y-2" aria-label="Repurposed derivatives">
            {items.map((item) => {
              const flags = checkConsistency(item, sourceText, context.avoidWords);
              return (
                <li key={item.id} className="rounded-xl border border-border bg-surface p-3">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {item.kind} → {item.platform}
                    <Badge tone={item.status === "ready" ? "ok" : item.status === "approved" ? "ok" : item.status === "review" ? "info" : "neutral"}>{item.status}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-text">From: {item.sourceRef}</p>
                  <Textarea label="Hook" rows={2} value={item.hook} onChange={(e) => updateItem(projectId, item.id, { hook: e.target.value })} />
                  <div className="mt-2">
                    <Textarea label="Body" rows={4} value={item.body} onChange={(e) => updateItem(projectId, item.id, { body: e.target.value })} />
                  </div>
                  <Input label="CTA" value={item.cta} onChange={(e) => updateItem(projectId, item.id, { cta: e.target.value })} />
                  {flags.length > 0 && (
                    <ul className="mt-2 space-y-1" aria-label="Consistency flags">
                      {flags.map((f, i) => (
                        <li key={i} className={`rounded-lg p-2 text-xs ${f.level === "issue" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                          {f.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ApprovalFlow status={item.status} compact onChange={(next) => setItemStatus(projectId, item.id, next)} />
                    <button
                      type="button"
                      onClick={() => {
                        addItem(projectId, { kind: item.kind, platform: item.platform, hook: item.hook, body: item.body, cta: item.cta, sourceRef: `${item.sourceRef} (variant)` });
                      }}
                      aria-label={`Duplicate ${item.kind}`}
                      className="rounded p-1.5 text-muted-text hover:bg-muted"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                    </button>
                    {confirmDelete === item.id ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <button type="button" onClick={() => { removeItem(projectId, item.id); setConfirmDelete(null); }} className="font-medium text-destructive underline">Delete</button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="text-muted-text underline">Keep</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmDelete(item.id)} aria-label={`Delete ${item.kind}`} className="rounded p-1.5 text-muted-text hover:text-destructive">
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <LocalStorageNote compact />
      </div>
    </div>
    </div>
  );
}

export type { Moment };
