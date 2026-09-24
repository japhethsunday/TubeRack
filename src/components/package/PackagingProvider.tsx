"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApprovalStage,
  Chapter,
  PackTitle,
  PlatformId,
  PlatformPack,
  RepurposeItem,
  RepurposeKind,
  SeoPackage,
  ThumbnailConcept,
  ThumbnailVariant,
  TextOverlay,
} from "@/src/lib/package/types";
import {
  emptyPackageBundle,
  parsePackageBundle,
  PACKAGE_STORAGE_KEY,
  type PackageBundle,
} from "@/src/lib/package/storage";
import { InfoLine } from "@/src/components/ui/Toast";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, schedulePush, useRemoteRefresh, mergeById } from "@/src/lib/sync";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq}`;
}

function stamp(at?: string): string {
  return at ?? new Date().toISOString();
}

export function emptySeo(projectId: string): SeoPackage {
  return {
    projectId,
    topic: "",
    secondaryTopics: "",
    intent: "",
    description: "",
    keywords: [],
    tags: [],
    hashtags: [],
    chapters: [],
    category: "",
    language: "English",
    audience: "",
    approval: "draft",
    updatedAt: stamp(),
  };
}

interface PackageContextValue {
  ready: boolean;
  conceptsFor: (projectId: string) => ThumbnailConcept[];
  saveConcepts: (projectId: string, concepts: ThumbnailConcept[]) => void;
  variantsFor: (projectId: string) => ThumbnailVariant[];
  addVariant: (projectId: string, input: Omit<ThumbnailVariant, "id" | "createdAt" | "updatedAt" | "approval">) => ThumbnailVariant;
  updateVariant: (projectId: string, id: string, patch: Partial<ThumbnailVariant>) => void;
  removeVariant: (projectId: string, id: string) => void;
  setVariantApproval: (projectId: string, id: string, approval: ApprovalStage) => void;
  approvedVariantFor: (projectId: string) => ThumbnailVariant | null;
  titlesFor: (projectId: string) => PackTitle[];
  addTitle: (projectId: string, text: string, category: string) => PackTitle;
  editTitle: (projectId: string, id: string, text: string) => void;
  setTitleStatus: (projectId: string, id: string, status: ApprovalStage) => void;
  setPrimaryTitle: (projectId: string, id: string) => void;
  removeTitle: (projectId: string, id: string) => void;
  primaryTitleFor: (projectId: string) => PackTitle | null;
  seoFor: (projectId: string) => SeoPackage;
  saveSeo: (seo: SeoPackage) => void;
  packFor: (projectId: string, platform: PlatformId) => PlatformPack;
  savePack: (projectId: string, pack: PlatformPack) => void;
  itemsFor: (projectId: string, platform?: PlatformId) => RepurposeItem[];
  addItem: (projectId: string, input: Omit<RepurposeItem, "id" | "createdAt" | "updatedAt" | "status">) => RepurposeItem;
  updateItem: (projectId: string, id: string, patch: Partial<RepurposeItem>) => void;
  setItemStatus: (projectId: string, id: string, status: ApprovalStage) => void;
  removeItem: (projectId: string, id: string) => void;
  exportBundle: () => PackageBundle;
}

interface StoredConcept extends ThumbnailConcept {
  projectId: string;
}
interface StoredTitle extends PackTitle {
  projectId: string;
}
interface StoredPack extends PlatformPack {
  projectId: string;
}
interface StoredItem extends RepurposeItem {
  projectId: string;
}

interface StoredBundle {
  version: 1;
  concepts: StoredConcept[];
  variants: (ThumbnailVariant & { projectId: string })[];
  titles: StoredTitle[];
  seo: SeoPackage[];
  packs: StoredPack[];
  items: StoredItem[];
}

const Ctx = createContext<PackageContextValue | null>(null);

export function usePackaging(): PackageContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePackaging must be used inside PackagingProvider.");
  return ctx;
}

function readBundle(): StoredBundle {
  try {
    const raw = localStorage.getItem(PACKAGE_STORAGE_KEY);
    if (!raw) return { version: 1, concepts: [], variants: [], titles: [], seo: [], packs: [], items: [] };
    const parsed = parsePackageBundle(JSON.parse(raw));
    // Stored rows carry projectId alongside validated shapes.
    const rawRows = JSON.parse(raw) as StoredBundle;
    return {
      version: 1,
      concepts: parsed.concepts.map((c, i) => ({ ...c, projectId: rawRows.concepts[i]?.projectId ?? "" })),
      variants: parsed.variants.map((v, i) => ({ ...v, projectId: (rawRows.variants[i] as { projectId?: string } | undefined)?.projectId ?? "" })),
      titles: parsed.titles.map((t, i) => ({ ...t, projectId: rawRows.titles[i]?.projectId ?? "" })),
      seo: parsed.seo,
      packs: parsed.packs.map((p, i) => ({ ...p, projectId: rawRows.packs[i]?.projectId ?? "" })),
      items: parsed.items.map((it, i) => ({ ...it, projectId: rawRows.items[i]?.projectId ?? "" })),
    };
  } catch {
    return { version: 1, concepts: [], variants: [], titles: [], seo: [], packs: [], items: [] };
  }
}

function readBundleFrom(data: unknown): StoredBundle {
  const d = (data ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const withProject = (list: unknown): ({ id: string; projectId: string } & Record<string, unknown>)[] =>
    arr(list)
      .filter((item): item is { id: string; projectId: string } & Record<string, unknown> => {
        const o = item as Record<string, unknown>;
        return Boolean(o) && typeof o === "object" && typeof o.id === "string" && typeof o.projectId === "string";
      })
      .map((item) => ({ ...item, projectId: item.projectId }));
  const withPack = (list: unknown): StoredPack[] =>
    arr(list)
      .filter((item): item is StoredPack => {
        const o = item as Record<string, unknown>;
        return Boolean(o) && typeof o === "object" && typeof o.projectId === "string" && typeof o.platform === "string";
      })
      .map((item) => item);
  return {
    version: 1,
    concepts: withProject(d.concepts) as unknown as StoredConcept[],
    variants: withProject(d.variants) as unknown as (ThumbnailVariant & { projectId: string })[],
    titles: withProject(d.titles) as unknown as StoredTitle[],
    seo: arr(d.seo).filter((s): s is SeoPackage => Boolean(s) && typeof s === "object" && typeof (s as { projectId?: unknown }).projectId === "string") as SeoPackage[],
    packs: withPack(d.packs),
    items: withProject(d.items) as unknown as StoredItem[],
  };
}

function mergeConcepts(local: StoredConcept[], remote: StoredConcept[]): StoredConcept[] {
  const remoteProjects = new Set(remote.map((c) => c.projectId));
  return [...local.filter((c) => !remoteProjects.has(c.projectId)), ...remote];
}

function mergeSeo(local: SeoPackage[], remote: SeoPackage[]): SeoPackage[] {
  const merged = new Map<string, SeoPackage>();
  for (const s of local) merged.set(s.projectId, s);
  for (const s of remote) merged.set(s.projectId, s);
  return [...merged.values()];
}

function mergePacks(local: StoredPack[], remote: StoredPack[]): StoredPack[] {
  const merged = new Map<string, StoredPack>();
  for (const p of local) merged.set(`${p.projectId}:${p.platform}`, p);
  for (const p of remote) merged.set(`${p.projectId}:${p.platform}`, p);
  return [...merged.values()];
}

/** Server copy merged into a local copy: newest edit wins, deletions elsewhere respected. */
function mergeRemoteBundle(local: ReturnType<typeof readBundle>, incoming: ReturnType<typeof readBundle>): ReturnType<typeof readBundle> {
  return {
              version: 1,
              concepts: mergeConcepts(local.concepts, incoming.concepts),
              variants: mergeById(local.variants, incoming.variants, "packaging.variants"),
              titles: mergeById(local.titles, incoming.titles, "packaging.titles"),
              seo: mergeSeo(local.seo, incoming.seo),
              packs: mergePacks(local.packs, incoming.packs),
              items: mergeById(local.items, incoming.items, "packaging.items"),
  };
}

export function PackagingProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [bundle, setBundle] = useState<StoredBundle>({ version: 1, concepts: [], variants: [], titles: [], seo: [], packs: [], items: [] });
  const [ready, setReady] = useState(false);
  const tombstones = useRef<{ variants: string[]; titles: string[]; items: string[] }>({ variants: [], titles: [], items: [] });

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("packaging", true);
          if (!cancelled && remote) {
            const incoming = readBundleFrom(remote);
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
    return () => {
      cancelled = true;
    };
  }, [cloud]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const tomb = {
      deletedVariantIds: [...new Set(tombstones.current.variants)],
      deletedTitleIds: [...new Set(tombstones.current.titles)],
      deletedItemIds: [...new Set(tombstones.current.items)],
      deletedProjects: [] as string[],
    };
    schedulePush("packaging", { ...bundle, ...tomb }, () => {
      tombstones.current = { variants: [], titles: [], items: [] };
    });
  }, [bundle, ready, cloud]);

  // Pick up changes made on other devices when this tab regains focus.
  useRemoteRefresh("packaging", cloud && ready, () => {
    void pullBundle("packaging", true)
      .then((remote) => {
        if (remote) {
          const incoming = readBundleFrom(remote);
          setBundle((cur) => mergeRemoteBundle(cur, incoming));
        }
      })
      .catch(() => undefined);
  });

  const value = useMemo<PackageContextValue>(() => {
    const scoped = <T extends { projectId: string }>(rows: T[], projectId: string): T[] =>
      rows.filter((r) => r.projectId === projectId);
    return {
      ready,
      conceptsFor: (projectId) => scoped(bundle.concepts, projectId),
      saveConcepts: (projectId, concepts) =>
        setBundle((b) => ({
          ...b,
          concepts: [...b.concepts.filter((c) => c.projectId !== projectId), ...concepts.map((c) => ({ ...c, projectId }))],
        })),
      variantsFor: (projectId) => scoped(bundle.variants, projectId),
      addVariant: (projectId, input) => {
        const variant = { ...input, id: nextId("th"), approval: "draft" as const, createdAt: stamp(), updatedAt: stamp() };
        setBundle((b) => ({ ...b, variants: [{ ...variant, projectId }, ...b.variants].slice(0, 100) }));
        return variant;
      },
      updateVariant: (projectId, id, patch) =>
        setBundle((b) => ({
          ...b,
          variants: b.variants.map((v) => (v.id === id && v.projectId === projectId ? { ...v, ...patch, updatedAt: stamp() } : v)),
        })),
      removeVariant: (projectId, id) => {
        tombstones.current.variants.push(id);
        return setBundle((b) => ({ ...b, variants: b.variants.filter((v) => !(v.id === id && v.projectId === projectId)) }));
      },
      setVariantApproval: (projectId, id, approval) =>
        setBundle((b) => ({
          ...b,
          variants: b.variants.map((v) => (v.id === id && v.projectId === projectId ? { ...v, approval, updatedAt: stamp() } : v)),
        })),
      approvedVariantFor: (projectId) =>
        scoped(bundle.variants, projectId).find((v) => v.approval === "approved" || v.approval === "ready") ?? null,
      titlesFor: (projectId) => scoped(bundle.titles, projectId),
      addTitle: (projectId, text, category) => {
        const clean = text.trim();
        if (!clean) throw new Error("Title cannot be empty.");
        const title: StoredTitle = { id: nextId("ti"), text: clean, category, status: "draft", isPrimary: scoped(bundle.titles, projectId).length === 0, createdAt: stamp(), projectId };
        setBundle((b) => ({ ...b, titles: [title, ...b.titles].slice(0, 100) }));
        return title;
      },
      setTitleStatus: (projectId, id, status) =>
        setBundle((b) => ({
          ...b,
          titles: b.titles.map((t) => (t.id === id && t.projectId === projectId ? { ...t, status } : t)),
        })),
      editTitle: (projectId, id, text) => {
        const clean = text.trim();
        if (!clean) throw new Error("Title cannot be empty.");
        setBundle((b) => ({
          ...b,
          // Edited titles return to draft — re-review after every change.
          titles: b.titles.map((t) => (t.id === id && t.projectId === projectId ? { ...t, text: clean, status: "draft" as const } : t)),
        }));
      },
      setPrimaryTitle: (projectId, id) =>
        setBundle((b) => ({
          ...b,
          titles: b.titles.map((t) => (t.projectId === projectId ? { ...t, isPrimary: t.id === id } : t)),
        })),
      removeTitle: (projectId, id) => {
        tombstones.current.titles.push(id);
        return setBundle((b) => ({ ...b, titles: b.titles.filter((t) => !(t.id === id && t.projectId === projectId)) }));
      },
      primaryTitleFor: (projectId) => scoped(bundle.titles, projectId).find((t) => t.isPrimary) ?? null,
      seoFor: (projectId) => bundle.seo.find((s) => s.projectId === projectId) ?? emptySeo(projectId),
      saveSeo: (seo) =>
        setBundle((b) => ({
          ...b,
          seo: [...b.seo.filter((s) => s.projectId !== seo.projectId), { ...seo, updatedAt: stamp() }],
        })),
      packFor: (projectId, platform) =>
        bundle.packs.find((p) => p.projectId === projectId && p.platform === platform) ?? {
          projectId,
          platform,
          fields: {},
          approval: "draft" as const,
          updatedAt: stamp(),
        },
      savePack: (projectId, pack) =>
        setBundle((b) => ({
          ...b,
          packs: [...b.packs.filter((p) => !(p.projectId === projectId && p.platform === pack.platform)), { ...pack, projectId, updatedAt: stamp() }],
        })),
      itemsFor: (projectId, platform) =>
        scoped(bundle.items, projectId).filter((i) => !platform || i.platform === platform),
      addItem: (projectId, input) => {
        const item: StoredItem = { ...input, id: nextId("rp"), status: "draft", createdAt: stamp(), updatedAt: stamp(), projectId };
        setBundle((b) => ({ ...b, items: [item, ...b.items].slice(0, 200) }));
        return item;
      },
      updateItem: (projectId, id, patch) =>
        setBundle((b) => ({
          ...b,
          items: b.items.map((i) => (i.id === id && i.projectId === projectId ? { ...i, ...patch, updatedAt: stamp() } : i)),
        })),
      setItemStatus: (projectId, id, status) =>
        setBundle((b) => ({
          ...b,
          items: b.items.map((i) => (i.id === id && i.projectId === projectId ? { ...i, status, updatedAt: stamp() } : i)),
        })),
      removeItem: (projectId, id) => {
        tombstones.current.items.push(id);
        return setBundle((b) => ({ ...b, items: b.items.filter((i) => !(i.id === id && i.projectId === projectId)) }));
      },
      exportBundle: () => {
        const { concepts, variants, titles, seo, packs, items } = bundle;
        return {
          version: 1 as const,
          concepts: concepts.map(({ projectId: _p, ...c }) => c),
          variants: variants.map(({ projectId: _p, ...v }) => v),
          titles: titles.map(({ projectId: _p, ...t }) => t),
          seo,
          packs: packs.map(({ projectId: _p, ...p }) => p),
          items: items.map(({ projectId: _p, ...i }) => i),
        };
      },
    };
  }, [bundle, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PackageStorageNote({ compact }: { compact?: boolean }) {
  return (
    <InfoLine>
      {compact
        ? "Packaging persists on this device; publishing connects in a later phase."
        : "Concepts, variants, titles, SEO, platform packs, and derivatives persist in this browser only. Approval never publishes — publishing integrations arrive in a later phase."}
    </InfoLine>
  );
}

export type { TextOverlay, Chapter, RepurposeKind };
