import { sharedLimit } from "@/src/server/shared-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashPassword } from "@/src/server/crypto";
import { toErrorResponse, validationError, backendUnavailable, zodToDetails } from "@/src/server/errors";
import { parseBody, emailSchema, passwordSchema, nameSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";
import { randomToken, hashToken } from "@/src/server/crypto";
import { sendAccountExistsEmail, sendVerificationEmail } from "@/src/server/email";

const signupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string().min(1),
    terms: z.literal(true, { message: "Accept the terms to create an account." }),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

/** Identical for new and existing addresses, so sign-up can't reveal who has an account. */
const PENDING = () => NextResponse.json({ data: { pending: true } }, { status: 202 });

/**
 * POST /api/v1/auth/signup — create an unverified user + workspace and email
 * a verification link (which signs them in). An existing address gets a
 * "you already have an account" email instead; the response is the same.
 */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    await sharedLimit(`signup:${clientKey(request)}`, 10, 3600);
    const body = await parseBody(request, signupSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const email = body.email.toLowerCase();

    const existing = await db`SELECT id FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
    // Hash either way so both paths take the same time.
    const passwordHash = await hashPassword(body.password);
    if (existing.length > 0) {
      await sendAccountExistsEmail(request, email);
      return PENDING();
    }

    const result = await db.begin(async (tx) => {
      const users = await tx`
        INSERT INTO users (email, name, password_hash) VALUES (${email}, ${body.name.trim()}, ${passwordHash})
        RETURNING id, email, name, email_verified_at, status, created_at
      `;
      const user = users[0] as Record<string, unknown>;
      const slug = `workspace-${String(user.id).slice(0, 8)}`;
      const workspaces = await tx`
        INSERT INTO workspaces (name, slug, owner_id) VALUES (${`${body.name.trim()}'s workspace`}, ${slug}, ${String(user.id)})
        RETURNING id, name, slug
      `;
      const workspace = workspaces[0] as Record<string, unknown>;
      await tx`
        INSERT INTO memberships (workspace_id, user_id, role) VALUES (${String(workspace.id)}, ${String(user.id)}, 'owner')
      `;
      await tx`
        INSERT INTO credit_accounts (workspace_id, balance) VALUES (${String(workspace.id)}, 0)
      `;
      return { user, workspace };
    });

    // Verification email; its link signs the new user in.
    try {
      const verifyToken = randomToken(24);
      await db`
        INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
        VALUES (${String(result.user.id)}, 'verify', ${hashToken(verifyToken)}, ${new Date(Date.now() + 24 * 3600000).toISOString()})
      `;
      await sendVerificationEmail(request, email, verifyToken);
    } catch (mailError) {
      console.error("verification email failed:", mailError instanceof Error ? mailError.message : String(mailError));
    }
    await audit({ userId: String(result.user.id), workspaceId: String(result.workspace.id), action: "auth.signup", resourceType: "user", resourceId: String(result.user.id) });
    return PENDING();
  } catch (error) {
    // Lost a race with a concurrent sign-up for the same address.
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "23505") return PENDING();
    if (error instanceof z.ZodError) {
      return toErrorResponse(validationError("Invalid signup data.", zodToDetails(error)));
    }
    return toErrorResponse(error);
  }
}
