import { cookies } from "next/headers";
import { getDb } from "@/src/server/db";
import { hashToken, randomToken } from "@/src/server/crypto";
import { backendUnavailable, forbidden, unauthorized } from "@/src/server/errors";
import { getServerEnv } from "@/src/lib/env";

export const SESSION_COOKIE = "tr_session";
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  status: string;
}

function requireAuthReady(): void {
  const env = getServerEnv();
  if (!env.CLOUDNIVO_DATABASE_URL || !env.JWT_SECRET) {
    throw backendUnavailable("Authentication backend");
  }
}

/** Create a session (login/signup). Returns the raw token for the cookie. */
export async function createSession(userId: string, meta?: { ipHash?: string; userAgent?: string }): Promise<string> {
  requireAuthReady();
  const db = getDb();
  if (!db) throw backendUnavailable("Authentication backend");
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db`
    INSERT INTO auth_sessions (user_id, token_hash, expires_at, ip_hash, user_agent)
    VALUES (${userId}, ${hashToken(token)}, ${expiresAt}, ${meta?.ipHash ?? null}, ${meta?.userAgent ?? null})
  `;
  return token;
}

/** Validate a raw token: expiry, revocation, suspension. Rotates last_used_at. */
export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const db = getDb();
  if (!db || !token) return null;
  const rows = await db`
    SELECT s.id AS session_id, s.expires_at, s.revoked_at, s.rotated_from,
           u.id, u.email, u.name, u.email_verified_at, u.status
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || row.revoked_at || new Date(String(row.expires_at)).getTime() < Date.now()) return null;
  if (row.status !== "active") return null;
  // Reuse detection: a rotated-from token used again revokes the family.
  if (row.rotated_from) {
    await db`UPDATE auth_sessions SET revoked_at = now() WHERE id = ${String(row.session_id)} OR rotated_from = ${String(row.session_id)}`;
    return null;
  }
  await db`UPDATE auth_sessions SET last_used_at = now() WHERE id = ${String(row.session_id)}`;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    emailVerifiedAt: row.email_verified_at ? String(row.email_verified_at) : null,
    status: String(row.status),
  };
}

/** Rotate: issue a replacement, link the old token for reuse detection. */
export async function rotateSession(oldToken: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`SELECT id, user_id, expires_at FROM auth_sessions WHERE token_hash = ${hashToken(oldToken)} LIMIT 1`;
  const row = rows[0] as { id: string; user_id: string; expires_at: string } | undefined;
  if (!row) return null;
  const token = randomToken();
  await db`
    INSERT INTO auth_sessions (user_id, token_hash, expires_at, rotated_from)
    VALUES (${row.user_id}, ${hashToken(token)}, ${row.expires_at}, ${row.id})
  `;
  await db`UPDATE auth_sessions SET revoked_at = now() WHERE id = ${row.id}`;
  return token;
}

export async function revokeSession(token: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db`UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)}`;
}

export async function revokeAllSessions(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId} AND revoked_at IS NULL`;
}

/** Revoke every session except the one holding keepToken (password change). */
export async function revokeOtherSessions(userId: string, keepToken: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  await db`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId} AND token_hash <> ${hashToken(keepToken)} AND revoked_at IS NULL`;
}

/** Read the session cookie and resolve the user (null when anonymous). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
}

/** Require a signed-in user or throw UNAUTHORIZED. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}

/** Require a user id match (used by /users/me scoping) or throw FORBIDDEN. */
export function requireSelf(user: SessionUser, id: string): void {
  if (user.id !== id) throw forbidden("You can only access your own account.");
}

export function sessionCookie(token: string): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_DAYS * 86400,
    },
  };
}

export function expiredSessionCookie(): { name: string; value: string; options: Record<string, unknown> } {
  return { name: SESSION_COOKIE, value: "", options: { httpOnly: true, path: "/", maxAge: 0 } };
}
