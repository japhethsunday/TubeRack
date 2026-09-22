import type { AuthErrorCode, AuthErrorContent } from "@/src/lib/auth/types";

/**
 * Every auth failure maps to an understandable, actionable message.
 * Messages never echo credentials, tokens, or which half of a pair was wrong
 * beyond what is necessary to act.
 */
export const AUTH_ERRORS: Record<AuthErrorCode, AuthErrorContent> = {
  "incorrect-credentials": {
    title: "Could not sign you in",
    body: "That email and password combination was not recognized. Check for typos, or reset your password.",
    actionLabel: "Reset password",
    actionHref: "/forgot-password",
  },
  "account-not-found": {
    title: "No account for that email",
    body: "There is no TubeRack account with this address yet. Create one to get started.",
    actionLabel: "Create account",
    actionHref: "/signup",
  },
  "email-taken": {
    title: "Email already registered",
    body: "This address already has an account. Sign in instead, or reset the password.",
    actionLabel: "Sign in",
    actionHref: "/login",
  },
  "weak-password": {
    title: "Password too weak",
    body: "Use at least 8 characters with mixed cases, numbers, or symbols.",
    actionLabel: "Try again",
    actionHref: "/signup",
  },
  "password-mismatch": {
    title: "Passwords do not match",
    body: "Retype the same password in both fields.",
    actionLabel: "Try again",
    actionHref: "/signup",
  },
  "terms-required": {
    title: "Terms not accepted",
    body: "Accept the terms to create an account.",
    actionLabel: "Review terms",
    actionHref: "/signup",
  },
  "invalid-token": {
    title: "This link is invalid",
    body: "The link is malformed or was already used. Request a fresh one.",
    actionLabel: "Request a new link",
    actionHref: "/forgot-password",
  },
  "expired-token": {
    title: "This link has expired",
    body: "Reset and verification links expire after 60 minutes. Request a fresh one.",
    actionLabel: "Request a new link",
    actionHref: "/forgot-password",
  },
  "session-expired": {
    title: "Session expired",
    body: "You were signed out for security after 30 days of inactivity. Sign in again to continue.",
    actionLabel: "Sign in",
    actionHref: "/login",
  },
  unauthorized: {
    title: "Not authorized",
    body: "Sign in with an account that has access to this workspace.",
    actionLabel: "Sign in",
    actionHref: "/login",
  },
  "network-failure": {
    title: "Connection problem",
    body: "The request never reached the server. Check your connection and retry — nothing was changed.",
    actionLabel: "Retry",
    actionHref: "/login",
  },
  "provider-failure": {
    title: "Service unavailable",
    body: "The authentication service did not respond. Wait a minute and retry.",
    actionLabel: "Retry",
    actionHref: "/login",
  },
  "rate-limited": {
    title: "Too many attempts",
    body: "Sign-in is paused for 10 minutes after repeated failures. Resetting the password still works.",
    actionLabel: "Reset password",
    actionHref: "/forgot-password",
  },
};

export function authError(code: AuthErrorCode): AuthErrorContent {
  return AUTH_ERRORS[code];
}

/**
 * Forgot-password responses must not reveal whether an address is registered.
 * One fixed message is used for both cases.
 */
export const FORGOT_SUBMITTED_MESSAGE =
  "If an account exists for that address, a reset link is on its way. It expires in 60 minutes.";
