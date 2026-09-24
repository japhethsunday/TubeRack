"use client";

import { loadLocal, removeLocal, saveLocal } from "@/src/lib/media/local-store";
import { downloadStored, isChunked, isStoredUpload } from "@/src/lib/media/chunked";

/** Video/audio play from a device copy (downloaded once) for reliable editing. */
const TIMED = new Set(["video", "music", "voice", "sfx"]);
import { uploadToCloud } from "@/src/lib/media/cloud-upload";
import { useSession } from "@/src/components/auth/useSession";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalState,
  ConsistencySettings,
  MediaAsset,
  MediaKind,
  MediaStatus,
  VoiceProfile,
} from "@/src/lib/media/types";
import { emptyMediaBundle, parseMediaBundle, MEDIA_STORAGE_KEY, type MediaBundle } from "@/src/lib/media/storage";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, schedulePush, useRemoteRefresh, mergeById } from "@/src/lib/sync";
import { InfoLine } from "@/src/components/ui/Toast";
import { SyncNote } from "@/src/components/auth/SyncNote";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function stamp(at?: string): string {
  return at ?? new Date().toISOString();
}

export interface MediaContextValue {
  ready: boolean;
  assets: MediaAsset[];
  voices: VoiceProfile[];
  assetsFor: (projectId: string) => MediaAsset[];
  addAsset: (input: Omit<MediaAsset, "id" | "createdAt" | "updatedAt">) => MediaAsset;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;
  setApproval: (id: string, approval: ApprovalState) => void;
  assignScenes: (id: string, sceneIds: string[]) => void;
  /** Session-only bytes for uploads (object URLs). Gone on reload — disclosed in UI. */
  blobUrlFor: (id: string) => string | null;
  putBlob: (id: string, blob: Blob) => string;
  /** Save bytes to this device (survives reloads) and attach them to an asset. */
  persistBlob: (id: string, blob: Blob, onProgress?: (ratio: number) => void, signal?: AbortSignal) => Promise<string>;
  /** Bumps when device-stored media finishes loading after a reload. */
  blobVersion: number;
  /** Download progress (0–1) for media arriving from another device. */
  downloads: Record<string, number>;
  voicesFor: (projectId: string) => VoiceProfile[];
  defaultVoiceFor: (projectId: string) => VoiceProfile | null;
  saveVoice: (input: Omit<VoiceProfile, "id" | "createdAt"> & { id?: string }) => VoiceProfile;
  removeVoice: (id: string) => void;
  consistencyFor: (projectId: string) => ConsistencySettings;
  saveConsistency: (settings: ConsistencySettings) => void;
  exportBundle: () => MediaBundle;
  importBundle: (data: unknown) => { assets: number; voices: number };
}

const Ctx = createContext<MediaContextValue | null>(null);

export function useMedia(): MediaContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMedia must be used inside MediaProvider.");
  return ctx;
}

export function emptyConsistency(projectId: string): ConsistencySettings {
  return {
    projectId,
    visualStyle: "",
    colorDirection: "",
    lighting: "",
    cameraLanguage: "",
    characterNotes: "",
    environmentStyle: "",
    avoidStyles: "",
    updatedAt: new Date().toISOString(),
  };
}

function readBundle(): MediaBundle {
  try {
    const raw = localStorage.getItem(MEDIA_STORAGE_KEY);
    if (!raw) return emptyMediaBundle();
    return parseMediaBundle(JSON.parse(raw));
  } catch {
    return emptyMediaBundle();
  }
}

/** Local job runner through pending → preparing → generating → ready. */
export async function runLocalJob(
  setStatus: (s: MediaStatus, progress: number) => void,
  steps: { label: string; work: () => void | Promise<void> }[],
  isCancelled: () => boolean,
): Promise<boolean> {
  const order: MediaStatus[] = ["pending", "preparing", "generating"];
  for (const [i, step] of steps.entries()) {
    setStatus(order[Math.min(i, order.length - 1)], Math.round((i / steps.length) * 90));
    await step.work();
    if (isCancelled()) {
      setStatus("cancelled", 0);
      return false;
    }
  }
  setStatus("ready", 100);
  return true;
}

function mergeConsistency(local: ConsistencySettings[], remote: ConsistencySettings[]): ConsistencySettings[] {
  const merged = new Map<string, ConsistencySettings>();
  for (const c of local) merged.set(c.projectId, c);
  for (const c of remote) merged.set(c.projectId, c);
  return [...merged.values()];
}

/** Server copy merged into a local copy: newest edit wins, deletions elsewhere respected. */
function mergeRemoteBundle(local: ReturnType<typeof readBundle>, incoming: ReturnType<typeof readBundle>): ReturnType<typeof readBundle> {
  return {
              version: 1,
              assets: mergeById(local.assets, incoming.assets, "media.assets"),
              voices: mergeById(local.voices, incoming.voices, "media.voices"),
              consistency: mergeConsistency(local.consistency, incoming.consistency),
  };
}

export function MediaProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<MediaBundle>(emptyMediaBundle());
  const [ready, setReady] = useState(false);
  const blobs = useRef(new Map<string, { url: string; blob: Blob }>());
  const tombstones = useRef<{ assets: string[] }>({ assets: [] });
  const [blobVersion, setBlobVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("media", true);
          if (!cancelled && remote) {
            const incoming = parseMediaBundle(remote);
            // Merge into the device copy — never replace it (unsynced work survives).
            setBundle(() => mergeRemoteBundle(readBundle(), incoming));
            setReady(true);
            return;
          }
        } catch (error) {
          // Fall through to device storage, but never silently.
          console.error("sync pull failed:", error instanceof Error ? error.message : error);
        }
      }
      if (!cancelled) {
        setBundle(readBundle());
        setReady(true);
      }
    })();
    const map = blobs.current;
    return () => {
      cancelled = true;
      for (const { url } of map.values()) URL.revokeObjectURL(url);
      map.clear();
    };
  }, [cloud]);

  // Re-attach device-stored media (OPFS) after a reload, and bring down
  // multi-part cloud uploads made on another device (reassembled, then
  // cached on this device so they play offline next time).
  const fetching = useRef(new Set<string>());
  const [downloads, setDownloads] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!ready) return;
    const missing = bundle.assets.filter(
      (a) =>
        a.status === "ready" &&
        !blobs.current.has(a.id) &&
        !fetching.current.has(a.id) &&
        (a.source === "upload-session" || isChunked(a.payload) || (TIMED.has(a.kind) && isStoredUpload(a.payload))),
    );
    if (!missing.length) return;
    for (const a of missing) fetching.current.add(a.id);
    void (async () => {
      for (const a of missing) {
        try {
          let file: Blob | null = await loadLocal(a.id);
          if (!file && cloud && isStoredUpload(a.payload)) {
            setDownloads((d) => ({ ...d, [a.id]: 0 }));
            const whole = await downloadStored(a.payload, a.mime, (r) => setDownloads((d) => ({ ...d, [a.id]: r })));
            await saveLocal(a.id, whole).catch(() => undefined); // cache is best-effort
            file = (await loadLocal(a.id)) ?? whole;
          }
          if (!file) continue;
          blobs.current.set(a.id, { url: URL.createObjectURL(file), blob: file });
          setBlobVersion((v) => v + 1);
        } catch (error) {
          console.error("media download failed:", error instanceof Error ? error.message : error);
        } finally {
          fetching.current.delete(a.id);
          setDownloads((d) => {
            if (!(a.id in d)) return d;
            const next = { ...d };
            delete next[a.id];
            return next;
          });
        }
      }
    })();
  }, [ready, cloud, bundle.assets]);

  useEffect(() => {
    if (!ready) return;
    try {
      const { assets, voices, consistency } = bundle;
      localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify({ version: 1 as const, assets, voices, consistency }));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const tomb = { deletedAssetIds: [...new Set(tombstones.current.assets)] };
    schedulePush("media", { ...bundle, ...tomb }, () => {
      tombstones.current = { assets: [] };
    });
  }, [bundle, ready, cloud]);

  // Pick up changes made on other devices when this tab regains focus.
  useRemoteRefresh("media", cloud && ready, () => {
    void pullBundle("media", true)
      .then((remote) => {
        if (remote) {
          const incoming = parseMediaBundle(remote);
          setBundle((cur) => mergeRemoteBundle(cur, incoming));
        }
      })
      .catch(() => undefined);
  });

  const touchAsset = useCallback(
    (id: string, patch: Partial<MediaAsset>) =>
      setBundle((b) => ({
        ...b,
        assets: b.assets.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: stamp() } : a)),
      })),
    [],
  );

  // Media imported on this device before it could reach the cloud (older
  // versions kept big/MOV files device-only): upload it now, so the rest of
  // the account's devices get it. One file at a time, once per session.
  const session = useSession();
  const backfilled = useRef(new Set<string>());
  useEffect(() => {
    if (!ready || !cloud || session.status !== "signed-in") return;
    const pending = bundle.assets.filter((a) => a.source === "upload-session" && a.status === "ready" && !backfilled.current.has(a.id));
    if (!pending.length) return;
    for (const a of pending) backfilled.current.add(a.id);
    void (async () => {
      for (const a of pending) {
        try {
          const file = await loadLocal(a.id);
          if (!file) continue; // bytes live on another device
          const up = await uploadToCloud(file, a.mime || file.type);
          touchAsset(a.id, { source: "provider-output", payload: up.fileUrl });
        } catch (error) {
          console.error("media backfill failed:", error instanceof Error ? error.message : error);
        }
      }
    })();
  }, [ready, cloud, session.status, bundle.assets, touchAsset]);

  const value = useMemo<MediaContextValue>(
    () => ({
      ready,
      assets: bundle.assets,
      voices: bundle.voices,
      assetsFor: (projectId) => bundle.assets.filter((a) => a.projectId === projectId),
      addAsset: (input) => {
        const asset: MediaAsset = {
          ...input,
          id: nextId("mda"),
          createdAt: stamp(),
          updatedAt: stamp(),
        };
        setBundle((b) => ({ ...b, assets: [asset, ...b.assets].slice(0, 500) }));
        return asset;
      },
      updateAsset: (id, patch) => touchAsset(id, patch),
      removeAsset: (id) => {
        void removeLocal(id);
        tombstones.current.assets.push(id);
        return setBundle((b) => ({ ...b, assets: b.assets.filter((a) => a.id !== id) }));
      },
      setApproval: (id, approval) => {
        const asset = bundle.assets.find((a) => a.id === id);
        if (!asset) return;
        // Approved assets are never auto-replaced: assigning scenes marks used.
        touchAsset(id, { approval });
      },
      assignScenes: (id, sceneIds) => {
        const asset = bundle.assets.find((a) => a.id === id);
        if (!asset) return;
        if (asset.approval !== "approved" && asset.approval !== "used") {
          touchAsset(id, { approval: "reviewed" });
        }
        touchAsset(id, {
          sceneIds,
          approval: sceneIds.length > 0 ? "used" : asset.approval === "used" ? "approved" : asset.approval,
        });
      },
      blobUrlFor: (id) => blobs.current.get(id)?.url ?? null,
      putBlob: (id, blob) => {
        const prev = blobs.current.get(id);
        if (prev) URL.revokeObjectURL(prev.url);
        const url = URL.createObjectURL(blob);
        blobs.current.set(id, { url, blob });
        return url;
      },
      persistBlob: async (id, blob, onProgress, signal) => {
        await saveLocal(id, blob, onProgress, signal);
        const file = (await loadLocal(id)) ?? blob;
        const prev = blobs.current.get(id);
        if (prev) URL.revokeObjectURL(prev.url);
        const url = URL.createObjectURL(file);
        blobs.current.set(id, { url, blob: file });
        setBlobVersion((v) => v + 1);
        return url;
      },
      blobVersion,
      downloads,
      voicesFor: (projectId) => bundle.voices.filter((v) => v.projectId === projectId),
      defaultVoiceFor: (projectId) =>
        bundle.voices.find((v) => v.projectId === projectId && v.isDefault) ??
        bundle.voices.find((v) => v.projectId === projectId) ??
        null,
      saveVoice: (input) => {
        const voice: VoiceProfile = {
          ...input,
          id: input.id ?? nextId("vox"),
          createdAt: stamp(),
        };
        setBundle((b) => ({
          ...b,
          voices: [
            ...b.voices
              .filter((v) => v.id !== voice.id)
              .map((v) =>
                v.projectId === voice.projectId && voice.isDefault ? { ...v, isDefault: false } : v,
              ),
            voice,
          ],
        }));
        return voice;
      },
      removeVoice: (id) => setBundle((b) => ({ ...b, voices: b.voices.filter((v) => v.id !== id) })),
      consistencyFor: (projectId) =>
        bundle.consistency.find((c) => c.projectId === projectId) ?? emptyConsistency(projectId),
      saveConsistency: (settings) =>
        setBundle((b) => ({
          ...b,
          consistency: [
            ...b.consistency.filter((c) => c.projectId !== settings.projectId),
            { ...settings, updatedAt: stamp() },
          ],
        })),
      exportBundle: () => bundle,
      importBundle: (data) => {
        const incoming = parseMediaBundle(data);
        setBundle((b) => ({
          version: 1,
          assets: [...incoming.assets, ...b.assets].slice(0, 500),
          voices: [...incoming.voices, ...b.voices],
          consistency: [...incoming.consistency, ...b.consistency.filter((c) => !incoming.consistency.some((x) => x.projectId === c.projectId))],
        }));
        return { assets: incoming.assets.length, voices: incoming.voices.length };
      },
    }),
    [bundle, ready, touchAsset, blobVersion, downloads],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function MediaStorageNote({ compact }: { compact?: boolean }) {
  void compact;
  return <SyncNote what="Media, voice profiles, and asset details" extra="Uploaded files are stored with your account when you are signed in." />;
}

export type { MediaKind };
