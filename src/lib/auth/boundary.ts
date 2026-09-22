/**
 * Phase 11 integration boundary for authentication.
 * Server enforcement, sessions, emails, and persistence do not exist yet.
 * Forms validate locally and then surface this boundary — they never claim
 * success, delivery, or storage.
 */

export const AUTH_BACKEND_PHASE = "Phase 11";

export class AuthNotIntegratedError extends Error {
  readonly code = "AUTH_NOT_INTEGRATED";

  constructor(feature: string) {
    super(
      `${feature} requires the authentication service (${AUTH_BACKEND_PHASE} integration boundary). Input was validated locally; nothing was sent or stored.`,
    );
    this.name = "AuthNotIntegratedError";
  }
}

/** No proxy/middleware enforcement exists: a pass-through would imply fake protection. */
export const SESSION_ENFORCEMENT = {
  enforced: false,
  phase: AUTH_BACKEND_PHASE,
  note: "Protected-route UX is built, but actual gating waits for server sessions.",
} as const;

export function boundaryMessage(feature: string): string {
  return new AuthNotIntegratedError(feature).message;
}
