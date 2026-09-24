import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { createSession, sessionCookie } from "@/src/server/auth";
import { hashPassword, randomToken, safeEqual } from "@/src/server/crypto";
import { linkOrigin } from "@/src/server/email";
import { audit } from "@/src/server/audit";
import { sanitizeReturnTo } from "@/src/lib/auth/session";
import { limiterFor, clientKey } from "@/src/server/rate-limit";

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
}

/**
 * GET /api/v1/auth/google/callback — finish "Continue with Google".
 * Google has verified the email address, so an existing account with that
 * address is signed in, and a new address gets an account + workspace.
 */
export async function GET(request: Request) {
  const origin = linkOrigin(request);
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("g_login_state")?.value ?? "";
  const returnTo = sanitizeReturnTo(store.get("g_login_return")?.value ?? "/dashboard");
  store.delete({ name: "g_login_state", path: "/api/v1/auth/google" });
  store.delete({ name: "g_login_return", path: "/api/v1/auth/google" });
  const fail = (message: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  if (url.searchParams.get("error")) return fail("Google sign-in was cancelled.");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!expected || !state || !safeEqual(state, expected) || !code) return fail("That sign-in link expired. Please try again.");
  const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
  if (limit.allowed === false) return fail("Too many attempts. Wait a minute and try again.");

  try {
    const env = getServerEnv();
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${origin}/api/v1/auth/google/callback`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const tokens = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
    if (!tokenRes.ok || !tokens.access_token) throw new Error(`token exchange failed: ${tokens.error_description || tokens.error || tokenRes.status}`);

    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const profile = (await profileRes.json().catch(() => ({}))) as GoogleProfile;
    const email = profile.email?.trim().toLowerCase() ?? "";
    const verified = profile.email_verified === true || profile.email_verified === "true";
    if (!profileRes.ok || !email) throw new Error("Google did not return an email address");
    if (!verified) return fail("Your Google email isn't verified. Verify it with Google or sign up with email.");

    const db = getDb();
    if (!db) return fail("Sign-in is unavailable right now. Please try again shortly.");

    const existing = await db`SELECT id, status, email_verified_at FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
    let userId: string;
    let created = false;
    const row = existing[0] as { id: string; status: string; email_verified_at: string | null } | undefined;
    if (row) {
      if (row.status !== "active") return fail("This account can't sign in. Contact support.");
      userId = String(row.id);
      if (!row.email_verified_at) await db`UPDATE users SET email_verified_at = now() WHERE id = ${userId}`;
    } else {
      const name = (profile.name?.trim() || email.split("@")[0]).slice(0, 80);
      // No password yet: an unguessable one; "Forgot password" can set a real one later.
      const passwordHash = await hashPassword(randomToken(32));
      userId = await db.begin(async (tx) => {
        const users = await tx`
          INSERT INTO users (email, name, password_hash, email_verified_at) VALUES (${email}, ${name}, ${passwordHash}, now())
          RETURNING id
        `;
        const id = String((users[0] as { id: string }).id);
        const workspaces = await tx`
          INSERT INTO workspaces (name, slug, owner_id) VALUES (${`${name}'s workspace`}, ${`workspace-${id.slice(0, 8)}`}, ${id})
          RETURNING id
        `;
        const workspaceId = String((workspaces[0] as { id: string }).id);
        await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${workspaceId}, ${id}, 'owner')`;
        await tx`INSERT INTO credit_accounts (workspace_id, balance) VALUES (${workspaceId}, 0)`;
        return id;
      });
      created = true;
    }

    const token = await createSession(userId, { userAgent: request.headers.get("user-agent") ?? undefined });
    const cookie = sessionCookie(token);
    store.set(cookie.name, cookie.value, cookie.options as never);
    await audit({ userId, action: created ? "auth.signup.google" : "auth.login.google", resourceType: "user", resourceId: userId }).catch(() => undefined);
    return NextResponse.redirect(`${origin}${created ? "/onboarding" : returnTo}`);
  } catch (error) {
    console.error("google sign-in failed:", error instanceof Error ? error.message.slice(0, 300) : error);
    return fail("Google sign-in didn't complete. Please try again.");
  }
}
