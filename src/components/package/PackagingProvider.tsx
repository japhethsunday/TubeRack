"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
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

export function PackagingProvider({ children }: { children: React.ReactNode }) {
  const [bundle, setBundle] = useState<StoredBundle>({ version: 1, concepts: [], variants: [], titles: [], seo: [], packs: [], items: [] });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    setBundle(readBundle());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(PACKAGE_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
  }, [bundle, ready]);

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
      removeVariant: (projectId, id) =>
        setBundle((b) => ({ ...b, variants: b.variants.filter((v) => !(v.id === id && v.projectId === projectId)) })),
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
      removeTitle: (projectId, id) =>
        setBundle((b) => ({ ...b, titles: b.titles.filter((t) => !(t.id === id && t.projectId === projectId)) })),
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
      removeItem: (projectId, id) =>
        setBundle((b) => ({ ...b, items: b.items.filter((i) => !(i.id === id && i.projectId === projectId)) })),
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
