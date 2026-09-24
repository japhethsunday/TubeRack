import { accessToken, getConnection, googleApi, NotConnectedError } from "@/src/server/google/oauth";

/** YouTube Analytics + Data API calls against the workspace's connected channel. */

const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";
const DATA = "https://www.googleapis.com/youtube/v3";

type Report = { columnHeaders?: { name: string }[]; rows?: (string | number)[][] };

export function reportRows(r: Report): Record<string, string | number>[] {
  const cols = (r.columnHeaders ?? []).map((c) => c.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function report(token: string, params: Record<string, string>): Promise<Record<string, string | number>[]> {
  const q = new URLSearchParams({ ids: "channel==MINE", ...params });
  return reportRows(await googleApi<Report>(`${ANALYTICS}?${q.toString()}`, token));
}

export interface ChannelAnalytics {
  channel: { id: string; title: string; thumbnail: string; subscribers: number | null; views: number | null; videos: number | null };
  range: { start: string; end: string; days: number };
  totals: Record<string, number>;
  daily: Record<string, string | number>[];
  topVideos: (Record<string, string | number> & { title: string; thumbnail: string })[];
  traffic: Record<string, string | number>[];
  impressions: { available: boolean; impressions?: number; ctr?: number };
}

export async function channelAnalytics(workspaceId: string, days: number): Promise<ChannelAnalytics> {
  const conn = await getConnection(workspaceId);
  if (!conn) throw new NotConnectedError();
  const token = await accessToken(workspaceId);
  // Analytics data lags ~2 days; end yesterday.
  const end = new Date(Date.now() - 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const range = { startDate: ymd(start), endDate: ymd(end) };
  const core = "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost,likes,comments,shares";

  const [chanRes, totals, daily, top, traffic, impressions] = await Promise.all([
    googleApi<{ items?: { statistics?: Record<string, string>; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> } }[] }>(
      `${DATA}/channels?part=snippet,statistics&mine=true`,
      token,
    ),
    report(token, { ...range, metrics: core }),
    report(token, { ...range, metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost", dimensions: "day", sort: "day" }),
    report(token, { ...range, metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,subscribersGained", dimensions: "video", sort: "-views", maxResults: "10" }),
    report(token, { ...range, metrics: "views,estimatedMinutesWatched", dimensions: "insightTrafficSourceType", sort: "-views" }).catch(() => []),
    report(token, { ...range, metrics: "videoThumbnailImpressions,videoThumbnailImpressionsClickRate" }).catch(() => null),
  ]);

  const ids = top.map((t) => String(t.video)).filter(Boolean);
  const meta = new Map<string, { title: string; thumbnail: string }>();
  if (ids.length) {
    const v = await googleApi<{ items?: { id: string; snippet?: { title?: string; thumbnails?: Record<string, { url?: string }> } }[] }>(
      `${DATA}/videos?part=snippet&id=${ids.join(",")}`,
      token,
    );
    for (const it of v.items ?? []) meta.set(it.id, { title: it.snippet?.title ?? it.id, thumbnail: it.snippet?.thumbnails?.medium?.url ?? "" });
  }
  const ch = chanRes.items?.[0];
  const num = (v: string | undefined) => (v === undefined ? null : Number(v));
  const t0 = totals[0] ?? {};
  return {
    channel: {
      id: conn.channelId,
      title: ch?.snippet?.title ?? conn.channelTitle,
      thumbnail: ch?.snippet?.thumbnails?.default?.url ?? conn.channelThumbnail,
      subscribers: num(ch?.statistics?.subscriberCount),
      views: num(ch?.statistics?.viewCount),
      videos: num(ch?.statistics?.videoCount),
    },
    range: { start: range.startDate, end: range.endDate, days },
    totals: Object.fromEntries(Object.entries(t0).map(([k, v]) => [k, Number(v)])),
    daily,
    topVideos: top.map((t) => ({ ...t, ...(meta.get(String(t.video)) ?? { title: String(t.video), thumbnail: "" }) })),
    traffic,
    impressions: impressions && impressions[0]
      ? { available: true, impressions: Number(impressions[0].videoThumbnailImpressions), ctr: Number(impressions[0].videoThumbnailImpressionsClickRate) }
      : { available: false },
  };
}

export interface MyVideo {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  privacy: string;
  publishAt: string | null;
  views: number | null;
}

export async function myVideos(workspaceId: string, max = 25): Promise<MyVideo[]> {
  const conn = await getConnection(workspaceId);
  if (!conn) throw new NotConnectedError();
  const token = await accessToken(workspaceId);
  if (!conn.uploadsPlaylist) return [];
  const list = await googleApi<{ items?: { contentDetails?: { videoId?: string } }[] }>(
    `${DATA}/playlistItems?part=contentDetails&maxResults=${Math.min(50, max)}&playlistId=${conn.uploadsPlaylist}`,
    token,
  );
  const ids = (list.items ?? []).map((i) => i.contentDetails?.videoId).filter((x): x is string => Boolean(x));
  if (!ids.length) return [];
  const v = await googleApi<{ items?: { id: string; snippet?: { title?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; status?: { privacyStatus?: string; publishAt?: string }; statistics?: { viewCount?: string } }[] }>(
    `${DATA}/videos?part=snippet,status,statistics&id=${ids.join(",")}`,
    token,
  );
  return (v.items ?? []).map((it) => ({
    id: it.id,
    title: it.snippet?.title ?? "",
    thumbnail: it.snippet?.thumbnails?.medium?.url ?? "",
    publishedAt: it.snippet?.publishedAt ?? "",
    privacy: it.status?.privacyStatus ?? "",
    publishAt: it.status?.publishAt ?? null,
    views: it.statistics?.viewCount ? Number(it.statistics.viewCount) : null,
  }));
}

/**
 * Start a resumable upload. The browser PUTs the file bytes straight to the
 * returned URL (CORS is allowed for the Origin sent here), so large videos
 * never pass through our serverless functions.
 */
export async function createUploadSession(
  workspaceId: string,
  origin: string,
  input: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
    privacy: "private" | "unlisted" | "public";
    publishAt: string | null;
    madeForKids: boolean;
    size: number;
    mime: string;
    defaultLanguage?: string;
    containsSyntheticMedia?: boolean;
    notifySubscribers?: boolean;
    embeddable?: boolean;
    license?: "youtube" | "creativeCommon";
  },
): Promise<string> {
  const token = await accessToken(workspaceId);
  const status: Record<string, unknown> = { privacyStatus: input.publishAt ? "private" : input.privacy, selfDeclaredMadeForKids: input.madeForKids };
  if (input.publishAt) status.publishAt = input.publishAt;
  if (input.containsSyntheticMedia !== undefined) status.containsSyntheticMedia = input.containsSyntheticMedia;
  if (input.embeddable !== undefined) status.embeddable = input.embeddable;
  if (input.license) status.license = input.license;
  const snippet: Record<string, unknown> = { title: input.title, description: input.description, tags: input.tags, categoryId: input.categoryId };
  if (input.defaultLanguage) {
    snippet.defaultLanguage = input.defaultLanguage;
    snippet.defaultAudioLanguage = input.defaultLanguage;
  }
  const notify = input.notifySubscribers === false ? "&notifySubscribers=false" : "";
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status${notify}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(input.size),
      "X-Upload-Content-Type": input.mime,
      Origin: origin,
    },
    body: JSON.stringify({ snippet, status }),
    signal: AbortSignal.timeout(20000),
  });
  const location = response.headers.get("location");
  if (!response.ok || !location) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`YouTube upload could not start: ${body.error?.message ?? response.status}`);
  }
  return location;
}

export async function setThumbnail(workspaceId: string, videoId: string, bytes: Uint8Array, mime: string): Promise<void> {
  const token = await accessToken(workspaceId);
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mime },
    body: Buffer.from(bytes),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`YouTube thumbnail update failed: ${body.error?.message ?? response.status}`);
  }
}

/** Per-window video performance for A/B tests: CTR when the API exposes it, else views/day. */
export async function videoWindowStats(
  workspaceId: string,
  videoId: string,
  start: string,
  end: string,
): Promise<{ metric: "ctr" | "views"; impressions: number | null; ctr: number | null; views: number; watchMinutes: number }> {
  const token = await accessToken(workspaceId);
  const base = { startDate: start.slice(0, 10), endDate: end.slice(0, 10), filters: `video==${videoId}` };
  const views = await report(token, { ...base, metrics: "views,estimatedMinutesWatched" });
  const v = views[0] ?? {};
  try {
    const imp = await report(token, { ...base, metrics: "videoThumbnailImpressions,videoThumbnailImpressionsClickRate" });
    const r = imp[0];
    if (r) {
      return { metric: "ctr", impressions: Number(r.videoThumbnailImpressions), ctr: Number(r.videoThumbnailImpressionsClickRate), views: Number(v.views ?? 0), watchMinutes: Number(v.estimatedMinutesWatched ?? 0) };
    }
  } catch {
    // impressions/CTR not exposed for this channel — fall back to views
  }
  return { metric: "views", impressions: null, ctr: null, views: Number(v.views ?? 0), watchMinutes: Number(v.estimatedMinutesWatched ?? 0) };
}

export interface Playlist {
  id: string;
  title: string;
  itemCount: number;
  privacy: string;
}

export async function myPlaylists(workspaceId: string): Promise<Playlist[]> {
  const token = await accessToken(workspaceId);
  const out: Playlist[] = [];
  let page = "";
  for (let i = 0; i < 4; i++) {
    const r = await googleApi<{ nextPageToken?: string; items?: { id: string; snippet?: { title?: string }; contentDetails?: { itemCount?: number }; status?: { privacyStatus?: string } }[] }>(
      `${DATA}/playlists?part=snippet,contentDetails,status&mine=true&maxResults=50${page ? `&pageToken=${page}` : ""}`,
      token,
    );
    for (const p of r.items ?? []) out.push({ id: p.id, title: p.snippet?.title ?? "", itemCount: p.contentDetails?.itemCount ?? 0, privacy: p.status?.privacyStatus ?? "" });
    if (!r.nextPageToken) break;
    page = r.nextPageToken;
  }
  return out;
}

export async function addToPlaylist(workspaceId: string, playlistId: string, videoId: string): Promise<void> {
  const token = await accessToken(workspaceId);
  await googleApi(`${DATA}/playlistItems?part=snippet`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } } }),
  });
}

/** Upload a caption track (WebVTT) as a published, non-draft track. */
export async function uploadCaptions(workspaceId: string, videoId: string, input: { language: string; name: string; vtt: string }): Promise<void> {
  const token = await accessToken(workspaceId);
  const boundary = `tuberack${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ snippet: { videoId, language: input.language, name: input.name, isDraft: false } }) +
    `\r\n--${boundary}\r\nContent-Type: text/vtt\r\n\r\n${input.vtt}\r\n--${boundary}--`;
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/captions?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const b = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`YouTube captions upload failed: ${b.error?.message ?? response.status}`);
  }
}

export interface VideoStatus {
  id: string;
  title: string;
  uploadStatus: string; // uploaded | processed | failed | rejected | deleted
  privacy: string;
  publishAt: string | null;
  processingStatus: string | null; // processing | succeeded | failed | terminated
  processingProgress: { partsTotal?: number; partsProcessed?: number; timeLeftMs?: number } | null;
  failureReason: string | null;
  rejectionReason: string | null;
  thumbnail: string;
}

export async function videoStatus(workspaceId: string, videoId: string): Promise<VideoStatus> {
  const token = await accessToken(workspaceId);
  const r = await googleApi<{ items?: Record<string, unknown>[] }>(`${DATA}/videos?part=snippet,status,processingDetails&id=${encodeURIComponent(videoId)}`, token);
  const it = r.items?.[0];
  if (!it) throw new Error("YouTube hasn't registered this video yet — try again in a moment.");
  const sn = (it.snippet ?? {}) as { title?: string; thumbnails?: Record<string, { url?: string }> };
  const st = (it.status ?? {}) as Record<string, string>;
  const pd = (it.processingDetails ?? {}) as { processingStatus?: string; processingProgress?: Record<string, string>; processingFailureReason?: string };
  const prog = pd.processingProgress;
  return {
    id: videoId,
    title: sn.title ?? "",
    uploadStatus: st.uploadStatus ?? "",
    privacy: st.privacyStatus ?? "",
    publishAt: st.publishAt ?? null,
    processingStatus: pd.processingStatus ?? null,
    processingProgress: prog ? { partsTotal: Number(prog.partsTotal), partsProcessed: Number(prog.partsProcessed), timeLeftMs: Number(prog.timeLeftMs) } : null,
    failureReason: st.failureReason ?? pd.processingFailureReason ?? null,
    rejectionReason: st.rejectionReason ?? null,
    thumbnail: sn.thumbnails?.medium?.url ?? "",
  };
}
