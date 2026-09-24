import { getDb } from "@/src/server/db";
import { requireUser, type SessionUser } from "@/src/server/auth";
import { requireMembership } from "@/src/server/authz";
import { defaultWorkspace } from "@/src/server/sync";
import { backendUnavailable } from "@/src/server/errors";

export interface WorkspaceCaller {
  user: SessionUser;
  workspaceId: string;
  db: NonNullable<ReturnType<typeof getDb>>;
}

/** Signed-in user + their default workspace + a live DB handle. */
export async function requireWorkspace(role: "viewer" | "editor" = "editor"): Promise<WorkspaceCaller> {
  const user = await requireUser();
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const workspaceId = await defaultWorkspace(user);
  await requireMembership(workspaceId, user, role);
  return { user, workspaceId, db };
}
