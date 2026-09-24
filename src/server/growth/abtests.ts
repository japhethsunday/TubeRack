import { randomUUID } from "node:crypto";
import { getDb } from "@/src/server/db";
import { storageGet, storagePut } from "@/src/server/storage";
import { setThumbnail, videoWindowStats } from "@/src/server/google/channel";
import { getConnection, NotConnectedError } from "@/src/server/google/oauth";
import { abOutcome, type AbOutcome, type WindowStat } from "@/src/lib/growth/abtest";
import { notifyWorkspace } from "@/src/server/growth/notify";
import { notFound, validationError } from "@/src/server/errors";

export interface Variant {
  id: string;
  label: string;
  storageKey: string;
  mime: string;
}

export interface Window {
  variantId: string;
  start: string;
  end: string | null;
}

export interface AbTest {
  id: string;
  video_id: string;
  video_title: string;
  status: "draft" | "running" | "completed" | "stopped";
  rotate_hours: number;
  cycles: number;
  variants: Variant[];
  windows: Window[];
  current_index: number;
  next_rotate_at: string | null;
  results: AbOutcome | Record<string, never>;
  ai_scores: Record<string, unknown>;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const COLS = "id, video_id, video_title, status, rotate_hours, cycles, variants, windows, current_index, next_rotate_at, results, ai_scores, error, created_at, updated_at";

function db() {
  const d = getDb();
  if (!d) throw new Error("Database unavailable.");
  return d;
}

export async function listTests(workspaceId: string): Promise<AbTest[]> {
  return (await db().unsafe(`SELECT ${COLS} FROM thumb_tests WHERE workspace_id = $1 ORDER BY created_at DESC`, [workspaceId])) as unknown as AbTest[];
}

export async function getTest(workspaceId: string, id: string): Promise<AbTest> {
  const rows = await db().unsafe(`SELECT ${COLS} FROM thumb_tests WHERE workspace_id = $1 AND id = $2`, [workspaceId, id]);
  if (!rows[0]) throw notFound("A/B test");
  return rows[0] as unknown as AbTest;
}

const MAX_THUMB_BYTES = 2 * 1024 * 1024;

function sniff(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export async function createTest(
  workspaceId: string,
  userId: string,
  input: { videoId: string; videoTitle: string; rotateHours: number; cycles: number; files: { label: string; bytes: Uint8Array }[] },
): Promise<AbTest> {
  if (input.files.length < 2 || input.files.length > 4) throw validationError("Add 2 to 4 thumbnails.");
  const variants: Variant[] = [];
  for (const f of input.files) {
    const mime = sniff(f.bytes);
    if (!mime) throw validationError(`“${f.label}” must be a JPEG or PNG.`);
    if (f.bytes.byteLength > MAX_THUMB_BYTES) throw validationError(`“${f.label}” is over YouTube's 2 MB thumbnail limit.`);
    const id = randomUUID();
    const key = `${workspaceId}/abtests/${id}.${mime === "image/png" ? "png" : "jpg"}`;
    await storagePut(key, f.bytes, mime);
    variants.push({ id, label: f.label.slice(0, 40) || `Variant ${variants.length + 1}`, storageKey: key, mime });
  }
  const rows = await db().unsafe(
    `INSERT INTO thumb_tests (workspace_id, user_id, video_id, video_title, rotate_hours, cycles, variants) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING ${COLS}`,
    [workspaceId, userId, input.videoId, input.videoTitle.slice(0, 200), input.rotateHours, input.cycles, JSON.stringify(variants)],
  );
  return rows[0] as unknown as AbTest;
}

async function apply(workspaceId: string, test: AbTest, index: number): Promise<void> {
  const v = test.variants[index];
  const { bytes, mime } = await storageGet(v.storageKey);
  await setThumbnail(workspaceId, test.video_id, bytes, mime || v.mime);
}

async function save(test: AbTest, patch: Partial<AbTest>): Promise<AbTest> {
  const next = { ...test, ...patch };
  const rows = await db().unsafe(
    `UPDATE thumb_tests SET status=$2, windows=$3::jsonb, current_index=$4, next_rotate_at=$5, results=$6::jsonb, ai_scores=$7::jsonb, error=$8, updated_at=now() WHERE id=$1 RETURNING ${COLS}`,
    [test.id, next.status, JSON.stringify(next.windows), next.current_index, next.next_rotate_at, JSON.stringify(next.results), JSON.stringify(next.ai_scores), next.error],
  );
  return rows[0] as unknown as AbTest;
}

export async function startTest(workspaceId: string, id: string): Promise<AbTest> {
  const test = await getTest(workspaceId, id);
  if (test.status === "running") return test;
  if (!(await getConnection(workspaceId))) throw new NotConnectedError();
  await apply(workspaceId, test, 0);
  const now = new Date();
  return save(test, {
    status: "running",
    current_index: 0,
    windows: [{ variantId: test.variants[0].id, start: now.toISOString(), end: null }],
    next_rotate_at: new Date(now.getTime() + test.rotate_hours * 3_600_000).toISOString(),
    results: {},
    error: null,
  });
}

/** Close the current window and show the next variant, or finish the test. */
export async function rotateTest(workspaceId: string, test: AbTest): Promise<AbTest> {
  const now = new Date().toISOString();
  const windows = test.windows.map((w, i) => (i === test.windows.length - 1 && !w.end ? { ...w, end: now } : w));
  const total = test.variants.length * test.cycles;
  if (windows.length >= total) {
    const results = await computeResults(workspaceId, { ...test, windows });
    if (results.winnerId) {
      const idx = test.variants.findIndex((v) => v.id === results.winnerId);
      if (idx >= 0) await apply(workspaceId, test, idx).catch(() => undefined);
    }
    const winner = test.variants.find((v) => v.id === results.winnerId);
    await notifyWorkspace(workspaceId, {
      type: "abtest.completed",
      title: `Thumbnail test finished: ${test.video_title}`,
      body: winner ? `“${winner.label}” won and is now live. ${results.note}` : results.note,
      metadata: { testId: test.id },
    });
    return save(test, { status: "completed", windows, results, next_rotate_at: null });
  }
  const nextIndex = (test.current_index + 1) % test.variants.length;
  await apply(workspaceId, test, nextIndex);
  windows.push({ variantId: test.variants[nextIndex].id, start: now, end: null });
  return save(test, { windows, current_index: nextIndex, next_rotate_at: new Date(Date.now() + test.rotate_hours * 3_600_000).toISOString(), error: null });
}

export async function stopTest(workspaceId: string, id: string): Promise<AbTest> {
  const test = await getTest(workspaceId, id);
  const now = new Date().toISOString();
  const windows = test.windows.map((w) => (w.end ? w : { ...w, end: now }));
  const results = windows.length ? await computeResults(workspaceId, { ...test, windows }).catch(() => test.results as AbOutcome) : test.results;
  return save(test, { status: "stopped", windows, results, next_rotate_at: null });
}

/** Pull YouTube Analytics for each closed window (data lags ~2-3 days). */
export async function computeResults(workspaceId: string, test: Pick<AbTest, "video_id" | "windows" | "variants">): Promise<AbOutcome> {
  const stats: WindowStat[] = [];
  for (const w of test.windows.filter((x) => x.end)) {
    const days = Math.max(1, Math.round((new Date(w.end!).getTime() - new Date(w.start).getTime()) / 86_400_000));
    const s = await videoWindowStats(workspaceId, test.video_id, w.start, w.end!);
    stats.push({ variantId: w.variantId, days, ...s });
  }
  return abOutcome(stats, test.variants.map((v) => v.id));
}

export async function refreshResults(workspaceId: string, id: string): Promise<AbTest> {
  const test = await getTest(workspaceId, id);
  return save(test, { results: await computeResults(workspaceId, test) });
}

export async function applyVariant(workspaceId: string, id: string, variantId: string): Promise<void> {
  const test = await getTest(workspaceId, id);
  const idx = test.variants.findIndex((v) => v.id === variantId);
  if (idx < 0) throw notFound("Variant");
  await apply(workspaceId, test, idx);
}

export async function deleteTest(workspaceId: string, id: string): Promise<void> {
  await db()`DELETE FROM thumb_tests WHERE workspace_id = ${workspaceId} AND id = ${id} AND status <> 'running'`;
}

/** Cron: rotate every running test whose window is due. */
export async function rotateDueTests(): Promise<{ rotated: number; failed: number }> {
  const due = (await db().unsafe(`SELECT workspace_id, ${COLS} FROM thumb_tests WHERE status = 'running' AND next_rotate_at <= now() + interval '30 minutes'`)) as unknown as (AbTest & { workspace_id: string })[];
  let rotated = 0;
  let failed = 0;
  for (const t of due) {
    try {
      await rotateTest(t.workspace_id, t);
      rotated++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message.slice(0, 300) : "Rotation failed.";
      await db()`UPDATE thumb_tests SET error = ${message}, updated_at = now() WHERE id = ${t.id}`;
    }
  }
  return { rotated, failed };
}
