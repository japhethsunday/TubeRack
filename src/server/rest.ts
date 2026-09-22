import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser, type SessionUser } from "@/src/server/auth";
import { requireMembership, authorizeResource, type Role } from "@/src/server/authz";
import {
  notFound,
  validationError,
  conflict,
  rateLimited,
  toErrorResponse,
  zodToDetails,
} from "@/src/server/errors";
import { parseBody, parsePagination, parseId, pageResponse } from "@/src/server/validate";
import { limiterFor, clientKey, type LimitClass } from "@/src/server/rate-limit";
import { audit } from "@/src/server/audit";

/**
 * Consistent collection/item handlers for workspace-scoped tables.
 * Every route gets: auth, membership authorization, zod validation,
 * parameterized queries, pagination/filter/sort, rate limits, audit, errors.
 * Table + column names come from an internal allow-list — never the client.
 */

export interface ResourceConfig {
  table: keyof typeof TABLES;
  createSchema: z.ZodType<Record<string, unknown>>;
  patchSchema: z.ZodType<Record<string, unknown>>;
  columns: string[];
  searchColumns: string[];
  sortColumns: string[];
  defaultSort: string;
  listRole?: Role;
  writeRole?: Role;
  deleteRole?: Role;
  auditPrefix: string;
}

// Registry of servable tables and their queryable surface.
export const TABLES = {
  workspaces: { columns: ["id", "name", "slug", "owner_id", "created_at", "updated_at"], sorts: ["created_at", "updated_at", "name"] },
  memberships: { columns: ["id", "workspace_id", "user_id", "role", "created_at"], sorts: ["created_at", "role"] },
  channels: { columns: ["id", "workspace_id", "name", "niche", "created_at", "updated_at"], sorts: ["created_at", "updated_at", "name"] },
  brand_profiles: { columns: ["id", "channel_id", "identity", "audience", "tone", "voice", "topics", "pillars", "formats", "visual_identity", "use_words", "avoid_words", "positioning", "updated_at"], sorts: ["updated_at"] },
  projects: { columns: ["id", "workspace_id", "channel_id", "name", "content_type", "platform", "topic", "description", "goal", "stages", "current_stage", "status", "created_at", "updated_at", "archived_at", "last_opened_at"], sorts: ["created_at", "updated_at", "name"] },
  project_events: { columns: ["id", "project_id", "workspace_id", "actor_id", "kind", "detail", "created_at"], sorts: ["created_at"] },
  media_assets: { columns: ["id", "workspace_id", "project_id", "scene_ids", "kind", "source", "status", "title", "payload", "mime", "duration_sec", "width", "height", "file_size", "seed", "tags", "approval", "storage_key", "error", "created_at", "updated_at"], sorts: ["created_at", "updated_at", "title"] },
  opportunities: { columns: ["id", "workspace_id", "project_id", "title", "topic", "angle", "audience", "reasoning", "format", "hook", "source_task", "status", "created_at", "updated_at"], sorts: ["created_at", "updated_at"] },
  render_requests: { columns: ["id", "project_id", "workspace_id", "preset", "settings", "issues", "health", "status", "created_at", "updated_at"], sorts: ["created_at"] },
  perf_entries: { columns: ["id", "workspace_id", "project_id", "platform", "date", "views", "watch_hours", "likes", "comments", "shares", "subs_gained", "impressions", "ctr", "avg_view_duration_sec", "retention_pct", "traffic_source", "audience_note", "notes", "provenance", "created_at", "updated_at"], sorts: ["date", "created_at", "views"] },
  retention_notes: { columns: ["id", "project_id", "at_sec", "label", "note", "section_id", "created_at"], sorts: ["created_at"] },
  channel_signals: { columns: ["id", "workspace_id", "channel_id", "kind", "title", "evidence", "implication", "status", "created_at"], sorts: ["created_at"] },
  analytics_snapshots: { columns: ["id", "workspace_id", "name", "at", "range_days", "entry_count", "totals", "created_at"], sorts: ["created_at", "at"] },
  credit_transactions: { columns: ["id", "account_id", "kind", "amount", "balance_after", "ref", "created_at"], sorts: ["created_at"] },
  usage_events: { columns: ["id", "workspace_id", "user_id", "kind", "units", "model", "provider", "status", "ref", "created_at"], sorts: ["created_at"] },
  notifications: { columns: ["id", "user_id", "workspace_id", "type", "title", "body", "read_at", "metadata", "created_at"], sorts: ["created_at"] },
  audit_log: { columns: ["id", "workspace_id", "user_id", "action", "resource_type", "resource_id", "metadata", "created_at"], sorts: ["created_at"] },
} as const;

export type TableName = keyof typeof TABLES;

function checkLimit(request: Request, limitClass: LimitClass): Response | null {
  const key = `${limitClass}:${clientKey(request)}`;
  const result = limiterFor(limitClass).take(key);
  if (!result.allowed) {
    return toErrorResponse(rateLimited(result.retryAfterSec), result.retryAfterSec);
  }
  return null;
}

function identifiers(table: TableName, columns: string[]): { cols: string[] } {
  const allowed = new Set([...TABLES[table].columns, "workspace_id", "updated_at"]);
  const cols = columns.filter((c) => allowed.has(c));
  return { cols };
}

export interface CollectionContext {
  user: SessionUser;
  workspaceId: string;
}

/** Resolve workspace scope: explicit ?workspaceId (membership-checked) for nested routes. */
export async function resolveWorkspace(request: Request, user: SessionUser, minRole: Role): Promise<CollectionContext> {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? "";
  if (!workspaceId) throw validationError("workspaceId query parameter is required.");
  const membership = await requireMembership(parseId(workspaceId, "workspace"), user, minRole);
  return { user, workspaceId: membership.workspaceId };
}

export function collectionHandlers(config: ResourceConfig & { scopeColumn: "workspace_id" | "project_id" | "user_id" }) {
  const table = config.table;

  async function GET(request: Request) {
    try {
      const limited = checkLimit(request, "read");
      if (limited) return limited;
      const user = await requireUser();
      const url = new URL(request.url);
      const pagination = parsePagination(url, [...TABLES[table].sorts]);
      const db = getDb();
      if (!db) {
        const { backendUnavailable } = await import("@/src/server/errors");
        throw backendUnavailable("Database");
      }
      // Workspace scoping: explicit param, membership-enforced.
      const scopeParam = url.searchParams.get(config.scopeColumn === "workspace_id" ? "workspaceId" : config.scopeColumn === "project_id" ? "projectId" : "userId") ?? "";
      let workspaceId = "";
      let extraWhere = "";
      const values: unknown[] = [];
      if (config.scopeColumn === "workspace_id") {
        const ctx = await resolveWorkspace(request, user, config.listRole ?? "viewer");
        workspaceId = ctx.workspaceId;
        values.push(workspaceId);
        extraWhere = `workspace_id = $1`;
      } else if (config.scopeColumn === "project_id") {
        const projectId = parseId(scopeParam, "project");
        const auth = await authorizeResource("projects", projectId, user, config.listRole ?? "viewer");
        workspaceId = auth.workspaceId;
        values.push(projectId);
        extraWhere = `project_id = $1`;
      } else {
        values.push(user.id);
        extraWhere = `user_id = $1`;
      }
      let idx = values.length;
      const conditions = [extraWhere];
      const status = url.searchParams.get("status");
      if (status && config.columns.includes("status")) {
        idx += 1;
        conditions.push(`status = $${idx}`);
        values.push(status);
      }
      const kind = url.searchParams.get("kind");
      if (kind && config.columns.includes("kind")) {
        idx += 1;
        conditions.push(`kind = $${idx}`);
        values.push(kind);
      }
      if (pagination.search && config.searchColumns.length > 0) {
        const ors = config.searchColumns.map((c) => {
          idx += 1;
          values.push(`%${pagination.search}%`);
          return `${c} ILIKE $${idx}`;
        });
        conditions.push(`(${ors.join(" OR ")})`);
      }
      const sortOptions = [...TABLES[table].sorts] as string[];
      const sortCol = pagination.sort && sortOptions.includes(pagination.sort) ? pagination.sort : config.defaultSort;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const cols = [...TABLES[table].columns].join(", ");
      const totalRows = await db.unsafe(`SELECT COUNT(*)::int AS count FROM ${table} ${where}`, values as never[]);
      const total = (totalRows[0] as unknown as { count: number }).count;
      const rows = await db.unsafe(
        `SELECT ${cols} FROM ${table} ${where} ORDER BY ${sortCol} ${pagination.order.toUpperCase() === "ASC" ? "ASC" : "DESC"} LIMIT $${idx + 1} OFFSET $${idx + 2}`,
        [...values, pagination.limit, pagination.offset] as never[],
      );
      return Response.json(pageResponse(rows, total, pagination));
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  async function POST(request: Request) {
    try {
      const limited = checkLimit(request, "write");
      if (limited) return limited;
      const user = await requireUser();
      const body = await parseBody(request, config.createSchema as never) as Record<string, unknown>;
      const db = getDb();
      if (!db) {
        const { backendUnavailable } = await import("@/src/server/errors");
        throw backendUnavailable("Database");
      }
      const url = new URL(request.url);
      let workspaceId = "";
      if (config.scopeColumn === "workspace_id") {
        const ctx = await resolveWorkspace(request, user, config.writeRole ?? "editor");
        workspaceId = ctx.workspaceId;
        (body as Record<string, unknown>).workspace_id = workspaceId;
      } else if (config.scopeColumn === "project_id") {
        const projectId = parseId(url.searchParams.get("projectId") ?? (body.project_id as string) ?? "", "project");
        const auth = await authorizeResource("projects", projectId, user, config.writeRole ?? "editor");
        workspaceId = auth.workspaceId;
        (body as Record<string, unknown>).project_id = projectId;
        if (config.columns.includes("workspace_id")) (body as Record<string, unknown>).workspace_id = workspaceId;
      } else {
        (body as Record<string, unknown>).user_id = user.id;
      }
      const { cols } = identifiers(table, Object.keys(body));
      if (cols.length === 0) throw validationError("No writable fields provided.");
      const vals = cols.map((c) => {
        const v = (body as Record<string, unknown>)[c];
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
      const selectCols = [...TABLES[table].columns].join(", ");
      let row: Record<string, unknown>;
      try {
        const rows = await db.unsafe(
          `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) RETURNING ${selectCols}`,
          vals as never[],
        );
        row = rows[0] as Record<string, unknown>;
      } catch (e) {
        if (e instanceof Error && "code" in e && (e as { code: string }).code === "23505") {
          throw conflict("A record with these values already exists.");
        }
        throw e;
      }
      await audit({ workspaceId: workspaceId || undefined, userId: user.id, action: `${config.auditPrefix}.created`, resourceType: table, resourceId: String(row.id) });
      return Response.json({ data: row }, { status: 201 });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return { GET, POST };
}

export function itemHandlers(config: ResourceConfig & { scope: "workspace" | "project" | "user" | "self" }) {
  const table = config.table;

  async function resolve(
    request: Request,
    user: SessionUser,
    minRole: Role,
  ): Promise<{ row: Record<string, unknown>; workspaceId: string }> {
    const id = parseId(new URL(request.url).pathname.split("/").pop() ?? "");
    const db = getDb();
    if (!db) {
      const { backendUnavailable } = await import("@/src/server/errors");
      throw backendUnavailable("Database");
    }
    if (config.scope === "workspace") {
      const auth = await authorizeResource(table, id, user, minRole);
      const rows = await db.unsafe(`SELECT ${[...TABLES[table].columns].join(", ")} FROM ${table} WHERE id = $1 LIMIT 1`, [id] as never[]);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) throw notFound("Resource");
      return { row, workspaceId: auth.workspaceId };
    }
    if (config.scope === "project") {
      const rows = await db.unsafe(`SELECT ${[...TABLES[table].columns].join(", ")}, project_id FROM ${table} WHERE id = $1 LIMIT 1`, [id] as never[]);
      const row = rows[0] as unknown as (Record<string, unknown> & { project_id: string }) | undefined;
      if (!row) throw notFound("Resource");
      const auth = await authorizeResource("projects", String(row.project_id), user, minRole);
      return { row, workspaceId: auth.workspaceId };
    }
    // user/self scope: ownership check.
    const column = config.scope === "self" ? "user_id" : "user_id";
    const rows = await db.unsafe(`SELECT ${[...TABLES[table].columns].join(", ")} FROM ${table} WHERE id = $1 LIMIT 1`, [id] as never[]);
    const row = rows[0] as (Record<string, unknown> & { user_id?: string }) | undefined;
    if (!row || (column && row[column] !== user.id)) throw notFound("Resource");
    return { row, workspaceId: "" };
  }

  async function GET(request: Request) {
    try {
      const limited = checkLimit(request, "read");
      if (limited) return limited;
      const user = await requireUser();
      const { row } = await resolve(request, user, config.listRole ?? "viewer");
      return Response.json({ data: row });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  async function PATCH(request: Request) {
    try {
      const limited = checkLimit(request, "write");
      if (limited) return limited;
      const user = await requireUser();
      const body = await parseBody(request, config.patchSchema as never) as Record<string, unknown>;
      const { row, workspaceId } = await resolve(request, user, config.writeRole ?? "editor");
      const { cols } = identifiers(table, Object.keys(body));
      if (cols.length === 0) throw validationError("No writable fields provided.");
      const db = getDb();
      if (!db) {
        const { backendUnavailable } = await import("@/src/server/errors");
        throw backendUnavailable("Database");
      }
      const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
      const touch = [...TABLES[table].columns].includes("updated_at") ? ", updated_at = now()" : "";
      const vals = cols.map((c) => {
        const v = (body as Record<string, unknown>)[c];
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });
      const updated = await db.unsafe(
        `UPDATE ${table} SET ${sets}${touch} WHERE id = $${cols.length + 1} RETURNING ${[...TABLES[table].columns].join(", ")}`,
        [...vals, String(row.id)] as never[],
      );
      await audit({ workspaceId: workspaceId || undefined, userId: user.id, action: `${config.auditPrefix}.updated`, resourceType: table, resourceId: String(row.id) });
      return Response.json({ data: updated[0] });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  async function DELETE(request: Request) {
    try {
      const limited = checkLimit(request, "write");
      if (limited) return limited;
      const user = await requireUser();
      const { row, workspaceId } = await resolve(request, user, config.deleteRole ?? "admin");
      const db = getDb();
      if (!db) {
        const { backendUnavailable } = await import("@/src/server/errors");
        throw backendUnavailable("Database");
      }
      await db.unsafe(`DELETE FROM ${table} WHERE id = $1`, [String(row.id)] as never[]);
      await audit({ workspaceId: workspaceId || undefined, userId: user.id, action: `${config.auditPrefix}.deleted`, resourceType: table, resourceId: String(row.id) });
      return Response.json({ data: { deleted: true } });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return { GET, PATCH, DELETE };
}
