import { NextResponse } from "next/server";
import type { z } from "zod";

/**
 * Centralized backend error system. Predictable codes, safe messages.
 * Never leaks stacks, SQL, secrets, or infrastructure details.
 */

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "BACKEND_UNAVAILABLE"
  | "INTERNAL_ERROR";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  BACKEND_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export class BackendError extends Error {
  readonly code: ErrorCode;
  readonly details?: string[];

  constructor(code: ErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = "BackendError";
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = "Sign in to continue.") =>
  new BackendError("UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new BackendError("FORBIDDEN", message);
export const notFound = (resource = "Resource") =>
  new BackendError("NOT_FOUND", `${resource} not found.`);
export const validationError = (message: string, details?: string[]) =>
  new BackendError("VALIDATION_ERROR", message, details);
export const conflict = (message: string) => new BackendError("CONFLICT", message);
export const rateLimited = (retryAfterSec: number) =>
  new BackendError("RATE_LIMITED", `Too many requests. Retry in ${retryAfterSec} seconds.`);
export const backendUnavailable = (what: string) =>
  new BackendError("BACKEND_UNAVAILABLE", `${what} is not configured yet. Add credentials to enable it.`);
export const internalError = () =>
  new BackendError("INTERNAL_ERROR", "Something went wrong. Nothing was changed.");

export function toErrorResponse(error: unknown, retryAfterSec?: number): NextResponse {
  if (error instanceof BackendError) {
    const headers: Record<string, string> = {};
    if (error.code === "RATE_LIMITED" && retryAfterSec !== undefined) {
      headers["Retry-After"] = String(retryAfterSec);
    }
    return NextResponse.json(
      { error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) },
      { status: STATUS[error.code], headers },
    );
  }
  // Unknown errors are never serialized — log server-side, return generic.
  console.error("Unhandled backend error:", error instanceof Error ? error.message : String(error));
  const generic = internalError();
  return NextResponse.json(
    { error: generic.code, message: generic.message },
    { status: STATUS[generic.code] },
  );
}

/** Parse a zod failure into a safe validation error (no schema internals). */
export function zodToDetails(error: z.ZodError): string[] {
  return error.issues.slice(0, 8).map((i) => {
    const field = i.path.length > 0 ? String(i.path[i.path.length - 1]) : "value";
    return `${field}: ${i.message}`;
  });
}
