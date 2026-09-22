import type { ZodError } from "zod";

/** First validation message per field, for aria-associated display. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Destructive confirmations require the exact phrase (whitespace-tolerant). */
export function canConfirmDelete(input: string): boolean {
  return input.trim() === "DELETE";
}
