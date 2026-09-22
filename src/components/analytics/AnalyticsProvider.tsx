"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsSnapshot,
  ChannelSignal,
  PerformanceEntry,
  RetentionNote,
  SignalKind,
} from "@/src/lib/analytics/types";
import {
  emptyAnalyticsBundle,
  parseAnalyticsBundle,
  ANALYTICS_STORAGE_KEY,
  type AnalyticsBundle,
} from "@/src/lib/analytics/storage";
import { InfoLine } from "@/src/components/ui/Toast";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, pushBundle, mergeById } from "@/src/lib/sync";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function stamp(at?: string): string {
  return at ?? new Date().toISOString();
}

export type EntryInput = Omit<PerformanceEntry, "id" | "provenance" | "createdAt" | "updatedAt">;

interface AnalyticsContextValue {
  ready: boolean;
  entries: PerformanceEntry[];
  retention: RetentionNote[];
  signals: ChannelSignal[];
  snapshots: AnalyticsSnapshot[];
  logEntry: (input: EntryInput) => PerformanceEntry;
  updateEntry: (id: string, patch: Partial<EntryInput>) => void;
  removeEntry: (id: string) => void;
  entriesFor: (projectId: string) => PerformanceEntry[];
  addRetentionNote: (input: Omit<RetentionNote, "id" | "createdAt">) => RetentionNote;
  removeRetentionNote: (id: string) => void;
  retentionFor: (projectId: string) => RetentionNote[];
  saveSignal: (input: { kind: SignalKind; title: string; evidence: string; implication: string }) => ChannelSignal;
  archiveSignal: (id: string) => void;
  removeSignal: (id: string) => void;
  activeSignals: ChannelSignal[];
  saveSnapshot: (name: string, rangeDays: number, totals: Record<string, number>, entryCount: number) => AnalyticsSnapshot;
  removeSnapshot: (id: string) => void;
  exportBundle: () => AnalyticsBundle;
  importBundle: (data: unknown) => { entries: number };
}

const Ctx = createContext<AnalyticsContextValue | null>(null);

export function useAnalytics(): AnalyticsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAnalytics must be used inside AnalyticsProvider.");
  return ctx;
}

function readBundle(): AnalyticsBundle {
  try {
    const raw = localStorage.getItem(ANALYTICS_STORAGE_KEY);
    if (!raw) return emptyAnalyticsBundle();
    return parseAnalyticsBundle(JSON.parse(raw));
  } catch {
    return emptyAnalyticsBundle();
  }
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<AnalyticsBundle>(emptyAnalyticsBundle());
  const [ready, setReady] = useState(false);
  const tombstones = useRef<{ entries: string[]; retention: string[]; signals: string[]; snapshots: string[] }>({
    entries: [],
    retention: [],
    signals: [],
    snapshots: [],
  });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("analytics", true);
          if (!cancelled && remote) {
            const incoming = parseAnalyticsBundle(remote);
            setBundle((local) => ({
              version: 1,
              entries: mergeById(local.entries, incoming.entries),
              retention: mergeById(local.retention, incoming.retention),
              signals: mergeById(local.signals, incoming.signals),
              snapshots: mergeById(local.snapshots, incoming.snapshots),
            }));
            setReady(true);
            return;
          }
        } catch {
          // Fall through to device storage.
        }
      }
      if (!cancelled) {
        setBundle(readBundle());
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
      localStorage.setItem(ANALYTICS_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const timer = window.setTimeout(() => {
      const tomb = {
        deletedEntryIds: [...new Set(tombstones.current.entries)],
        deletedRetentionIds: [...new Set(tombstones.current.retention)],
        deletedSignalIds: [...new Set(tombstones.current.signals)],
        deletedSnapshotIds: [...new Set(tombstones.current.snapshots)],
      };
      void pushBundle("analytics", true, { ...bundle, ...tomb }).then((result) => {
        if (result) tombstones.current = { entries: [], retention: [], signals: [], snapshots: [] };
      }).catch(() => {
        // Offline: local mirror holds; tombstones retry on the next push.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bundle, ready, cloud]);

  const value = useMemo<AnalyticsContextValue>(() => {
    const touch = <T extends { id: string }>(rows: T[], id: string, patch: Partial<T>): T[] =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    return {
      ready,
      entries: bundle.entries,
      retention: bundle.retention,
      signals: bundle.signals,
      snapshots: bundle.snapshots,
      logEntry: (input) => {
        const entry: PerformanceEntry = { ...input, id: nextId("perf"), provenance: "manual", createdAt: stamp(), updatedAt: stamp() };
        setBundle((b) => ({ ...b, entries: [entry, ...b.entries].slice(0, 1000) }));
        return entry;
      },
      updateEntry: (id, patch) =>
        setBundle((b) => ({ ...b, entries: touch(b.entries, id, { ...patch, updatedAt: stamp() }) })),
      removeEntry: (id) => {
        tombstones.current.entries.push(id);
        return setBundle((b) => ({ ...b, entries: b.entries.filter((e) => e.id !== id) }));
      },
      entriesFor: (projectId) => bundle.entries.filter((e) => e.projectId === projectId),
      addRetentionNote: (input) => {
        const note: RetentionNote = { ...input, id: nextId("ret"), createdAt: stamp() };
        setBundle((b) => ({ ...b, retention: [note, ...b.retention].slice(0, 500) }));
        return note;
      },
      removeRetentionNote: (id) => {
        tombstones.current.retention.push(id);
        return setBundle((b) => ({ ...b, retention: b.retention.filter((r) => r.id !== id) }));
      },
      retentionFor: (projectId) => bundle.retention.filter((r) => r.projectId === projectId),
      saveSignal: (input) => {
        const signal: ChannelSignal = { ...input, id: nextId("sig"), status: "active", createdAt: stamp() };
        setBundle((b) => ({ ...b, signals: [signal, ...b.signals].slice(0, 200) }));
        return signal;
      },
      archiveSignal: (id) => setBundle((b) => ({ ...b, signals: touch(b.signals, id, { status: "archived" }) })),
      removeSignal: (id) => {
        tombstones.current.signals.push(id);
        return setBundle((b) => ({ ...b, signals: b.signals.filter((s) => s.id !== id) }));
      },
      activeSignals: bundle.signals.filter((s) => s.status === "active"),
      saveSnapshot: (name, rangeDays, totals, entryCount) => {
        const snapshot: AnalyticsSnapshot = { id: nextId("snap"), name: name.trim() || `Snapshot ${bundle.snapshots.length + 1}`, at: new Date().toISOString(), rangeDays, entryCount, totals, createdAt: stamp() };
        setBundle((b) => ({ ...b, snapshots: [snapshot, ...b.snapshots].slice(0, 50) }));
        return snapshot;
      },
      removeSnapshot: (id) => {
        tombstones.current.snapshots.push(id);
        return setBundle((b) => ({ ...b, snapshots: b.snapshots.filter((s) => s.id !== id) }));
      },
      exportBundle: () => bundle,
      importBundle: (data) => {
        const incoming = parseAnalyticsBundle(data);
        setBundle((b) => ({
          version: 1,
          entries: [...incoming.entries, ...b.entries].slice(0, 1000),
          retention: [...incoming.retention, ...b.retention].slice(0, 500),
          signals: [...incoming.signals, ...b.signals].slice(0, 200),
          snapshots: [...incoming.snapshots, ...b.snapshots].slice(0, 50),
        }));
        return { entries: incoming.entries.length };
      },
    };
  }, [bundle, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalyticsOptional(): AnalyticsContextValue | null {
  return useContext(Ctx);
}

export function AnalyticsStorageNote({ compact }: { compact?: boolean }) {
  return (
    <InfoLine>
      {compact
        ? "Manual entries + local production data on this device. Platform APIs connect in Phase 11."
        : "Performance entries are self-reported by you (provenance: manual). Production metrics derive from local projects. Platform APIs, ingestion, and cloud history connect in Phase 11."}
    </InfoLine>
  );
}

export type { EntryInput as AnalyticsEntryInput };
