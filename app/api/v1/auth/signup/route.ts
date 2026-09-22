import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { hashPassword } from "@/src/server/crypto";
import { createSession, sessionCookie } from "@/src/server/auth";
import { conflict, toErrorResponse, validationError, backendUnavailable, zodToDetails } from "@/src/server/errors";
import { parseBody, emailSchema, passwordSchema, nameSchema } from "@/src/server/validate";
import { limiterFor, clientKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const signupSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string().min(1),
    terms: z.literal(true, { message: "Accept the terms to create an account." }),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match.", path: ["confirm"] });

/** POST /api/v1/auth/signup — create user + workspace + session. */
export async function POST(request: Request) {
  try {
    const limit = limiterFor("auth").take(`auth:${clientKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const body = await parseBody(request, signupSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const email = body.email.toLowerCase();

    const existing = await db`SELECT id FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
    if (existing.length > 0) throw conflict("An account with this email already exists.");

    const passwordHash = await hashPassword(body.password);
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

    const token = await createSession(String(result.user.id), {
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    const cookie = sessionCookie(token);
    const store = await cookies();
    store.set(cookie.name, cookie.value, cookie.options as never);
    await audit({ userId: String(result.user.id), workspaceId: String(result.workspace.id), action: "auth.signup", resourceType: "user", resourceId: String(result.user.id) });
    return NextResponse.json(
      { data: { user: { id: result.user.id, email: result.user.email, name: result.user.name }, workspace: result.workspace } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "23505") {
      return toErrorResponse(conflict("An account with this email already exists."));
    }
    if (error instanceof z.ZodError) {
      return toErrorResponse(validationError("Invalid signup data.", zodToDetails(error)));
    }
    return toErrorResponse(error);
  }
}
