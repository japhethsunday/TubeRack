"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityKind,
  Channel,
  Project,
  ProjectInput,
  StageState,
} from "@/src/lib/projects/types";
import type { ProjectStage as DomainStage } from "@/src/types/domain";
import {
  archiveProject,
  buildEvent,
  completeCurrentStage,
  createChannel,
  createProject,
  duplicateProject,
  mostRecentActive,
  renameProject,
  restoreProject,
  setStageState,
  updateProject,
} from "@/src/lib/projects/store";
import {
  emptyBundle,
  parseBundle,
  RECENT_SEARCHES_KEY,
  WORKSPACE_STORAGE_KEY,
  type WorkspaceBundle,
} from "@/src/lib/projects/storage";
import { InfoLine } from "@/src/components/ui/Toast";
import { useBackend } from "@/src/components/shell/BackendStatus";
import { pullBundle, pushBundle } from "@/src/lib/sync";

interface ProjectsContextValue {
  ready: boolean;
  projects: Project[];
  channels: Channel[];
  events: ReturnType<typeof buildEvent>[];
  recentSearches: string[];
  activeChannelId: string;
  setActiveChannelId: (id: string) => void;
  channelName: (id: string) => string;
  create: (input: ProjectInput) => Project;
  rename: (id: string, name: string) => void;
  update: (id: string, patch: Partial<ProjectInput>) => void;
  duplicate: (id: string) => Project;
  archive: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  completeStage: (id: string) => void;
  setStage: (id: string, stage: DomainStage, state: StageState) => void;
  touch: (id: string) => void;
  addChannel: (name: string, niche: string) => Channel;
  recordSearch: (q: string) => void;
  importBundle: (data: unknown) => { projects: number; channels: number };
  exportBundle: () => WorkspaceBundle;
  mostRecent: Project | null;
}

const Ctx = createContext<ProjectsContextValue | null>(null);

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProjects must be used inside ProjectsProvider.");
  return ctx;
}

/** Optional access for surfaces (e.g. command menu) that render without data. */
export function useProjectsOptional(): ProjectsContextValue | null {
  return useContext(Ctx);
}

function readStorage(): WorkspaceBundle {
  try {
    const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return emptyBundle();
    return parseBundle(JSON.parse(raw));
  } catch {
    return emptyBundle();
  }
}

function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    // Corrupt recents are disposable — ignore.
    return [];
  }
}

interface Snapshot {
  bundle: WorkspaceBundle;
  recents: string[];
  ready: boolean;
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useBackend();
  const cloud = mode === "cloud";
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    bundle: emptyBundle(),
    recents: [],
    ready: false,
  }));
  const [activeChannelId, setActiveChannelId] = useState("all");
  // Explicit deletes propagate on the next cloud push, then clear.
  const tombstones = useRef<{ projects: string[]; channels: string[] }>({ projects: [], channels: [] });

  // Post-mount hydration: cloud first (validated), device fallback.
  // Server has no localStorage, so this cannot be a lazy initializer.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync with the external storage system.
    void (async () => {
      if (cloud) {
        try {
          const remote = await pullBundle("workspace", true);
          if (!cancelled && remote) {
            setSnapshot({ bundle: parseBundle(remote), recents: readRecents(), ready: true });
            return;
          }
        } catch {
          // Fall through to device storage.
        }
      }
      if (!cancelled) setSnapshot({ bundle: readStorage(), recents: readRecents(), ready: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [cloud]);

  const bundle = snapshot.bundle;
  const ready = snapshot.ready;
  const recentSearches = snapshot.recents;

  const setBundle = useCallback(
    (fn: (b: WorkspaceBundle) => WorkspaceBundle) =>
      setSnapshot((s) => ({ ...s, bundle: fn(s.bundle) })),
    [],
  );

  const setRecentSearches = useCallback(
    (fn: (r: string[]) => string[]) =>
      setSnapshot((s) => ({ ...s, recents: fn(s.recents) })),
    [],
  );

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(bundle));
    } catch {
      // Quota/private mode: session continues in memory. Disclosed in UI.
    }
    if (!cloud) return;
    const timer = window.setTimeout(() => {
      const tomb = { deletedProjectIds: tombstones.current.projects, deletedChannelIds: tombstones.current.channels };
      void pushBundle("workspace", true, {
        projects: bundle.projects,
        channels: bundle.channels,
        events: bundle.events.slice(0, 200),
        ...tomb,
      }).then((result) => {
        if (result) tombstones.current = { projects: [], channels: [] };
      }).catch(() => {
        // Offline: local mirror holds; tombstones retry on the next push.
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [bundle, ready, cloud]);

  const mutate = useCallback(
    (fn: (b: WorkspaceBundle) => WorkspaceBundle) => setBundle((b) => fn(b)),
    [setBundle],
  );

  const pushEvent = useCallback(
    (kind: ActivityKind, project: Pick<Project, "id" | "name">, detail: string) =>
      buildEvent(kind, project.name, detail, { projectId: project.id }),
    [],
  );

  const value = useMemo<ProjectsContextValue>(() => {
    const channelName = (id: string) =>
      bundle.channels.find((c) => c.id === id)?.name ?? "Unknown channel";
    return {
      ready,
      projects: bundle.projects,
      channels: bundle.channels,
      events: bundle.events,
      recentSearches,
      activeChannelId,
      setActiveChannelId,
      channelName,
      create: (input) => {
        const project = createProject(input);
        const event = pushEvent("project.created", project, `Created in ${channelName(input.channelId)}.`);
        mutate((b) => ({
          ...b,
          projects: [project, ...b.projects],
          events: [event, ...b.events].slice(0, 200),
        }));
        return project;
      },
      rename: (id, name) => {
        mutate((b) => {
          const project = b.projects.find((p) => p.id === id);
          if (!project) return b;
          const event = pushEvent("project.renamed", { ...project, name }, `Renamed to “${name.trim()}”.`);
          return {
            ...b,
            projects: b.projects.map((p) => (p.id === id ? renameProject(p, name) : p)),
            events: [event, ...b.events].slice(0, 200),
          };
        });
      },
      update: (id, patch) =>
        mutate((b) => ({
          ...b,
          projects: b.projects.map((p) => (p.id === id ? updateProject(p, patch) : p)),
        })),
      duplicate: (id) => {
        const source = bundle.projects.find((p) => p.id === id);
        if (!source) throw new Error("Project not found.");
        const copy = duplicateProject(source);
        const event = pushEvent("project.duplicated", copy, `Duplicated from “${source.name}”.`);
        mutate((b) => ({
          ...b,
          projects: [copy, ...b.projects],
          events: [event, ...b.events].slice(0, 200),
        }));
        return copy;
      },
      archive: (id) =>
        mutate((b) => {
          const project = b.projects.find((p) => p.id === id);
          if (!project) return b;
          const event = pushEvent("project.archived", project, "Moved to archive.");
          return {
            ...b,
            projects: b.projects.map((p) => (p.id === id ? archiveProject(p) : p)),
            events: [event, ...b.events].slice(0, 200),
          };
        }),
      restore: (id) =>
        mutate((b) => {
          const project = b.projects.find((p) => p.id === id);
          if (!project) return b;
          const event = pushEvent("project.restored", project, "Restored from archive.");
          return {
            ...b,
            projects: b.projects.map((p) => (p.id === id ? restoreProject(p) : p)),
            events: [event, ...b.events].slice(0, 200),
          };
        }),
      remove: (id) =>
        mutate((b) => {
          const project = b.projects.find((p) => p.id === id);
          if (!project) return b;
          tombstones.current.projects.push(id);
          const event = buildEvent("project.deleted", project.name, "Permanently deleted from this device.", {
            category: "system",
          });
          return {
            ...b,
            projects: b.projects.filter((p) => p.id !== id),
            events: [event, ...b.events].slice(0, 200),
          };
        }),
      completeStage: (id) =>
        mutate((b) => {
          const project = b.projects.find((p) => p.id === id);
          if (!project) return b;
          const event = pushEvent(
            "project.stage",
            project,
            `Completed “${project.currentStage}”, moved to next stage.`,
          );
          return {
            ...b,
            projects: b.projects.map((p) => (p.id === id ? completeCurrentStage(p) : p)),
            events: [event, ...b.events].slice(0, 200),
          };
        }),
      setStage: (id, stage, state) =>
        mutate((b) => ({
          ...b,
          projects: b.projects.map((p) => (p.id === id ? setStageState(p, stage, state) : p)),
        })),
      touch: (id) =>
        mutate((b) => ({
          ...b,
          projects: b.projects.map((p) =>
            p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p,
          ),
        })),
      addChannel: (name, niche) => {
        const channel = createChannel(name, niche);
        const event = buildEvent("channel.created", channel.name, "Channel created.", {
          category: "system",
        });
        mutate((b) => ({
          ...b,
          channels: [...b.channels, channel],
          events: [event, ...b.events].slice(0, 200),
        }));
        return channel;
      },
      recordSearch: (q) => {
        const clean = q.trim();
        if (!clean) return;
        setRecentSearches((prev) => {
          const next = [clean, ...prev.filter((x) => x !== clean)].slice(0, 5);
          try {
            localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
          } catch {
            // Disposable — ignore.
          }
          return next;
        });
      },
      importBundle: (data) => {
        const incoming = parseBundle(data);
        mutate((b) => ({
          ...b,
          projects: [...incoming.projects, ...b.projects],
          channels: [...b.channels, ...incoming.channels.filter((c) => !b.channels.some((x) => x.id === c.id))],
          events: [...incoming.events, ...b.events].slice(0, 200),
        }));
        return { projects: incoming.projects.length, channels: incoming.channels.length };
      },
      exportBundle: () => bundle,
      mostRecent: mostRecentActive(bundle.projects),
    };
  }, [bundle, ready, recentSearches, activeChannelId, mutate, pushEvent, setRecentSearches]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type { DomainStage as ProjectStage };

/** Honest storage disclosure used wherever local data appears. */
export function LocalStorageNote({ compact }: { compact?: boolean }) {
  return (
    <InfoLine>
      {compact
        ? "Stored on this device only — cloud sync arrives in Phase 11."
        : "Projects, channels, and activity are stored in this browser only (device-local). Cloud sync, sharing, and history across devices arrive with the backend in Phase 11."}
    </InfoLine>
  );
}
