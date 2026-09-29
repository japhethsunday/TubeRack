"use client";

/**
 * Typed API client for /api/v1. Maps backend error codes to ApiError.
 * Session cookie flows automatically (same-origin). No secrets handled here.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BACKEND_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: string[];

  constructor(code: ApiErrorCode, message: string, status: number, details?: string[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  isAuth(): boolean {
    return this.code === "UNAUTHORIZED";
  }

  isUnavailable(): boolean {
    return this.code === "BACKEND_UNAVAILABLE" || this.code === "NETWORK_ERROR";
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** Set while a generated video is being made: its parts are covered by the video's flat price. */
let videoPass: string | null = null;
export function setVideoPass(pass: string | null): void {
  videoPass = pass;
}

/* ---------- AI activity: lets the app show "AI is working…" wherever a generation runs. ---------- */

const AI_LABELS: [RegExp, string][] = [
  [/^\/api\/v1\/ai\/script/, "Writing your script"],
  [/^\/api\/v1\/ai\/speech/, "Recording the voice-over"],
  [/^\/api\/v1\/ai\/(image|scene-visuals)/, "Creating visuals"],
  [/^\/api\/v1\/ai\/video-clip/, "Making an AI video clip"],
  [/^\/api\/v1\/ai\/transcribe/, "Making captions"],
  [/^\/api\/v1\/ai\/(package|rewrite)/, "Writing titles and text"],
  [/^\/api\/v1\/(ai\/intelligence|content-ideas|recreate|niche|market|trends|competitors)/, "Researching"],
  [/^\/api\/v1\/channel-plans/, "Building your channel plan"],
  [/^\/api\/v1\/brand/, "Designing"],
  [/^\/api\/v1\/credits\/video-pass/, "Generating your video"],
];

export interface AiTask {
  id: number;
  label: string;
  startedAt: number;
}

let aiSeq = 0;
let aiTasks: AiTask[] = [];
const aiListeners = new Set<(tasks: AiTask[]) => void>();

export function subscribeAiActivity(fn: (tasks: AiTask[]) => void): () => void {
  aiListeners.add(fn);
  fn(aiTasks);
  return () => {
    aiListeners.delete(fn);
  };
}

function trackAi(path: string, method: string): (() => void) | null {
  if (method === "GET" || method === "DELETE") return null;
  const label = AI_LABELS.find(([re]) => re.test(path))?.[1];
  if (!label) return null;
  const task = { id: ++aiSeq, label, startedAt: Date.now() };
  aiTasks = [...aiTasks, task];
  aiListeners.forEach((fn) => fn(aiTasks));
  return () => {
    aiTasks = aiTasks.filter((t) => t.id !== task.id);
    aiListeners.forEach((fn) => fn(aiTasks));
  };
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const done = trackAi(path, options.method ?? "GET");
  try {
    return await request<T>(path, options);
  } finally {
    done?.();
  }
}

async function request<T>(path: string, options: ApiOptions): Promise<T> {
  let response: Response;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (videoPass && path.startsWith("/api/")) headers["x-video-pass"] = videoPass;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: Object.keys(headers).length ? headers : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection.", 0);
  }
  let payload: { data?: T; error?: string; message?: string; details?: string[] } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new ApiError("INTERNAL_ERROR", `Unexpected response (${response.status}).`, response.status);
  }
  if (!response.ok) {
    throw new ApiError(
      (payload.error as ApiErrorCode) ?? "INTERNAL_ERROR",
      payload.message ?? `Request failed (${response.status}).`,
      response.status,
      payload.details,
    );
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  remove: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
