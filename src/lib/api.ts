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

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
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
