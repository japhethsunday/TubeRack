"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type {
  Composition,
  CompositionSnapshot,
  RenderRequest,
  TimelineClip,
} from "@/src/lib/video/types";
import { emptyComposition } from "@/src/lib/video/build";
import {
  emptyVideoBundle,
  parseVideoBundle,
  VIDEO_STORAGE_KEY,
  type VideoBundle,
} from "@/src/lib/video/storage";
import { InfoLine } from "@/src/components/ui/Toast";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

export interface HistoryState {
  past: TimelineClip[][];
  future: TimelineClip[][];
}

interface VideoContextValue {
  ready: boolean;
  savedAt: string | null;
  compFor: (projectId: string) => Composition;
  setClips: (projectId: string, clips: TimelineClip[]) => void;
  setTracks: (projectId: string, tracks: Composition["tracks"]) => void;
  commitClips: (projectId: string, prev: TimelineClip[], next: TimelineClip[]) => void;
  setCanvas: (projectId: string, canvas: Composition["canvas"]) => void;
  resetComposition: (projectId: string) => void;
  undo: (projectId: string) => void;
  redo: (projectId: string) => void;
  canUndo: (projectId: string) => boolean;
  canRedo: (projectId: string) => boolean;
  snapshotsFor: (projectId: string) => CompositionSnapshot[];
  saveSnapshot: (projectId: string, name: string) => void;
  restoreSnapshot: (projectId: string, id: string) => void;
  requestsFor: (projectId: string) => RenderRequest[];
  saveRequest: (request: Omit<RenderRequest, "id" | "createdAt">) => RenderRequest;
  removeRequest: (id: string) => void;
}

const Ctx = createContext<VideoContextValue | null>(null);

export function useVideo(): VideoContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useVideo must be used inside VideoProvider.");
  return ctx;
}

function readBundle(): VideoBundle {
  try {
    const raw = localStorage.getItem(VIDEO_STORAGE_KEY);
    if (!raw) return emptyVideoBundle();
    return parseVideoBundle(JSON.parse(raw));
  } catch {
    return emptyVideoBundle();
  }
}

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const [bundle, setBundle] = useState<VideoBundle>(emptyVideoBundle());
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryState>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    setBundle(readBundle());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(bundle));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- status reflects the external write above.
      setSavedAt(new Date().toISOString());
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
  }, [bundle, ready]);

  /** Meaningful-change commit with undo history (not per-keystroke). */
  const commit = useCallback((projectId: string, prev: TimelineClip[], next: TimelineClip[]) => {
    setHistories((h) => {
      const current = h[projectId] ?? { past: [], future: [] };
      return {
        ...h,
        [projectId]: { past: [...current.past.slice(-49), prev], future: [] },
      };
    });
    setBundle((b) => ({
      ...b,
      compositions: b.compositions.map((c) =>
        c.projectId === projectId ? { ...c, clips: next, updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const value = useMemo<VideoContextValue>(() => {
    const compFor = (projectId: string): Composition => {
      const found = bundle.compositions.find((c) => c.projectId === projectId);
      if (found) return found;
      return emptyComposition(projectId);
    };
    return {
      ready,
      savedAt,
      compFor,
      setClips: (projectId, clips) =>
        setBundle((b) => {
          const exists = b.compositions.some((c) => c.projectId === projectId);
          const list = exists
            ? b.compositions.map((c) => (c.projectId === projectId ? { ...c, clips, updatedAt: new Date().toISOString() } : c))
            : [...b.compositions, { ...emptyComposition(projectId), clips, updatedAt: new Date().toISOString() }];
          return { ...b, compositions: list };
        }),
      setCanvas: (projectId, canvas) =>
        setBundle((b) => {
          const exists = b.compositions.some((c) => c.projectId === projectId);
          const list = exists
            ? b.compositions.map((c) => (c.projectId === projectId ? { ...c, canvas, updatedAt: new Date().toISOString() } : c))
            : [...b.compositions, { ...emptyComposition(projectId), canvas, updatedAt: new Date().toISOString() }];
          return { ...b, compositions: list };
        }),
      resetComposition: (projectId) =>
        setBundle((b) => ({
          ...b,
          compositions: b.compositions.map((c) => (c.projectId === projectId ? { ...emptyComposition(projectId), canvas: c.canvas } : c)),
        })),
      undo: (projectId) => {
        const history = histories[projectId];
        if (!history || history.past.length === 0) return;
        const prev = history.past[history.past.length - 1];
        const current = bundle.compositions.find((c) => c.projectId === projectId)?.clips ?? [];
        setHistories((h) => ({
          ...h,
          [projectId]: { past: history.past.slice(0, -1), future: [current, ...history.future].slice(0, 50) },
        }));
        setBundle((b) => ({
          ...b,
          compositions: b.compositions.map((c) => (c.projectId === projectId ? { ...c, clips: prev, updatedAt: new Date().toISOString() } : c)),
        }));
      },
      redo: (projectId) => {
        const history = histories[projectId];
        if (!history || history.future.length === 0) return;
        const [next, ...rest] = history.future;
        const current = bundle.compositions.find((c) => c.projectId === projectId)?.clips ?? [];
        setHistories((h) => ({
          ...h,
          [projectId]: { past: [...history.past.slice(-49), current], future: rest },
        }));
        setBundle((b) => ({
          ...b,
          compositions: b.compositions.map((c) => (c.projectId === projectId ? { ...c, clips: next, updatedAt: new Date().toISOString() } : c)),
        }));
      },
      canUndo: (projectId) => (histories[projectId]?.past.length ?? 0) > 0,
      canRedo: (projectId) => (histories[projectId]?.future.length ?? 0) > 0,
      commitClips: commit,
      setTracks: (projectId, tracks) =>
        setBundle((b) => ({
          ...b,
          compositions: b.compositions.map((c) =>
            c.projectId === projectId ? { ...c, tracks, updatedAt: new Date().toISOString() } : c,
          ),
        })),
      snapshotsFor: (projectId) => bundle.snapshots.filter((s) => s.data.projectId === projectId),
      saveSnapshot: (projectId, name) => {
        const data = compFor(projectId);
        const snapshot: CompositionSnapshot = {
          id: nextId("snap"),
          name: name.trim() || `Snapshot ${bundle.snapshots.length + 1}`,
          at: new Date().toISOString(),
          data: JSON.parse(JSON.stringify(data)) as Composition,
        };
        setBundle((b) => ({ ...b, snapshots: [snapshot, ...b.snapshots].slice(0, 20) }));
      },
      restoreSnapshot: (projectId, id) => {
        const snapshot = bundle.snapshots.find((s) => s.id === id);
        if (!snapshot) return;
        const current = bundle.compositions.find((c) => c.projectId === projectId)?.clips ?? [];
        commit(projectId, current, JSON.parse(JSON.stringify(snapshot.data.clips)) as TimelineClip[]);
      },
      requestsFor: (projectId) => bundle.requests.filter((r) => r.projectId === projectId),
      saveRequest: (request) => {
        const full: RenderRequest = { ...request, id: nextId("ren"), createdAt: new Date().toISOString() };
        setBundle((b) => ({ ...b, requests: [full, ...b.requests].slice(0, 20) }));
        return full;
      },
      removeRequest: (id) => setBundle((b) => ({ ...b, requests: b.requests.filter((r) => r.id !== id) })),
    };
  }, [bundle, ready, savedAt, histories, commit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function VideoStorageNote() {
  return (
    <InfoLine>
      Compositions, snapshots, and render requests persist in this browser only. Worker rendering,
      queues, and cloud storage connect in Phase 11.
    </InfoLine>
  );
}
