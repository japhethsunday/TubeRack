/**
 * Auth + account contracts — Phase 3 frontend foundation.
 * Pure types only. Enforcement, persistence, and sessions arrive in Phase 11.
 * Nothing here creates a session, stores a credential, or sends an email.
 */

export type AccountState =
  | "new"
  | "verified"
  | "unverified"
  | "suspended"
  | "onboarding-incomplete"
  | "onboarding-complete"
  | "session-expired"
  | "session-invalid";

export interface PreviewIdentity {
  name: string;
  email: string;
  workspace: string;
  channel: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  plan: string;
}

export type AuthErrorCode =
  | "incorrect-credentials"
  | "account-not-found"
  | "email-taken"
  | "weak-password"
  | "password-mismatch"
  | "terms-required"
  | "invalid-token"
  | "expired-token"
  | "session-expired"
  | "unauthorized"
  | "network-failure"
  | "provider-failure"
  | "rate-limited";

export interface AuthErrorContent {
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}

export type NotificationKey =
  | "generation-completed"
  | "generation-failed"
  | "render-completed"
  | "project-activity"
  | "publishing-events"
  | "account-security"
  | "product-updates";

export interface NotificationPreference {
  key: NotificationKey;
  label: string;
  blurb: string;
}
