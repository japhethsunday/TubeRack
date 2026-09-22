import { getDb } from "@/src/server/db";
import { forbidden, notFound } from "@/src/server/errors";
import type { SessionUser } from "@/src/server/auth";

/**
 * Centralized workspace authorization. Roles form a hierarchy:
 * owner > admin > editor > member > viewer. All resource access resolves
 * to a workspace server-side — frontend checks are never trusted.
 */

export type Role = "owner" | "admin" | "editor" | "member" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, member: 1, editor: 2, admin: 3, owner: 4 };

export interface Membership {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
}

export async function getMembership(workspaceId: string, userId: string): Promise<Membership | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`
    SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
    FROM memberships
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  const row = rows[0] as Membership | undefined;
  return row ?? null;
}

/** Require at least the given role in the workspace. Returns the membership. */
export async function requireMembership(workspaceId: string, user: SessionUser, minRole: Role): Promise<Membership> {
  const membership = await getMembership(workspaceId, user.id);
  if (!membership) throw forbidden("You are not a member of this workspace.");
  if (RANK[membership.role] < RANK[minRole]) {
    throw forbidden(`This action requires the ${minRole} role or higher.`);
  }
  return membership;
}

/** Resolve any resource row to its workspace for nested authorization. */
const WORKSPACE_OF: Record<string, { table: string; column: string }> = {
  channels: { table: "channels", column: "workspace_id" },
  projects: { table: "projects", column: "workspace_id" },
  opportunities: { table: "opportunities", column: "workspace_id" },
  media_assets: { table: "media_assets", column: "workspace_id" },
  perf_entries: { table: "perf_entries", column: "workspace_id" },
  channel_signals: { table: "channel_signals", column: "workspace_id" },
  analytics_snapshots: { table: "analytics_snapshots", column: "workspace_id" },
  credit_accounts: { table: "credit_accounts", column: "workspace_id" },
  usage_events: { table: "usage_events", column: "workspace_id" },
};

export async function workspaceOf(table: string, id: string): Promise<string | null> {
  const mapping = WORKSPACE_OF[table];
  if (!mapping) return null;
  const db = getDb();
  if (!db) return null;
  // Table allow-listed above; id is parameterized. No dynamic SQL risk.
  const rows = await db.unsafe(
    `SELECT ${mapping.column} AS "workspaceId" FROM ${mapping.table} WHERE id = $1 LIMIT 1`,
    [id],
  );
  const row = rows[0] as { workspaceId?: string } | undefined;
  return row?.workspaceId ?? null;
}

/** Authorize a nested resource: membership + existence (404 when foreign). */
export async function authorizeResource(
  table: string,
  id: string,
  user: SessionUser,
  minRole: Role,
): Promise<{ workspaceId: string; membership: Membership }> {
  const workspaceId = await workspaceOf(table, id);
  if (!workspaceId) throw notFound("Resource");
  const membership = await requireMembership(workspaceId, user, minRole);
  return { workspaceId, membership };
}

// Named permission checks matching the product UX.
export const canCreateProject = (m: Membership) => RANK[m.role] >= RANK.editor;
export const canEditProject = (m: Membership) => RANK[m.role] >= RANK.editor;
export const canDeleteProject = (m: Membership) => RANK[m.role] >= RANK.admin;
export const canManageMembers = (m: Membership) => RANK[m.role] >= RANK.admin;
export const canViewAnalytics = (m: Membership) => RANK[m.role] >= RANK.viewer;
export const canManageWorkspace = (m: Membership) => RANK[m.role] >= RANK.admin;
export const canManageBilling = (m: Membership) => RANK[m.role] >= RANK.owner;

export function assertCanCreateProject(m: Membership): void {
  if (!canCreateProject(m)) throw forbidden("Editors and above can create projects.");
}
export function assertCanEditProject(m: Membership): void {
  if (!canEditProject(m)) throw forbidden("Editors and above can edit content.");
}
export function assertCanDeleteProject(m: Membership): void {
  if (!canDeleteProject(m)) throw forbidden("Admins and owners can delete content.");
}
export function assertCanManageMembers(m: Membership): void {
  if (!canManageMembers(m)) throw forbidden("Admins and owners manage members.");
}
export function assertCanManageWorkspace(m: Membership): void {
  if (!canManageWorkspace(m)) throw forbidden("Admins and owners manage the workspace.");
}
export function assertCanManageBilling(m: Membership): void {
  if (!canManageBilling(m)) throw forbidden("Only owners manage billing.");
}
