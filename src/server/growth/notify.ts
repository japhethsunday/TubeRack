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
