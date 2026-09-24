import { getDb } from "@/src/server/db";
import { channelUploads, resolveChannel, type ChannelUpload } from "@/src/server/youtube/client";
import { competitorStats, titleKeywords } from "@/src/lib/growth/competitors";
import { notifyWorkspace } from "@/src/server/growth/notify";
import { conflict, validationError } from "@/src/server/errors";

export const MAX_COMPETITORS = 15;

export interface CompetitorRow {
  id: string;
  channel_id: string;
  title: string;
  thumbnail: string;
  subscribers: number | null;
  uploads_playlist: string;
  seen_outliers: string[];
  last_checked_at: string | null;
  created_at: string;
}

function db() {
  const d = getDb();
  if (!d) throw new Error("Database unavailable.");
  return d;
}

export async function listCompetitors(workspaceId: string): Promise<CompetitorRow[]> {
  const rows = await db()`SELECT id, channel_id, title, thumbnail, subscribers, uploads_playlist, seen_outliers, last_checked_at, created_at FROM competitors WHERE workspace_id = ${workspaceId} ORDER BY created_at`;
  return rows.map((r) => ({ ...(r as unknown as CompetitorRow), subscribers: r.subscribers === null ? null : Number(r.subscribers) }));
}

export async function addCompetitor(workspaceId: string, userId: string, input: string): Promise<CompetitorRow> {
  const existing = await listCompetitors(workspaceId);
  if (existing.length >= MAX_COMPETITORS) throw validationError(`You can track up to ${MAX_COMPETITORS} channels. Remove one first.`);
  const ch = await resolveChannel(input);
  if (existing.some((c) => c.channel_id === ch.id)) throw conflict(`${ch.title} is already tracked.`);
  // Seed seen outliers so only NEW breakouts alert.
  const uploads = await channelUploads(ch.uploadsPlaylist, 20).catch(() => []);
  const seen = competitorStats(uploads).outliers.map((o) => o.id);
  const rows = await db()`
    INSERT INTO competitors (workspace_id, channel_id, title, thumbnail, subscribers, uploads_playlist, seen_outliers, last_checked_at, created_by)
    VALUES (${workspaceId}, ${ch.id}, ${ch.title}, ${ch.thumbnail}, ${ch.subscribers}, ${ch.uploadsPlaylist}, ${seen}, now(), ${userId})
    RETURNING id, channel_id, title, thumbnail, subscribers, uploads_playlist, seen_outliers, last_checked_at, created_at
  `;
  return rows[0] as unknown as CompetitorRow;
}

export async function removeCompetitor(workspaceId: string, id: string): Promise<void> {
  await db()`DELETE FROM competitors WHERE workspace_id = ${workspaceId} AND id = ${id}`;
}

export interface CompetitorReport {
  competitor: CompetitorRow;
  stats: Omit<ReturnType<typeof competitorStats<ChannelUpload>>, "scored">;
  uploads: (ChannelUpload & { multiple: number })[];
  keywords: { word: string; count: number }[];
  newOutliers: string[];
  error?: string;
}

/** Refresh every tracked channel; alerts on outliers not seen before. */
export async function competitorReport(workspaceId: string): Promise<CompetitorReport[]> {
  const list = await listCompetitors(workspaceId);
  const out: CompetitorReport[] = [];
  for (let i = 0; i < list.length; i += 4) {
    const batch = list.slice(i, i + 4);
    const settled = await Promise.allSettled(batch.map((c) => channelUploads(c.uploads_playlist, 20)));
    for (let j = 0; j < batch.length; j++) {
      const c = batch[j];
      const s = settled[j];
      if (s.status === "rejected") {
        out.push({ competitor: c, stats: { medianViews: 0, uploadsPerWeek: 0, lastUploadDaysAgo: null, shortsShare: 0, outliers: [] }, uploads: [], keywords: [], newOutliers: [], error: s.reason instanceof Error ? s.reason.message : "Refresh failed." });
        continue;
      }
      const { scored, ...stats } = competitorStats(s.value);
      const fresh = stats.outliers.filter((o) => !c.seen_outliers.includes(o.id));
      if (fresh.length) {
        for (const o of fresh.slice(0, 3)) {
          await notifyWorkspace(workspaceId, {
            type: "competitor.outlier",
            title: `${c.title} has a breakout video`,
            body: `“${o.title}” is at ${o.views.toLocaleString("en")} views — ${o.multiple.toFixed(1)}× their median.`,
            metadata: { videoId: o.id, channelId: c.channel_id },
          });
        }
        await db()`UPDATE competitors SET seen_outliers = ${[...new Set([...c.seen_outliers, ...fresh.map((f) => f.id)])].slice(-200)}, last_checked_at = now() WHERE id = ${c.id}`;
      } else {
        await db()`UPDATE competitors SET last_checked_at = now() WHERE id = ${c.id}`;
      }
      out.push({
        competitor: c,
        stats,
        uploads: scored.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()),
        keywords: titleKeywords(stats.outliers.length >= 2 ? stats.outliers.map((o) => o.title) : scored.map((u) => u.title)),
        newOutliers: fresh.map((f) => f.id),
      });
    }
  }
  return out;
}
