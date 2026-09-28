import { getDb } from "@/src/server/db";
import { storageDeleteMany, storageList, storageListAll } from "@/src/server/storage";

/**
 * Storage cleaner. Deletes stored files (generated output and uploads) that
 * nothing in the app refers to any more — clips removed from projects,
 * leftovers from regenerated videos, deleted assets — once they are older
 * than the grace period. Anything still referenced anywhere is never touched.
 */

/** Default wait before an unused file may go (the daily run). The admin can choose 3–30 days. */
export const GRACE_DAYS = 14;
const MAX_DELETE_PER_RUN = 1000;

/** Stored file names ("<uuid>-output.mp4", "<uuid>.mp4", "<uuid>.mp4.part0"). */
const FILE_RE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-output)?\\.[a-z0-9]{2,5}";

/**
 * Every stored file name mentioned anywhere in the database — every table,
 * every row. File names are unique ids, so one global set is exact, and a
 * file referenced by anything at all is kept.
 */
async function referencedFiles(): Promise<Set<string>> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const tables = await db`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  const refs = new Set<string>();
  for (const { table_name } of tables) {
    const t = String(table_name).replace(/"/g, "");
    // A table we can't read makes the run unsafe: stop rather than delete.
    const rows = await db.unsafe(`SELECT DISTINCT (regexp_matches(x::text, '${FILE_RE}', 'g'))[1] AS f FROM public."${t}" x`);
    for (const r of rows) refs.add(String(r.f));
  }
  return refs;
}

export interface CleanReport { workspaces: number; scanned: number; unused: number; freedMb: number; deleted: number; deletedAccounts: number; dryRun: boolean }

export async function cleanStorage(opts: { dryRun: boolean; graceDays?: number }): Promise<CleanReport> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");
  const grace = Math.min(30, Math.max(3, Math.round(opts.graceDays ?? GRACE_DAYS)));
  const cutoff = Date.now() - grace * 86_400_000;
  const workspaces = (await db`SELECT id FROM workspaces`).map((r) => String(r.id));
  const report: CleanReport = { workspaces: workspaces.length, scanned: 0, unused: 0, freedMb: 0, deleted: 0, deletedAccounts: 0, dryRun: opts.dryRun };
  let budget = MAX_DELETE_PER_RUN;
  const refs = await referencedFiles();
  for (const ws of workspaces) {
    const stale: { key: string; size: number }[] = [];
    for (const folder of ["generated", "uploads"]) {
      for (const obj of await storageList(`${ws}/${folder}/`)) {
        report.scanned++;
        const base = obj.name.replace(/\.part\d+$/, ""); // parts belong to their parent upload
        if (refs.has(base) || refs.has(obj.name)) continue;
        const created = Date.parse(obj.createdAt);
        if (!Number.isFinite(created) || created > cutoff) continue; // too new (or unknown): keep
        stale.push({ key: `${ws}/${folder}/${obj.name}`, size: obj.size });
      }
    }
    report.unused += stale.length;
    report.freedMb += stale.reduce((n, s) => n + s.size, 0) / 1024 / 1024;
    if (!opts.dryRun && stale.length && budget > 0) {
      const batch = stale.slice(0, budget);
      for (let i = 0; i < batch.length; i += 100) await storageDeleteMany(batch.slice(i, i + 100).map((s) => s.key));
      report.deleted += batch.length;
      budget -= batch.length;
    }
  }
  // Folders of workspaces that no longer exist (deleted accounts): everything inside is unreachable.
  const live = new Set(workspaces);
  const collect = async (prefix: string, depth: number, into: { key: string; size: number }[]) => {
    const { files, folders } = await storageListAll(prefix);
    for (const f of files) into.push({ key: `${prefix}${f.name}`, size: f.size });
    if (depth < 3) for (const d of folders) await collect(`${prefix}${d}/`, depth + 1, into);
  };
  for (const top of (await storageListAll("")).folders) {
    if (live.has(top) || !/^[0-9a-f-]{36}$/i.test(top)) continue;
    const gone: { key: string; size: number }[] = [];
    await collect(`${top}/`, 1, gone);
    if (!gone.length) continue;
    report.deletedAccounts++;
    report.scanned += gone.length;
    report.unused += gone.length;
    report.freedMb += gone.reduce((n, s) => n + s.size, 0) / 1024 / 1024;
    if (!opts.dryRun && budget > 0) {
      const batch = gone.slice(0, budget);
      for (let i = 0; i < batch.length; i += 100) await storageDeleteMany(batch.slice(i, i + 100).map((s) => s.key));
      report.deleted += batch.length;
      budget -= batch.length;
    }
  }
  report.freedMb = Math.round(report.freedMb * 10) / 10;
  return report;
}

/** Whether a stored generated file (payload "/api/v1/generated/<file>") still exists in this workspace. */
export async function storedFileExists(workspaceId: string, payload: string): Promise<boolean> {
  const file = /^\/api\/v1\/generated\/([^/?]+)$/.exec(payload)?.[1];
  if (!file) return false;
  try {
    return (await storageListAll(`${workspaceId}/generated/`, file)).files.some((o) => o.name === file);
  } catch {
    return false;
  }
}
