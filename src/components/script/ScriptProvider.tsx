"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LoopItem, Scene, Script, ScriptSection } from "@/src/lib/script/types";
import {
  addLoop as addLoopOp,
  markSceneSynced,
  resolveLoop as resolveLoopOp,
  restoreVersion,
  snapshotVersion,
} from "@/src/lib/script/engine";
import {
  emptyScriptBundle,
  parseScriptBundle,
  SCRIPTS_STORAGE_KEY,
  type ScriptBundle,
} from "@/src/lib/script/storage";
import { InfoLine } from "@/src/components/ui/Toast";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, pushBundle, mergeMaps } from "@/src/lib/sync";
import { SyncNote } from "@/src/components/auth/SyncNote";

interface ScriptContextValue {
  ready: boolean;
  savedAt: string | null;
  scriptFor: (projectId: string) => Script | null;
  putScript: (script: Script) => void;
  removeScript: (projectId: string) => void;
  setSections: (projectId: string, sections: ScriptSection[]) => void;
  snapshot: (projectId: string, name: string, note: string) => void;
  restore: (projectId: string, versionId: string) => void;
  loopsFor: (projectId: string) => LoopItem[];
  addLoop: (projectId: string, input: Omit<LoopItem, "id">) => void;
  resolveLoop: (projectId: string, id: string, payoffSectionId: string) => void;
  removeLoop: (projectId: string, id: string) => void;
  scenesFor: (projectId: string) => Scene[];
  putScenes: (projectId: string, scenes: Scene[]) => void;
  updateScene: (projectId: string, id: string, patch: Partial<Scene>) => void;
  removeBoard: (projectId: string) => void;
  exportBundle: () => ScriptBundle;
  importBundle: (data: unknown) => { scripts: number };
}

const Ctx = createContext<ScriptContextValue | null>(null);

export function useScripts(): ScriptContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useScripts must be used inside ScriptProvider.");
  return ctx;
}

function readBundle(): ScriptBundle {
  try {
    const raw = localStorage.getItem(SCRIPTS_STORAGE_KEY);
    if (!raw) return emptyScriptBundle();
    return parseScriptBundle(JSON.parse(raw));
  } catch {
    return emptyScriptBundle();
  }
}

export function ScriptProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<ScriptBundle>(emptyScriptBundle());
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const tombstones = useRef<{ scripts: string[] }>({ scripts: [] });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("scripts", true);
          if (!cancelled && remote) {
            const incoming = parseScriptBundle(remote);
            setBundle((local) => ({
              version: 1,
              scripts: mergeMaps(local.scripts, incoming.scripts),
              boards: mergeMaps(local.boards, incoming.boards),
              loops: mergeMaps(local.loops, incoming.loops),
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
      localStorage.setItem(SCRIPTS_STORAGE_KEY, JSON.stringify(bundle));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- status reflects the external write above; the effect exists to sync storage.
      setSavedAt(new Date().toISOString());
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const timer = window.setTimeout(() => {
      const tomb = { deletedScripts: [...new Set(tombstones.current.scripts)] };
      void pushBundle("scripts", true, { ...bundle, ...tomb }).then((result) => {
        if (result) tombstones.current = { scripts: [] };
      }).catch(() => {
        // Offline: local mirror holds; tombstones retry on the next push.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bundle, ready, cloud]);

  const patchScript = useCallback(
    (projectId: string, fn: (s: Script) => Script) =>
      setBundle((b) => {
        const current = b.scripts[projectId];
        if (!current) return b;
        return { ...b, scripts: { ...b.scripts, [projectId]: fn(current) } };
      }),
    [],
  );

  const value = useMemo<ScriptContextValue>(
    () => ({
      ready,
      savedAt,
      scriptFor: (projectId) => bundle.scripts[projectId] ?? null,
      putScript: (script) =>
        setBundle((b) => ({ ...b, scripts: { ...b.scripts, [script.projectId]: script } })),
      removeScript: (projectId) =>
        setBundle((b) => {
          if (!b.scripts[projectId]) return b;
          tombstones.current.scripts.push(projectId);
          const scripts = { ...b.scripts };
          delete scripts[projectId];
          return { ...b, scripts };
        }),
      setSections: (projectId, sections) =>
        patchScript(projectId, (s) => ({ ...s, sections, updatedAt: new Date().toISOString() })),
      snapshot: (projectId, name, note) => patchScript(projectId, (s) => snapshotVersion(s, name, note)),
      restore: (projectId, versionId) => patchScript(projectId, (s) => restoreVersion(s, versionId)),
      loopsFor: (projectId) => bundle.loops[projectId] ?? [],
      addLoop: (projectId, input) =>
        setBundle((b) => ({ ...b, loops: { ...b.loops, [projectId]: addLoopOp(b.loops[projectId] ?? [], input) } })),
      resolveLoop: (projectId, id, payoffSectionId) =>
        setBundle((b) => ({
          ...b,
          loops: { ...b.loops, [projectId]: resolveLoopOp(b.loops[projectId] ?? [], id, payoffSectionId) },
        })),
      removeLoop: (projectId, id) =>
        setBundle((b) => ({
          ...b,
          loops: { ...b.loops, [projectId]: (b.loops[projectId] ?? []).filter((l) => l.id !== id) },
        })),
      scenesFor: (projectId) => bundle.boards[projectId]?.scenes ?? [],
      putScenes: (projectId, scenes) =>
        setBundle((b) => ({
          ...b,
          boards: { ...b.boards, [projectId]: { projectId, scenes, updatedAt: new Date().toISOString() } },
        })),
      updateScene: (projectId, id, patch) =>
        setBundle((b) => {
          const board = b.boards[projectId];
          if (!board) return b;
          return {
            ...b,
            boards: {
              ...b.boards,
              [projectId]: {
                ...board,
                scenes: board.scenes.map((s) =>
                  s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s,
                ),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        }),
      removeBoard: (projectId) =>
        setBundle((b) => {
          const boards = { ...b.boards };
          delete boards[projectId];
          return { ...b, boards };
        }),
      exportBundle: () => bundle,
      importBundle: (data) => {
        const incoming = parseScriptBundle(data);
        setBundle((b) => ({
          version: 1,
          scripts: { ...incoming.scripts, ...b.scripts },
          boards: { ...incoming.boards, ...b.boards },
          loops: { ...incoming.loops, ...b.loops },
        }));
        return { scripts: Object.keys(incoming.scripts).length };
      },
    }),
    [bundle, ready, savedAt, patchScript],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Marks a scene re-synced against current section text. */
export function syncScene(scene: Scene, sections: ScriptSection[]): Scene {
  return markSceneSynced(scene, sections);
}

/** Save-status line: draft state vs device-saved state, honestly labeled. */
export function SaveStatus({ updatedAt, savedAt }: { updatedAt: string; savedAt: string | null }) {
  return (
    <p className="text-xs text-muted-text" aria-live="polite">
      {savedAt ? `Saved on this device · ${new Date(savedAt).toLocaleTimeString()}` : "Saving…"}
      {" · "}
      edited {new Date(updatedAt).toLocaleTimeString()}
    </p>
  );
}

export function ScriptStorageNote() {
  return <SyncNote what="Scripts, scenes, versions, and loops" />;
}
