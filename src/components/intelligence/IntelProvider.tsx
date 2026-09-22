"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { ChannelDNA } from "@/src/lib/intelligence/dna";
import { emptyDNA, parseDNA } from "@/src/lib/intelligence/dna";
import type {
  AudienceProfile,
  StrategyBrief,
} from "@/src/lib/intelligence/profiles";
import type {
  IntelItemStatus,
  Opportunity,
  OpportunityInput,
  OpportunityStatus,
  ProjectIntel,
  RetentionRecord,
} from "@/src/lib/intelligence/shelf";
import {
  addIntelItem,
  addRetentionRecord,
  editIntelItem,
  emptyIntel,
  intelCounts,
  saveAudience,
  saveBrief,
  saveOpportunity,
  saveStrategy,
  setIntelItemStatus,
  setOpportunityStatus,
} from "@/src/lib/intelligence/shelf";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, pushBundle, mergeMaps } from "@/src/lib/sync";

const bundleSchema = z.object({
  version: z.literal(1),
  dna: z.record(z.string(), z.unknown()),
  intel: z.record(z.string(), z.unknown()),
  opportunities: z.array(z.unknown()),
});

function mergeOpportunities(local: Opportunity[], remote: Opportunity[]): Opportunity[] {
  const merged = new Map<string, Opportunity>();
  for (const o of local) merged.set(o.id, o);
  for (const o of remote) {
    if (o && typeof o.id === "string" && typeof o.title === "string") merged.set(o.id, o as Opportunity);
  }
  return [...merged.values()];
}

export interface IntelBundle {
  version: 1;
  dna: Record<string, ChannelDNA>;
  intel: Record<string, ProjectIntel>;
  opportunities: Opportunity[];
}

export const INTEL_STORAGE_KEY = "tuberack.intel.v1";

function emptyIntelBundle(): IntelBundle {
  return { version: 1, dna: {}, intel: {}, opportunities: [] };
}

function readIntel(): IntelBundle {
  try {
    const raw = localStorage.getItem(INTEL_STORAGE_KEY);
    if (!raw) return emptyIntelBundle();
    const parsed = bundleSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return emptyIntelBundle();
    const dna: Record<string, ChannelDNA> = {};
    for (const [k, v] of Object.entries(parsed.data.dna)) {
      try {
        dna[k] = parseDNA(v);
      } catch {
        // Drop corrupt DNA entries, keep the rest.
      }
    }
    const intel: Record<string, ProjectIntel> = {};
    for (const [k, v] of Object.entries(parsed.data.intel)) {
      if (v && typeof v === "object" && (v as { projectId?: unknown }).projectId === k) {
        intel[k] = v as ProjectIntel;
      }
    }
    return {
      version: 1,
      dna,
      intel,
      opportunities: parsed.data.opportunities.filter(
        (o): o is Opportunity => Boolean(o && typeof o === "object" && "id" in o && "title" in o),
      ),
    };
  } catch {
    return emptyIntelBundle();
  }
}

interface IntelContextValue {
  ready: boolean;
  dnaFor: (channelId: string) => ChannelDNA;
  saveDNA: (dna: ChannelDNA) => void;
  intelFor: (projectId: string) => ProjectIntel;
  saveAudienceFor: (projectId: string, audience: AudienceProfile) => void;
  saveStrategyFor: (projectId: string, strategy: StrategyBrief) => void;
  addTitle: (projectId: string, text: string, note: string) => void;
  addHook: (projectId: string, text: string, note: string) => void;
  setItemStatus: (projectId: string, field: "titles" | "hooks", id: string, status: IntelItemStatus) => void;
  editItem: (projectId: string, field: "titles" | "hooks", id: string, text: string) => void;
  addRetention: (projectId: string, record: Omit<RetentionRecord, "id" | "createdAt">) => void;
  saveBriefFor: (projectId: string, brief: string) => void;
  countsFor: (projectId: string) => ReturnType<typeof intelCounts>;
  opportunities: Opportunity[];
  saveOpportunity: (input: OpportunityInput) => void;
  setOpportunityStatus: (id: string, status: OpportunityStatus) => void;
}

const Ctx = createContext<IntelContextValue | null>(null);

export function useIntel(): IntelContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useIntel must be used inside IntelProvider.");
  return ctx;
}

export function IntelProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<IntelBundle>(emptyIntelBundle());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("intel", true);
          if (!cancelled && remote) {
            const parsed = bundleSchema.safeParse(remote);
            if (parsed.success) {
              const dna: Record<string, ChannelDNA> = {};
              for (const [k, v] of Object.entries(parsed.data.dna)) {
                try {
                  dna[k] = parseDNA(v);
                } catch {
                  // Drop corrupt DNA entries.
                }
              }
              setBundle((local) => ({
                version: 1,
                dna: mergeMaps(local.dna, dna),
                intel: mergeMaps(local.intel, parsed.data.intel as Record<string, ProjectIntel>),
                opportunities: mergeOpportunities(local.opportunities, parsed.data.opportunities as Opportunity[]),
              }));
              setReady(true);
              return;
            }
          }
        } catch {
          // Fall through to device storage.
        }
      }
      if (!cancelled) {
        setBundle(readIntel());
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloud]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(INTEL_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const timer = window.setTimeout(() => {
      void pushBundle("intel", true, { ...bundle, deletedOpportunityIds: [] }).catch(() => {
        // Offline: local mirror holds.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bundle, ready, cloud]);

  const patchIntel = useCallback(
    (projectId: string, fn: (i: ProjectIntel) => ProjectIntel) =>
      setBundle((b) => ({ ...b, intel: { ...b.intel, [projectId]: fn(b.intel[projectId] ?? emptyIntel(projectId)) } })),
    [],
  );

  const value = useMemo<IntelContextValue>(
    () => ({
      ready,
      dnaFor: (channelId) => bundle.dna[channelId] ?? emptyDNA(channelId),
      saveDNA: (dna) =>
        setBundle((b) => ({ ...b, dna: { ...b.dna, [dna.channelId]: dna } })),
      intelFor: (projectId) => bundle.intel[projectId] ?? emptyIntel(projectId),
      saveAudienceFor: (projectId, audience) => patchIntel(projectId, (i) => saveAudience(i, audience)),
      saveStrategyFor: (projectId, strategy) => patchIntel(projectId, (i) => saveStrategy(i, strategy)),
      addTitle: (projectId, text, note) => patchIntel(projectId, (i) => addIntelItem(i, "titles", text, note)),
      addHook: (projectId, text, note) => patchIntel(projectId, (i) => addIntelItem(i, "hooks", text, note)),
      setItemStatus: (projectId, field, id, status) =>
        patchIntel(projectId, (i) => setIntelItemStatus(i, field, id, status)),
      editItem: (projectId, field, id, text) =>
        patchIntel(projectId, (i) => editIntelItem(i, field, id, text)),
      addRetention: (projectId, record) => patchIntel(projectId, (i) => addRetentionRecord(i, record)),
      saveBriefFor: (projectId, brief) => patchIntel(projectId, (i) => saveBrief(i, brief)),
      countsFor: (projectId) => intelCounts(bundle.intel[projectId] ?? emptyIntel(projectId)),
      opportunities: bundle.opportunities,
      saveOpportunity: (input) => setBundle((b) => ({ ...b, opportunities: saveOpportunity(b.opportunities, input) })),
      setOpportunityStatus: (id, status) =>
        setBundle((b) => ({ ...b, opportunities: setOpportunityStatus(b.opportunities, id, status) })),
    }),
    [bundle, ready, patchIntel],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
