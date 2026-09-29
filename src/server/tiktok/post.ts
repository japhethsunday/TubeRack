import { getDb } from "@/src/server/db";
import { featureFlags } from "@/src/server/admin-ops";
import { storageGet } from "@/src/server/storage";
import { BackendError, validationError } from "@/src/server/errors";
import { tiktokAccessToken, tiktokApi, chunkPlan, uploadChunks } from "@/src/server/tiktok/client";

/** The owner's TikTok switch (Admin → Feature switches). Null when TikTok is on. */
export async function tiktokPaused(): Promise<string | null> {
  const f = (await featureFlags()).tiktok;
  return f?.off ? f.message?.trim() || "TikTok posting is paused for maintenance. Please try again later." : null;
}

/** Read a video uploaded with /api/v1/uploads/sign back from storage (joining parts). */
async function readUpload(workspaceId: string, fileUrl: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const m = /^\/api\/v1\/uploads\/([0-9a-f-]{36}\.(mp4|webm|mov))(?:\?parts=(\d{1,2}))?$/.exec(fileUrl);
  if (!m) throw validationError("That video file can't be found. Export it again.");
  const key = `${workspaceId}/uploads/${m[1]}`;
  const parts = Number(m[3] ?? 1);
  // TikTok's limit is 4 GB, but the whole file is held in memory here: keep it to what a server can safely handle.
  if (parts > 6) throw validationError("That video is too large to send to TikTok from here (max about 250 MB). Export a shorter or smaller version.");
  if (parts <= 1) return storageGet(key);
  const chunks: Uint8Array[] = [];
  let mime = "video/mp4";
  for (let i = 0; i < parts; i++) {
    const p = await storageGet(`${key}.part${i}`);
    chunks.push(p.bytes);
    mime = p.mime;
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return { bytes: out, mime };
}

export interface PostInput {
  fileUrl: string;
  mode: "direct" | "draft";
  caption: string;
  privacy: string;
  disableComment: boolean;
  disableDuet: boolean;
  disableStitch: boolean;
  brandOrganic: boolean;
  brandContent: boolean;
  isAigc: boolean;
  projectId?: string;
}

/** Send a finished video to TikTok: a direct post, or a draft in the creator's TikTok inbox. */
export async function postToTikTok(workspaceId: string, userId: string, input: PostInput): Promise<{ id: string; publishId: string }> {
  const paused = await tiktokPaused();
  if (paused) throw new BackendError("FORBIDDEN", paused);
  if (input.mode === "direct" && !input.privacy) throw validationError("Choose who can view this video.");
  const token = await tiktokAccessToken(workspaceId);
  const file = await readUpload(workspaceId, input.fileUrl);
  const mime = file.mime.startsWith("video/") ? file.mime : "video/mp4";
  const { chunkSize, count } = chunkPlan(file.bytes.byteLength);
  const source_info = { source: "FILE_UPLOAD", video_size: file.bytes.byteLength, chunk_size: chunkSize, total_chunk_count: count };
  const init =
    input.mode === "direct"
      ? await tiktokApi<{ publish_id?: string; upload_url?: string }>("/post/publish/video/init/", token, {
          post_info: {
            title: input.caption.slice(0, 2200),
            privacy_level: input.privacy,
            disable_comment: input.disableComment,
            disable_duet: input.disableDuet,
            disable_stitch: input.disableStitch,
            brand_organic_toggle: input.brandOrganic,
            brand_content_toggle: input.brandContent,
            is_aigc: input.isAigc,
            video_cover_timestamp_ms: 1000,
          },
          source_info,
        })
      : await tiktokApi<{ publish_id?: string; upload_url?: string }>("/post/publish/inbox/video/init/", token, { source_info });
  if (!init.publish_id || !init.upload_url) throw new BackendError("BACKEND_UNAVAILABLE", "TikTok didn't start the upload. Try again.");
  await uploadChunks(init.upload_url, file.bytes, mime);
  const id = crypto.randomUUID();
  const db = getDb();
  if (db) {
    await db`INSERT INTO tiktok_posts (id, workspace_id, user_id, project_id, publish_id, mode, caption, privacy, status)
      VALUES (${id}, ${workspaceId}, ${userId}, ${input.projectId ?? null}, ${init.publish_id}, ${input.mode}, ${input.caption.slice(0, 2200)}, ${input.privacy}, 'processing')`;
  }
  return { id, publishId: init.publish_id };
}

const DONE = new Set(["PUBLISH_COMPLETE", "SEND_TO_USER_INBOX"]);

/** Current status of a post (and saved on the post record). */
export async function tiktokPostStatus(workspaceId: string, publishId: string): Promise<{ status: string; done: boolean; failed: boolean; reason: string; postId: string | null }> {
  const db = getDb();
  if (db) {
    const [own] = await db`SELECT 1 FROM tiktok_posts WHERE workspace_id = ${workspaceId} AND publish_id = ${publishId}`;
    if (!own) throw validationError("That TikTok post wasn't found.");
  }
  const s = await tiktokApi<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>("/post/publish/status/fetch/", await tiktokAccessToken(workspaceId), { publish_id: publishId });
  const status = s.status ?? "PROCESSING";
  const failed = status === "FAILED";
  const done = DONE.has(status);
  const postId = s.publicaly_available_post_id?.[0] != null ? String(s.publicaly_available_post_id[0]) : null;
  if (db) await db`UPDATE tiktok_posts SET status = ${status.toLowerCase()}, fail_reason = ${s.fail_reason ?? ""}, updated_at = now() WHERE workspace_id = ${workspaceId} AND publish_id = ${publishId}`;
  return { status, done, failed, reason: s.fail_reason ?? "", postId };
}
