"use client";

import { useMemo, useState } from "react";
import { Copy, FileText, Film, FolderInput, ImageIcon, Mic, Music, Search } from "lucide-react";
import type { MediaAsset } from "@/src/lib/media/types";
import { useMedia } from "@/src/components/media/MediaProvider";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { usePackaging } from "@/src/components/package/PackagingProvider";
import { AssetDownload, canDownload } from "@/src/components/media/AssetDownload";
import { DraftImage, MediaPlayer } from "@/src/components/media/players";
import { downloadPng } from "@/src/components/package/thumbnails";
import { composeThumbnail } from "@/src/lib/package/thumbnails";
import { downloadText, safeFileName } from "@/src/lib/download";
import { Button } from "@/src/components/ui/Button";
import { Input, Select } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { cx } from "@/src/components/ui/cx";

type Tab = "all" | "image" | "voice" | "audio" | "video" | "thumbnails" | "scripts";

const TABS: { id: Tab; label: string; icon: typeof ImageIcon }[] = [
  { id: "all", label: "All media", icon: FolderInput },
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "voice", label: "Voice-overs", icon: Mic },
  { id: "audio", label: "Music & SFX", icon: Music },
  { id: "video", label: "Videos", icon: Film },
  { id: "thumbnails", label: "Thumbnails", icon: ImageIcon },
  { id: "scripts", label: "Scripts", icon: FileText },
];

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtSize = (b?: number) => (!b ? "" : b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtDur = (s?: number) => (!s ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

/**
 * Account storage: everything generated or uploaded across all projects in
 * one place — preview, download, or copy it into another project.
 */
export function StorageLibrary() {
  const media = useMedia();
  const { projects } = useProjects();
  const scripts = useScripts();
  const pack = usePackaging();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [copyTarget, setCopyTarget] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Deleted project";
  const liveProjects = projects.filter((p) => p.status !== "archived");

  const assets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return media.assets
      .filter((a) => a.status === "ready" && a.source !== "provider-request")
      .filter((a) => !projectFilter || a.projectId === projectFilter)
      .filter((a) => !q || a.title.toLowerCase().includes(q) || projectName(a.projectId).toLowerCase().includes(q))
      .filter((a) =>
        tab === "all" ? true : tab === "audio" ? a.kind === "music" || a.kind === "sfx" : tab === a.kind,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- projectName reads projects.
  }, [media.assets, tab, query, projectFilter, projects]);

  const thumbnails = useMemo(
    () =>
      projects
        .filter((p) => !projectFilter || p.id === projectFilter)
        .flatMap((p) => pack.variantsFor(p.id).filter((v) => v.baseSvg).map((v) => ({ project: p, variant: v })))
        .filter(({ project, variant }) => !query.trim() || `${project.name} ${variant.name}`.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, pack, projectFilter, query],
  );

  const scriptRows = useMemo(
    () =>
      projects
        .filter((p) => !projectFilter || p.id === projectFilter)
        .map((p) => ({ project: p, script: scripts.scriptFor(p.id) }))
        .filter((r) => r.script && r.script.sections.some((s) => s.text.trim()))
        .filter(({ project }) => !query.trim() || project.name.toLowerCase().includes(query.trim().toLowerCase())),
    [projects, scripts, projectFilter, query],
  );

  const counts = {
    all: media.assets.filter((a) => a.status === "ready" && a.source !== "provider-request").length,
    thumbnails: projects.reduce((n, p) => n + pack.variantsFor(p.id).filter((v) => v.baseSvg).length, 0),
    scripts: projects.filter((p) => scripts.scriptFor(p.id)?.sections.some((s) => s.text.trim())).length,
  };

  /** Copy an asset into another project (the file itself is shared, not duplicated). */
  async function copyTo(asset: MediaAsset) {
    const target = copyTarget[asset.id];
    if (!target) return;
    const copy = media.addAsset({
      projectId: target,
      sceneIds: [],
      kind: asset.kind,
      source: asset.source,
      status: "ready",
      title: asset.title,
      payload: asset.payload,
      mime: asset.mime,
      durationSec: asset.durationSec,
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      seed: asset.seed,
      tags: asset.tags,
      approval: "draft",
    });
    // Uploads kept on this device: copy the bytes too.
    if (asset.source === "upload-session") {
      const url = media.blobUrlFor(asset.id);
      if (url) {
        const blob = await fetch(url).then((r) => r.blob()).catch(() => null);
        if (blob) await media.persistBlob(copy.id, blob).catch(() => undefined);
      }
    }
    setNotice(`“${asset.title}” added to ${projectName(target)} — find it in that project's Media library.`);
    window.setTimeout(() => setNotice(null), 4000);
  }

  function preview(a: MediaAsset) {
    const blob = media.blobUrlFor(a.id);
    const url = a.source === "provider-output" ? a.payload : a.source === "upload-session" ? blob : null;
    if (a.kind === "image") {
      if (a.source === "local-draft" && a.payload.trimStart().startsWith("<svg")) return <DraftImage svg={a.payload} title={a.title} />;
      if (url)
        return (
          // eslint-disable-next-line @next/next/no-img-element -- stored file URL.
          <img src={url} alt={a.title} loading="lazy" className="aspect-video w-full rounded-lg border border-border object-cover" />
        );
    }
    if (url && (a.kind === "voice" || a.kind === "music" || a.kind === "sfx" || a.kind === "video")) {
      return <MediaPlayer url={url} mime={a.mime} label={a.title} />;
    }
    return <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-text">Preview not available</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Storage type">
        {TABS.map((t) => {
          const n = t.id === "thumbnails" ? counts.thumbnails : t.id === "scripts" ? counts.scripts : t.id === "all" ? counts.all : undefined;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium",
                tab === t.id ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted",
              )}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
              {n !== undefined && <span className="text-xs opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_16rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-[34px] size-4 text-muted-text" aria-hidden="true" />
          <Input label="Search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="File or project name" className="pl-9" />
        </div>
        <Select label="Project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      {tab === "thumbnails" ? (
        thumbnails.length === 0 ? (
          <EmptyState title="No thumbnails yet" body="Thumbnails you make in Packaging appear here." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {thumbnails.map(({ project, variant }) => {
              const composed = composeThumbnail(variant.baseSvg!, variant.overlays);
              return (
                <li key={variant.id} className="rounded-xl border border-border bg-surface p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- composed SVG thumbnail. */}
                  <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(composed)}`} alt={variant.name} className="aspect-video w-full rounded-lg border border-border object-cover" />
                  <p className="mt-2 truncate text-sm font-medium">{variant.name}</p>
                  <p className="truncate text-xs text-muted-text">{project.name}</p>
                  <Button size="sm" variant="outline" className="mt-2" onClick={() => void downloadPng(composed, safeFileName(`${project.name} ${variant.name}`, "png")).catch(() => {})}>
                    Download PNG
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : tab === "scripts" ? (
        scriptRows.length === 0 ? (
          <EmptyState title="No scripts yet" body="Scripts you write appear here." />
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {scriptRows.map(({ project, script }) => {
              const text = script!.sections.map((s) => s.text.trim()).filter(Boolean).join("\n\n");
              const words = text.split(/\s+/).filter(Boolean).length;
              return (
                <li key={project.id} className="flex flex-wrap items-center gap-3 p-3">
                  <FileText className="size-5 shrink-0 text-muted-text" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{project.name}</p>
                    <p className="text-xs text-muted-text">{words.toLocaleString()} words · about {Math.max(1, Math.round(words / 150))} min</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(text)}>
                    <Copy className="size-4" aria-hidden="true" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadText(`${project.name}\n\n${text}\n`, safeFileName(project.name, "txt"), "text/plain")}>
                    Download .txt
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      ) : assets.length === 0 ? (
        <EmptyState title="Nothing here yet" body="Images, voice-overs, music and videos you generate or upload are kept here for every project." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => (
            <li key={a.id} className="flex flex-col rounded-xl border border-border bg-surface p-3">
              {preview(a)}
              <p className="mt-2 truncate text-sm font-medium" title={a.title}>
                {a.title}
              </p>
              <p className="truncate text-xs text-muted-text">
                {projectName(a.projectId)} · {fmtDate(a.createdAt)}
                {a.durationSec ? ` · ${fmtDur(a.durationSec)}` : ""}
                {a.fileSize ? ` · ${fmtSize(a.fileSize)}` : ""}
              </p>
              <div className="mt-auto flex flex-wrap items-end gap-2 pt-3">
                {canDownload(a, media.blobUrlFor(a.id)) && <AssetDownload asset={a} blobUrl={media.blobUrlFor(a.id)} size="sm" />}
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <select
                    aria-label={`Use “${a.title}” in another project`}
                    value={copyTarget[a.id] ?? ""}
                    onChange={(e) => setCopyTarget((m) => ({ ...m, [a.id]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Use in project…</option>
                    {liveProjects
                      .filter((p) => p.id !== a.projectId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <Button size="sm" variant="outline" disabled={!copyTarget[a.id]} onClick={() => void copyTo(a)}>
                    Add
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
