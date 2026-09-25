import { getDb } from "@/src/server/db";

/** In-app notification for every member of a workspace (best-effort). */
export async function notifyWorkspace(workspaceId: string, n: { type: string; title: string; body: string; metadata?: Record<string, unknown> }): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db`
      INSERT INTO notifications (user_id, workspace_id, type, title, body, metadata)
      SELECT m.user_id, ${workspaceId}, ${n.type}, ${n.title.slice(0, 200)}, ${n.body.slice(0, 1000)}, ${JSON.stringify(n.metadata ?? {})}
      FROM memberships m WHERE m.workspace_id = ${workspaceId}
    `;
  } catch (error) {
    console.error("notify failed:", error instanceof Error ? error.message : String(error));
  }
}

/** Verified emails of everyone in a workspace (owners first). */
export async function workspaceEmails(workspaceId: string): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db`
    SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} AND u.status = 'active' AND u.email_verified_at IS NOT NULL
    ORDER BY (m.role = 'owner') DESC LIMIT 10
  `;
  return rows.map((r) => String(r.email));
}
