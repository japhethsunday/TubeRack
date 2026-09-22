import type { AccountState } from "@/src/lib/auth/types";

export const DEFAULT_RETURN_TO = "/dashboard";

/**
 * Allow only same-origin paths. Blocks absolute URLs, protocol-relative
 * URLs, backslashes, and control characters (open-redirect defense).
 */
export function sanitizeReturnTo(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_RETURN_TO;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_RETURN_TO;
  }
  if (value.includes("\\") || /[\r\n\t]/.test(value)) return DEFAULT_RETURN_TO;
  try {
    const url = new URL(value, "https://tuberack.local");
    const clean = url.pathname + url.search + url.hash;
    return clean.startsWith("/") && clean.length > 1 ? clean : DEFAULT_RETURN_TO;
  } catch {
    return DEFAULT_RETURN_TO;
  }
}

export function loginUrl(returnTo?: string): string {
  const safe = sanitizeReturnTo(returnTo ?? DEFAULT_RETURN_TO);
  return safe === DEFAULT_RETURN_TO ? "/login" : `/login?returnTo=${encodeURIComponent(safe)}`;
}

export interface AccountStateMeta {
  title: string;
  body: string;
  tone: "info" | "warn" | "bad" | "ok";
}

export const ACCOUNT_STATES: Record<AccountState, AccountStateMeta> = {
  new: {
    title: "Welcome aboard",
    body: "Finish the short onboarding so projects, brand, and channel defaults are ready.",
    tone: "info",
  },
  verified: {
    title: "Email verified",
    body: "Your address is confirmed. Security alerts and publishing receipts will reach you.",
    tone: "ok",
  },
  unverified: {
    title: "Verify your email",
    body: "Publishing and workspace invites stay paused until you confirm your address.",
    tone: "warn",
  },
  suspended: {
    title: "Account suspended",
    body: "Contact support to appeal. Projects are preserved while the appeal is open.",
    tone: "bad",
  },
  "onboarding-incomplete": {
    title: "Onboarding incomplete",
    body: "Two minutes of setup unlocks project defaults. Skip anything non-essential.",
    tone: "info",
  },
  "onboarding-complete": {
    title: "Onboarding complete",
    body: "Defaults saved. Create your first project when ready.",
    tone: "ok",
  },
  "session-expired": {
    title: "Session expired",
    body: "Sign in again to continue where you left off.",
    tone: "warn",
  },
  "session-invalid": {
    title: "Session invalid",
    body: "This session is no longer recognized. Sign in again.",
    tone: "bad",
  },
};
