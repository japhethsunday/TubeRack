"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, pushBundle, mergeById } from "@/src/lib/sync";
import { SyncNote } from "@/src/components/auth/SyncNote";

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

function mergeCompositions(
  local: import("@/src/lib/video/types").Composition[],
  remote: import("@/src/lib/video/types").Composition[],
): import("@/src/lib/video/types").Composition[] {
  const merged = new Map<string, import("@/src/lib/video/types").Composition>();
  for (const c of local) merged.set(c.projectId, c);
  for (const c of remote) merged.set(c.projectId, c);
  return [...merged.values()];
}

export function VideoProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<VideoBundle>(emptyVideoBundle());
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, HistoryState>>({});
  const tombstones = useRef<{ requests: string[]; compositions: string[] }>({ requests: [], compositions: [] });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("video", true);
          if (!cancelled && remote) {
            const incoming = parseVideoBundle(remote);
            setBundle((local) => ({
              version: 1,
              compositions: mergeCompositions(local.compositions, incoming.compositions),
              snapshots: mergeById(local.snapshots, incoming.snapshots),
              requests: mergeById(local.requests, incoming.requests),
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
      localStorage.setItem(VIDEO_STORAGE_KEY, JSON.stringify(bundle));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- status reflects the external write above.
      setSavedAt(new Date().toISOString());
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const timer = window.setTimeout(() => {
      const tomb = {
        deletedRequestIds: [...new Set(tombstones.current.requests)],
        deletedCompositions: [...new Set(tombstones.current.compositions)],
      };
      void pushBundle("video", true, { ...bundle, ...tomb }).then((result) => {
        if (result) tombstones.current = { requests: [], compositions: [] };
      }).catch(() => {
        // Offline: local mirror holds; tombstones retry on the next push.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bundle, ready, cloud]);

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
      removeRequest: (id) => {
        tombstones.current.requests.push(id);
        return setBundle((b) => ({ ...b, requests: b.requests.filter((r) => r.id !== id) }));
      },
    };
  }, [bundle, ready, savedAt, histories, commit]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function VideoStorageNote() {
  return <SyncNote what="Compositions, snapshots, and render requests" />;
}
