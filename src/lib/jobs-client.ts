"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/src/lib/api";

/**
 * Browser side of long-running provider work: queue a job, poll it, cancel
 * or retry it, and read which providers are configured + healthy.
 */

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled" | "retrying";
export type JobType = "generation" | "audio" | "transcription" | "render";

export interface ClientJob {
  id: string;
  type: JobType;
  provider: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  output: Record<string, unknown>;
  created_at: string;
  attempts: number;
  max_attempts: number;
}

export async function queueJob(type: JobType, input: Record<string, unknown>, projectId?: string): Promise<ClientJob> {
  return api.post<ClientJob>("/api/v1/generate", { type, input, projectId });
}

export async function jobAction(id: string, action: "cancel" | "retry"): Promise<ClientJob> {
  return api.patch<ClientJob>(`/api/v1/jobs/${id}`, { action });
}

const TERMINAL = new Set<JobStatus>(["completed", "failed", "cancelled"]);

/** Poll a job every 2s until terminal. `onSettled` fires once per terminal state (completed/failed/cancelled). */
export function useJob(jobId: string | null, onDone?: (job: ClientJob) => void) {
  const [job, setJob] = useState<ClientJob | null>(null);
  const settled = useRef<string | null>(null);
  const [poke, setPoke] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer = 0;
    const load = async () => {
      try {
        const next = await api.get<ClientJob>(`/api/v1/jobs/${jobId}`);
        if (!alive) return;
        setJob(next);
        const key = `${next.status}:${next.attempts}`;
        if (TERMINAL.has(next.status) && settled.current !== key) {
          settled.current = key;
          done.current?.(next);
        }
        if (!TERMINAL.has(next.status)) timer = window.setTimeout(load, 2000);
      } catch {
        if (alive) timer = window.setTimeout(load, 5000);
      }
    };
    void load();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [jobId, poke]);
  /** Accept a job returned by cancel/retry and resume polling if it is live again. */
  const update = useCallback((next: ClientJob) => {
    setJob(next);
    if (!TERMINAL.has(next.status)) setPoke((n) => n + 1);
  }, []);
  return { job, setJob: update };
}

export interface ProviderInfo {
  provider: string;
  capabilities: string[];
  configured: boolean;
  gpuRequired: boolean;
  local: boolean;
  health?: "healthy" | "unreachable" | "not-configured" | "configured";
}

let cache: Promise<ProviderInfo[]> | null = null;

/** Registry with live health (cached per tab; refresh with `reload`). */
export function useProviderRegistry() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const load = useCallback((force = false) => {
    if (force || !cache) {
      cache = api
        .get<{ providers: ProviderInfo[] }>("/api/v1/system/providers?health=1")
        .then((d) => d.providers)
        .catch(() => {
          cache = null;
          return [];
        });
    }
    void cache.then(setProviders);
  }, []);
  useEffect(() => load(), [load]);
  const usable = (name: string) => {
    const p = providers?.find((x) => x.provider === name);
    return Boolean(p?.configured && (p.health === "healthy" || p.health === "configured"));
  };
  return { providers, usable, reload: () => load(true) };
}

export function jobErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "UNAUTHORIZED") return "Sign in to use this provider.";
    return error.message;
  }
  return "Could not start the job.";
}
