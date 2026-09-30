import { getDb } from "@/src/server/db";
import { BackendError } from "@/src/server/errors";
import { creatorInfo } from "@/src/server/tiktok/client";
import { postToTikTok } from "@/src/server/tiktok/post";

/**
 * Scheduled TikTok posts. TikTok's API can't schedule, so the finished video
 * is uploaded to our storage now and posted here once `post_at` arrives.
 * A database job calls /api/cron/posts every few minutes.
 */

export async function scheduleTikTok(input: { workspaceId: string; userId: string; fileUrl: string; caption: string; postAt: Date; projectId?: string; promoId?: string }): Promise<{ id: string; postAt: string }> {
  const db = getDb();
  if (!db) throw new BackendError("BACKEND_UNAVAILABLE", "Scheduling isn't available right now.");
  const at = Number.isNaN(input.postAt.getTime()) ? new Date() : input.postAt;
  const [row] = await db`
    INSERT INTO scheduled_posts (workspace_id, user_id, project_id, promo_id, file_url, caption, post_at)
    VALUES (${input.workspaceId}, ${input.userId}, ${input.projectId ?? null}, ${input.promoId ?? null}, ${input.fileUrl}, ${input.caption.slice(0, 2200)}, ${at.toISOString()})
    RETURNING id, post_at`;
  return { id: String(row.id), postAt: new Date(String(row.post_at)).toISOString() };
}

/** Public when the account allows it, otherwise the widest audience TikTok offers. */
async function bestPrivacy(workspaceId: string): Promise<string> {
  const info = await creatorInfo(workspaceId);
  const options = info.privacy_level_options ?? [];
  for (const p of ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]) if (options.includes(p)) return p;
  return options[0] ?? "SELF_ONLY";
}

/** Post every TikTok video whose time has come. Safe to call as often as you like. */
export async function runDuePosts(limit = 3): Promise<{ posted: number; failed: number }> {
  const db = getDb();
  if (!db) return { posted: 0, failed: 0 };
  // Claim rows so two runs never post the same video.
  const due = await db`
    UPDATE scheduled_posts SET status = 'posting', attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM scheduled_posts
      WHERE (status = 'pending' AND post_at <= now()) OR (status = 'posting' AND updated_at < now() - interval '15 minutes' AND attempts < 3)
      ORDER BY post_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id, workspace_id, user_id, project_id, file_url, caption`;
  let posted = 0;
  let failed = 0;
  for (const r of due) {
    const workspaceId = String(r.workspace_id);
    try {
      const out = await postToTikTok(workspaceId, String(r.user_id), {
        fileUrl: String(r.file_url),
        mode: "direct",
        caption: String(r.caption ?? ""),
        privacy: await bestPrivacy(workspaceId),
        disableComment: false,
        disableDuet: false,
        disableStitch: false,
        brandOrganic: true,
        brandContent: false,
        isAigc: true,
        projectId: r.project_id ? String(r.project_id) : undefined,
      });
      await db`UPDATE scheduled_posts SET status = 'posted', publish_id = ${out.publishId}, error = null, updated_at = now() WHERE id = ${String(r.id)}`;
      posted++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db`UPDATE scheduled_posts SET status = 'failed', error = ${message.slice(0, 400)}, updated_at = now() WHERE id = ${String(r.id)}`;
      console.error("scheduled tiktok post failed:", message);
      failed++;
    }
  }
  return { posted, failed };
}

export interface ScheduledPostRow { id: string; caption: string; postAt: string; status: string; error: string | null }

/** What's queued or recently done, for the admin assistant. */
export async function listScheduledPosts(): Promise<ScheduledPostRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db`SELECT id, caption, post_at, status, error FROM scheduled_posts WHERE status IN ('pending','posting') OR updated_at > now() - interval '7 days' ORDER BY post_at LIMIT 30`;
  return rows.map((r) => ({ id: String(r.id), caption: String(r.caption).slice(0, 80), postAt: new Date(String(r.post_at)).toISOString(), status: String(r.status), error: r.error ? String(r.error) : null }));
}

export async function cancelScheduledPosts(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const rows = await db`UPDATE scheduled_posts SET status = 'cancelled', updated_at = now() WHERE status = 'pending' RETURNING id`;
  return rows.length;
}
