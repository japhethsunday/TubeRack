import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { toErrorResponse, backendUnavailable, conflict } from "@/src/server/errors";
import { parseBody, parsePagination, pageResponse, nameSchema } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const createSchema = z.object({ name: nameSchema });

/** GET /api/v1/workspaces — workspaces I belong to. POST — create + owner membership + credit account. */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const pagination = parsePagination(request.url, ["created_at", "updated_at", "name"]);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const search = new URL(request.url).searchParams.get("search") ?? "";
    const values: unknown[] = [user.id];
    let searchClause = "";
    if (search) {
      values.push(`%${search}%`);
      searchClause = `AND w.name ILIKE $${values.length}`;
    }
    const totalRows = await db.unsafe(
      `SELECT COUNT(*)::int AS count FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
       WHERE m.user_id = $1 AND w.deleted_at IS NULL ${searchClause}`,
      values as never[],
    );
    const total = (totalRows[0] as unknown as { count: number }).count;
    const rows = await db.unsafe(
      `SELECT w.id, w.name, w.slug, w.owner_id, w.created_at, w.updated_at, m.role AS my_role
       FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
       WHERE m.user_id = $1 AND w.deleted_at IS NULL ${searchClause}
       ORDER BY w.updated_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pagination.limit, pagination.offset] as never[],
    );
    return NextResponse.json(pageResponse(rows, total, pagination));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const slug = `${body.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace"}-${user.id.slice(0, 8)}`;
    try {
      const row = await db.begin(async (tx) => {
        const ws = await tx`
          INSERT INTO workspaces (name, slug, owner_id) VALUES (${body.name.trim()}, ${slug}, ${user.id})
          RETURNING id, name, slug, owner_id, created_at, updated_at
        `;
        const workspace = ws[0] as Record<string, unknown>;
        await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${String(workspace.id)}, ${user.id}, 'owner')`;
        await tx`INSERT INTO credit_accounts (workspace_id, balance) VALUES (${String(workspace.id)}, 0)`;
        return workspace;
      });
      await audit({ userId: user.id, workspaceId: String(row.id), action: "workspace.created", resourceType: "workspace", resourceId: String(row.id) });
      return NextResponse.json({ data: { ...row, my_role: "owner" } }, { status: 201 });
    } catch (e) {
      if (e instanceof Error && "code" in e && (e as { code: string }).code === "23505") {
        throw conflict("A workspace with this name already exists.");
      }
      throw e;
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}
