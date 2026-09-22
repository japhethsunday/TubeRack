"use client";

import { useState } from "react";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { dnaFields } from "@/src/lib/intelligence/dna";
import { Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { LocalStorageNote } from "@/src/components/projects/ProjectsProvider";

/**
 * Visual consistency settings per project, prefillable from Brand DNA.
 * Reusable structured context for every generation — never a guarantee,
 * stated as direction.
 */
export function ConsistencyPanel({ projectId, channelId }: { projectId: string; channelId: string }) {
  const { consistencyFor, saveConsistency } = useMedia();
  const { dnaFor } = useIntel();
  const current = consistencyFor(projectId);
  const [draft, setDraft] = useState<Record<string, string>>({
    visualStyle: current.visualStyle,
    colorDirection: current.colorDirection,
    lighting: current.lighting,
    cameraLanguage: current.cameraLanguage,
    characterNotes: current.characterNotes,
    environmentStyle: current.environmentStyle,
    avoidStyles: current.avoidStyles,
  });
  const [saved, setSaved] = useState(false);

  const FIELDS: { key: keyof typeof draft; label: string; hint: string }[] = [
    { key: "visualStyle", label: "Visual style", hint: "e.g. cinematic documentary, flat illustration" },
    { key: "colorDirection", label: "Color direction", hint: "e.g. warm highlights, teal shadows" },
    { key: "lighting", label: "Lighting preference", hint: "e.g. soft key, motivated contrast" },
    { key: "cameraLanguage", label: "Camera language", hint: "e.g. slow push-ins, locked tripod" },
    { key: "characterNotes", label: "Character description", hint: "Recurring subject, outfit, features" },
    { key: "environmentStyle", label: "Environment style", hint: "Recurring locations and dressing" },
    { key: "avoidStyles", label: "Styles to avoid", hint: "e.g. gore, photoreal faces, clutter" },
  ];

  function prefillFromDNA() {
    const dna = dnaFor(channelId);
    setDraft((d) => ({
      ...d,
      visualStyle: d.visualStyle || dna.visualIdentity,
      colorDirection: d.colorDirection || dna.positioning,
      avoidStyles: d.avoidStyles || dna.avoidWords,
    }));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    saveConsistency({
      projectId,
      visualStyle: draft.visualStyle.trim(),
      colorDirection: draft.colorDirection.trim(),
      lighting: draft.lighting.trim(),
      cameraLanguage: draft.cameraLanguage.trim(),
      characterNotes: draft.characterNotes.trim(),
      environmentStyle: draft.environmentStyle.trim(),
      avoidStyles: draft.avoidStyles.trim(),
      updatedAt: new Date().toISOString(),
    });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Visual consistency</h3>
          <p className="text-xs text-muted-text">
            Direction reused by every generation — improves odds, guarantees nothing. {dnaFields().length} DNA fields available to prefill.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={prefillFromDNA}>
          Prefill from Brand DNA
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Textarea
            key={f.key}
            label={f.label}
            rows={2}
            value={draft[f.key]}
            hint={f.hint}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
          />
        ))}
      </div>
      <LocalStorageNote compact />
      <div className="flex items-center gap-3">
        <Button type="submit">Save consistency</Button>
        {saved && (
          <p role="status" className="text-sm text-success">
            Saved on this device.
          </p>
        )}
      </div>
    </form>
  );
}
