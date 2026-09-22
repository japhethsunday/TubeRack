import { getDb } from "@/src/server/db";
import { requireUser, type SessionUser } from "@/src/server/auth";
import { requireMembership, authorizeResource } from "@/src/server/authz";
import { forbidden, notFound, backendUnavailable, conflict, validationError, zodToDetails } from "@/src/server/errors";
import {
  SYNC_SCHEMAS,
  toProjectRow,
  toChannelRow,
  toEventRow,
  toScriptRow,
  toBoardRow,
  toAssetRow,
  toCompositionRow,
  toIntelRow,
  toPackagingRow,
  fromProjectRow,
  fromChannelRow,
  fromEventRow,
  fromAssetRow,
  type SyncKind,
} from "@/src/lib/sync-map";

/**
 * Bundle synchronization: validated fan-out into tables (PUT) and assembly
 * back into frontend shapes (GET). Upserts are id-keyed and workspace-scoped:
 * a row owned by another workspace is never touched (409 on collision).
 * Deletes happen only through explicit tombstones.
 */

export async function defaultWorkspace(user: SessionUser): Promise<string> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const owned = await db`
    SELECT w.id FROM workspaces w
    JOIN memberships m ON m.workspace_id = w.id AND m.user_id = ${user.id} AND m.role = 'owner'
    WHERE w.deleted_at IS NULL ORDER BY w.created_at ASC LIMIT 1
  `;
  if (owned.length > 0) return String((owned[0] as { id: string }).id);
  const member = await db`
    SELECT workspace_id AS id FROM memberships WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1
  `;
  if (member.length > 0) return String((member[0] as { id: string }).id);
  const slug = `workspace-${user.id.slice(0, 8)}`;
  const created = await db.begin(async (tx) => {
    const ws = await tx`INSERT INTO workspaces (name, slug, owner_id) VALUES ('My workspace', ${slug}, ${user.id}) RETURNING id`;
    const id = String((ws[0] as { id: string }).id);
    await tx`INSERT INTO memberships (workspace_id, user_id, role) VALUES (${id}, ${user.id}, 'owner')`;
    await tx`INSERT INTO credit_accounts (workspace_id, balance) VALUES (${id}, 0)`;
    return id;
  });
  return created;
}

/** Assert a project belongs to the workspace (multi-tenancy gate for sync). */
async function projectWorkspace(projectId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`SELECT workspace_id FROM projects WHERE id = ${projectId} AND deleted_at IS NULL LIMIT 1`;
  const row = rows[0] as { workspace_id?: string } | undefined;
  return row?.workspace_id ?? null;
}

async function upsertById(
  table: string,
  row: Record<string, unknown>,
  workspaceId: string,
): Promise<"inserted" | "updated"> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const existing = await db.unsafe(`SELECT workspace_id FROM ${table} WHERE id = $1 LIMIT 1`, [String(row.id)] as never[]);
  const found = existing[0] as { workspace_id?: string; project_id?: string; user_id?: string } | undefined;
  if (found) {
    // Ownership check per table shape (user-scoped rows never merge here).
    let owner: string | null | undefined = found.workspace_id;
    if (owner === undefined && found.project_id) {
      owner = await projectWorkspace(found.project_id);
    }
    if (owner !== workspaceId) {
      throw conflict("A record with this id belongs to another workspace.");
    }
    const cols = Object.keys(row).filter((c) => c !== "id");
    const vals = cols.map((c) => {
      const v = row[c];
      return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
    });
    await db.unsafe(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = now() WHERE id = $${cols.length + 1}`,
      [...vals, String(row.id)] as never[],
    );
    return "updated";
  }
  const cols = Object.keys(row);
  const vals = cols.map((c) => {
    const v = row[c];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });
  await db.unsafe(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
    vals as never[],
  );
  return "inserted";
}

export interface SyncResult {
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const empty: SyncResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0 };

function tally(results: ("inserted" | "updated" | "skipped")[]): SyncResult {
  const out = { ...empty };
  for (const r of results) {
    if (r === "inserted") out.inserted += 1;
    else if (r === "updated") out.updated += 1;
    else out.skipped += 1;
  }
  return out;
}

export async function syncPut(kind: SyncKind, user: SessionUser, data: unknown): Promise<SyncResult> {
  const parsed = SYNC_SCHEMAS[kind].safeParse(data);
  if (!parsed.success) {
    throw validationError("Invalid sync payload.", zodToDetails(parsed.error));
  }
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const workspaceId = await defaultWorkspace(user);
  await requireMembership(workspaceId, user, "editor");

  if (kind === "workspace") {
    const body = parsed.data as { projects: unknown[]; channels: unknown[]; events: unknown[]; deletedProjectIds: string[]; deletedChannelIds: string[] };
    const results: ("inserted" | "updated" | "skipped")[] = [];
    for (const c of body.channels) {
      const row = toChannelRow((c ?? {}) as { id: string; name: string; niche?: string }, workspaceId);
      if (!row.id) {
        results.push("skipped");
        continue;
      }
      results.push(await upsertById("channels", row, workspaceId));
    }
    for (const p of body.projects) {
      const doc = (p ?? {}) as { id?: string; channelId?: string };
      if (!doc.id) {
        results.push("skipped");
        continue;
      }
      if (doc.channelId) {
        const ch = await db`SELECT id FROM channels WHERE id = ${String(doc.channelId)} AND workspace_id = ${workspaceId} LIMIT 1`;
        if (ch.length === 0) {
          results.push("skipped");
          continue;
        }
      }
      results.push(await upsertById("projects", toProjectRow(doc as never, workspaceId), workspaceId));
    }
    for (const e of body.events) {
      const doc = (e ?? {}) as { id?: string };
      if (!doc.id) continue;
      const exists = await db`SELECT id FROM project_events WHERE id = ${String(doc.id)} LIMIT 1`;
      if (exists.length > 0) continue;
      const row = toEventRow(doc as never, workspaceId);
      if (row.project_id) {
        const owner = await projectWorkspace(String(row.project_id));
        if (owner !== workspaceId) continue;
      }
      await db.unsafe(
        `INSERT INTO project_events (id, project_id, workspace_id, actor_id, kind, detail) VALUES ($1,$2,$3,$4,$5,$6)`,
        [String(row.id), row.project_id, workspaceId, user.id, row.kind, JSON.stringify(row.detail)] as never[],
      );
      results.push("inserted");
    }
    let deleted = 0;
    for (const id of body.deletedProjectIds) {
      const owner = await projectWorkspace(id);
      if (owner !== workspaceId) continue;
      await db`DELETE FROM projects WHERE id = ${id}`;
      deleted += 1;
    }
    for (const id of body.deletedChannelIds) {
      const ch = await db`SELECT workspace_id FROM channels WHERE id = ${id} LIMIT 1`;
      const owner = (ch[0] as { workspace_id?: string } | undefined)?.workspace_id;
      if (owner !== workspaceId) continue;
      await db`DELETE FROM channels WHERE id = ${id}`;
      deleted += 1;
    }
    const result = tally(results);
    result.deleted = deleted;
    return result;
  }

  if (kind === "scripts") {
    const body = parsed.data as unknown as { projectId: string; script?: unknown; board?: unknown; loops?: unknown[]; deleted?: boolean };
    const owner = await projectWorkspace(body.projectId);
    if (owner !== workspaceId) throw forbiddenSync();
    const result = { ...empty };
    const s = body.script as Record<string, unknown> | undefined;
    if (s) {
      const row = toScriptRow(body.projectId, s as never);
      result.inserted += (await upsertDoc("project_scripts", body.projectId, row)) ? 1 : 0;
    }
    const b = body.board as Record<string, unknown> | undefined;
    if (b) {
      const row = toBoardRow(body.projectId, b as never);
      result.inserted += (await upsertDoc("project_boards", body.projectId, row)) ? 1 : 0;
    }
    if (Array.isArray(body.loops)) {
      await upsertExtra(body.projectId, "loops", body.loops.slice(0, 200));
      result.updated += 1;
    }
    if (body.deleted === true) {
      await db`DELETE FROM project_scripts WHERE project_id = ${body.projectId}`;
      await db`DELETE FROM project_boards WHERE project_id = ${body.projectId}`;
      await db`DELETE FROM project_extras WHERE project_id = ${body.projectId} AND key = 'loops'`;
      result.deleted += 1;
    }
    return result;
  }

  if (kind === "media") {
    const body = parsed.data as { assets: unknown[]; voices: unknown[]; consistency: unknown[]; deletedAssetIds: string[] };
    const result = { ...empty };
    for (const a of body.assets) {
      const row = toAssetRow((a ?? {}) as never, workspaceId);
      if (!row) {
        result.skipped += 1;
        continue;
      }
      if (row.project_id) {
        const owner = await projectWorkspace(String(row.project_id));
        if (owner !== workspaceId) {
          result.skipped += 1;
          continue;
        }
      }
      // Bytes never sync up — uploads use the upload endpoint.
      delete (row as Record<string, unknown>).inline_bytes;
      result[(await upsertById("media_assets", row, workspaceId)) === "inserted" ? "inserted" : "updated"] += 1;
    }
    const voices = Array.isArray(body.voices) ? body.voices.slice(0, 100) : [];
    const consistency = Array.isArray(body.consistency) ? body.consistency.slice(0, 100) : [];
    const byProject = new Map<string, { voices: unknown[]; consistency: unknown }>();
    for (const v of voices) {
      const pid = (v as { projectId?: string })?.projectId;
      if (typeof pid === "string") {
        const entry = byProject.get(pid) ?? { voices: [], consistency: {} };
        (entry.voices as unknown[]).push(v);
        byProject.set(pid, entry);
      }
    }
    for (const c of consistency) {
      const pid = (c as { projectId?: string })?.projectId;
      if (typeof pid === "string") {
        const entry = byProject.get(pid) ?? { voices: [], consistency: {} };
        entry.consistency = c;
        byProject.set(pid, entry);
      }
    }
    for (const [pid, ext] of byProject) {
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      if ((ext.voices as unknown[]).length > 0) await upsertExtra(pid, "voices", ext.voices);
      if (Object.keys(ext.consistency as object).length > 0) await upsertExtra(pid, "consistency", ext.consistency);
      result.updated += 1;
    }
    for (const id of body.deletedAssetIds) {
      const rows = await db`SELECT workspace_id FROM media_assets WHERE id = ${id} LIMIT 1`;
      const owner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
      if (owner !== workspaceId) continue;
      await db`DELETE FROM media_assets WHERE id = ${id}`;
      result.deleted += 1;
    }
    return result;
  }

  if (kind === "video") {
    const body = parsed.data as { compositions: unknown[]; snapshots: unknown[]; requests: unknown[]; deletedRequestIds: string[]; deletedCompositions: string[] };
    const result = { ...empty };
    const snapsByProject = new Map<string, unknown[]>();
    for (const s of body.snapshots) {
      const pid = (s as { data?: { projectId?: unknown } })?.data?.projectId;
      if (typeof pid === "string") {
        const list = snapsByProject.get(pid) ?? [];
        if (list.length < 20) list.push(s);
        snapsByProject.set(pid, list);
      }
    }
    for (const c of body.compositions.slice(0, 200)) {
      const doc = (c ?? {}) as Record<string, unknown>;
      if (typeof doc.projectId !== "string") {
        result.skipped += 1;
        continue;
      }
      const owner = await projectWorkspace(String(doc.projectId));
      if (owner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      const withSnaps = { ...(doc as object), snapshots: snapsByProject.get(String(doc.projectId)) ?? [] };
      result.inserted += (await upsertDoc("project_compositions", String(doc.projectId), toCompositionRow(String(doc.projectId), withSnaps as never))) ? 1 : 0;
    }
    for (const r of body.requests) {
      const doc = (r ?? {}) as Record<string, unknown>;
      if (typeof doc.id !== "string" || typeof doc.projectId !== "string") {
        result.skipped += 1;
        continue;
      }
      const owner = await projectWorkspace(String(doc.projectId));
      if (owner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      const row = {
        id: doc.id,
        project_id: String(doc.projectId),
        workspace_id: workspaceId,
        preset: String(doc.preset ?? "Custom").slice(0, 120),
        settings: (doc.settings ?? {}) as Record<string, unknown>,
        issues: Array.isArray(doc.issues) ? doc.issues.slice(0, 100) : [],
        health: ["ready", "review", "blocked"].includes(String(doc.health)) ? String(doc.health) : "review",
        status: ["draft", "saved", "queued", "cancelled"].includes(String(doc.status)) ? String(doc.status) : "saved",
      };
      result[(await upsertById("render_requests", row, workspaceId)) === "inserted" ? "inserted" : "updated"] += 1;
    }
    for (const id of body.deletedRequestIds) {
      const rows = await db`SELECT workspace_id FROM render_requests WHERE id = ${id} LIMIT 1`;
      const reqOwner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
      if (reqOwner !== workspaceId) continue;
      await db`DELETE FROM render_requests WHERE id = ${id}`;
      result.deleted += 1;
    }
    for (const pid of body.deletedCompositions ?? []) {
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) continue;
      await db`DELETE FROM project_compositions WHERE project_id = ${pid}`;
      await db`DELETE FROM render_requests WHERE project_id = ${pid}`;
      result.deleted += 1;
    }
    return result;
  }

  if (kind === "intel") {
    const body = parsed.data as { dna: Record<string, unknown>; intel: Record<string, unknown>; opportunities: unknown[]; deletedOpportunityIds: string[]; deletedIntel: string[] };
    const result = { ...empty };
    for (const [channelId, dnaDoc] of Object.entries(body.dna ?? {}).slice(0, 100)) {
      if (!dnaDoc || typeof dnaDoc !== "object") {
        result.skipped += 1;
        continue;
      }
      const ch = await db`SELECT workspace_id FROM channels WHERE id = ${channelId} LIMIT 1`;
      const chOwner = (ch[0] as { workspace_id?: string } | undefined)?.workspace_id;
      if (chOwner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      const d = dnaDoc as Record<string, string>;
      const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");
      await db.unsafe(
        `INSERT INTO brand_profiles (channel_id, identity, audience, tone, voice, topics, pillars, formats, visual_identity, use_words, avoid_words, positioning)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (channel_id) DO UPDATE SET identity=EXCLUDED.identity, audience=EXCLUDED.audience, tone=EXCLUDED.tone, voice=EXCLUDED.voice, topics=EXCLUDED.topics, pillars=EXCLUDED.pillars, formats=EXCLUDED.formats, visual_identity=EXCLUDED.visual_identity, use_words=EXCLUDED.use_words, avoid_words=EXCLUDED.avoid_words, positioning=EXCLUDED.positioning, updated_at=now()`,
        [channelId, str(d.identity), str(d.audience), str(d.tone), str(d.voice), str(d.topics), str(d.pillars), str(d.formats), str(d.visualIdentity), str(d.useWords), str(d.avoidWords), str(d.positioning)] as never[],
      );
      result.updated += 1;
    }
    for (const [pid, doc] of Object.entries(body.intel ?? {}).slice(0, 200)) {
      if (!doc || typeof doc !== "object") {
        result.skipped += 1;
        continue;
      }
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      result.inserted += (await upsertDoc("project_intel", pid, toIntelRow(pid, doc as never))) ? 1 : 0;
    }
    for (const o of body.opportunities ?? []) {
      const doc = (o ?? {}) as Record<string, unknown>;
      if (typeof doc.id !== "string" || typeof doc.title !== "string") {
        result.skipped += 1;
        continue;
      }
      const row = {
        id: doc.id,
        workspace_id: workspaceId,
        project_id: typeof doc.projectId === "string" ? doc.projectId : null,
        title: String(doc.title).slice(0, 120),
        topic: String(doc.topic ?? "").slice(0, 2000),
        angle: String(doc.angle ?? "").slice(0, 200),
        audience: String(doc.audience ?? "").slice(0, 500),
        reasoning: String(doc.reasoning ?? "").slice(0, 4000),
        format: String(doc.format ?? "").slice(0, 120),
        hook: String(doc.hook ?? "").slice(0, 1000),
        source_task: String(doc.sourceTask ?? "").slice(0, 120),
        status: ["candidate", "chosen", "dismissed"].includes(String(doc.status)) ? String(doc.status) : "candidate",
      };
      if (row.project_id) {
        const pOwner = await projectWorkspace(String(row.project_id));
        if (pOwner !== workspaceId) {
          result.skipped += 1;
          continue;
        }
      }
      result[(await upsertById("opportunities", row, workspaceId)) === "inserted" ? "inserted" : "updated"] += 1;
    }
    for (const id of body.deletedOpportunityIds) {
      const rows = await db`SELECT workspace_id FROM opportunities WHERE id = ${id} LIMIT 1`;
      const oOwner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
      if (oOwner !== workspaceId) continue;
      await db`DELETE FROM opportunities WHERE id = ${id}`;
      result.deleted += 1;
    }
    for (const pid of (body as { deletedIntel?: string[] }).deletedIntel ?? []) {
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) continue;
      await db`DELETE FROM project_intel WHERE project_id = ${pid}`;
      result.deleted += 1;
    }
    return result;
  }

  if (kind === "packaging") {
    const body = parsed.data as {
      concepts: unknown[];
      variants: unknown[];
      titles: unknown[];
      seo: unknown[];
      packs: unknown[];
      items: unknown[];
      deletedVariantIds: string[];
      deletedTitleIds: string[];
      deletedItemIds: string[];
      deletedProjects: string[];
    };
    const result = { ...empty };
    const byProject = new Map<string, { concepts: unknown[]; variants: unknown[]; titles: unknown[]; seo: unknown; packs: unknown[]; items: unknown[] }>();
    const bucket = (pid: unknown) => {
      if (typeof pid !== "string") return null;
      let entry = byProject.get(pid);
      if (!entry) {
        entry = { concepts: [], variants: [], titles: [], seo: {}, packs: [], items: [] };
        byProject.set(pid, entry);
      }
      return entry;
    };
    // Concepts carry no project id client-side in the export shape; stored rows do.
    // The sync payload uses stored shapes — group everything by projectId when present.
    const withProject = (list: unknown[]): { pid: string; item: unknown }[] =>
      list.flatMap((item) => {
        const pid = (item as { projectId?: unknown })?.projectId;
        return typeof pid === "string" ? [{ pid, item }] : [];
      });
    for (const { pid, item } of withProject(body.concepts)) bucket(pid)?.concepts.push(item);
    for (const { pid, item } of withProject(body.variants)) bucket(pid)?.variants.push(item);
    for (const { pid, item } of withProject(body.titles)) bucket(pid)?.titles.push(item);
    for (const { pid, item } of withProject(body.seo)) {
      const entry = bucket(pid);
      if (entry) entry.seo = item;
    }
    for (const { pid, item } of withProject(body.packs)) bucket(pid)?.packs.push(item);
    for (const { pid, item } of withProject(body.items)) bucket(pid)?.items.push(item);
    for (const [pid, group] of [...byProject.entries()].slice(0, 200)) {
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) {
        result.skipped += 1;
        continue;
      }
      result.inserted += (await upsertDoc("project_packaging", pid, toPackagingRow(pid, group as never))) ? 1 : 0;
    }
    for (const pid of body.deletedProjects ?? []) {
      const owner = await projectWorkspace(pid);
      if (owner !== workspaceId) continue;
      await db`DELETE FROM project_packaging WHERE project_id = ${pid}`;
      result.deleted += 1;
    }
    return result;
  }

  // analytics
  const body = parsed.data as { entries: unknown[]; retention: unknown[]; signals: unknown[]; snapshots: unknown[]; deletedEntryIds: string[]; deletedRetentionIds?: string[]; deletedSignalIds?: string[]; deletedSnapshotIds?: string[] };
  const result = { ...empty };
  for (const e of body.entries) {
    const doc = (e ?? {}) as Record<string, unknown>;
    if (typeof doc.id !== "string" || typeof doc.projectId !== "string") {
      result.skipped += 1;
      continue;
    }
    const pOwner = await projectWorkspace(String(doc.projectId));
    if (pOwner !== workspaceId) {
      result.skipped += 1;
      continue;
    }
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const row = {
      id: doc.id,
      workspace_id: workspaceId,
      project_id: String(doc.projectId),
      platform: String(doc.platform ?? "youtube").slice(0, 60),
      date: typeof doc.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(doc.date) ? doc.date : null,
      views: Math.max(0, Math.floor(Number(doc.views) || 0)),
      watch_hours: num(doc.watchHours),
      likes: num(doc.likes) !== null ? Math.floor(Number(doc.likes)) : null,
      comments: num(doc.comments) !== null ? Math.floor(Number(doc.comments)) : null,
      shares: num(doc.shares) !== null ? Math.floor(Number(doc.shares)) : null,
      subs_gained: num(doc.subsGained) !== null ? Math.floor(Number(doc.subsGained)) : null,
      impressions: num(doc.impressions) !== null ? Math.floor(Number(doc.impressions)) : null,
      ctr: num(doc.ctr),
      avg_view_duration_sec: num(doc.avgViewDurationSec),
      retention_pct: num(doc.retentionPct),
      traffic_source: typeof doc.trafficSource === "string" ? doc.trafficSource.slice(0, 200) : null,
      audience_note: typeof doc.audienceNote === "string" ? doc.audienceNote.slice(0, 2000) : null,
      notes: typeof doc.notes === "string" ? doc.notes.slice(0, 4000) : null,
      provenance: "manual",
    };
    if (!row.date) {
      result.skipped += 1;
      continue;
    }
    result[(await upsertById("perf_entries", row, workspaceId)) === "inserted" ? "inserted" : "updated"] += 1;
  }
  for (const r of body.retention) {
    const doc = (r ?? {}) as Record<string, unknown>;
    if (typeof doc.id !== "string" || typeof doc.projectId !== "string" || typeof doc.label !== "string" || typeof doc.note !== "string") {
      result.skipped += 1;
      continue;
    }
    const pOwner = await projectWorkspace(String(doc.projectId));
    if (pOwner !== workspaceId) {
      result.skipped += 1;
      continue;
    }
    const exists = await db`SELECT id FROM retention_notes WHERE id = ${String(doc.id)} LIMIT 1`;
    if (exists.length === 0) {
      await db`INSERT INTO retention_notes (id, project_id, at_sec, label, note, section_id) VALUES (${String(doc.id)}, ${String(doc.projectId)}, ${typeof doc.atSec === "number" ? doc.atSec : null}, ${String(doc.label).slice(0, 200)}, ${String(doc.note).slice(0, 4000)}, ${typeof doc.sectionId === "string" ? doc.sectionId : null})`;
      result.inserted += 1;
    }
  }
  for (const s of body.signals) {
    const doc = (s ?? {}) as Record<string, unknown>;
    if (typeof doc.id !== "string" || typeof doc.title !== "string") {
      result.skipped += 1;
      continue;
    }
    const row = {
      id: doc.id,
      workspace_id: workspaceId,
      channel_id: null,
      kind: String(doc.kind ?? "pattern").slice(0, 60),
      title: String(doc.title).slice(0, 200),
      evidence: String(doc.evidence ?? "").slice(0, 4000),
      implication: String(doc.implication ?? "").slice(0, 4000),
      status: doc.status === "archived" ? "archived" : "active",
    };
    result[(await upsertById("channel_signals", row, workspaceId)) === "inserted" ? "inserted" : "updated"] += 1;
  }
  for (const s of body.snapshots) {
    const doc = (s ?? {}) as Record<string, unknown>;
    if (typeof doc.id !== "string") {
      result.skipped += 1;
      continue;
    }
    const exists = await db`SELECT id FROM analytics_snapshots WHERE id = ${String(doc.id)} LIMIT 1`;
    if (exists.length > 0) continue;
    await db`INSERT INTO analytics_snapshots (id, workspace_id, name, at, range_days, entry_count, totals) VALUES (${String(doc.id)}, ${workspaceId}, ${String(doc.name ?? "Snapshot").slice(0, 200)}, ${typeof doc.at === "string" ? doc.at : new Date().toISOString()}, ${typeof doc.rangeDays === "number" ? doc.rangeDays : 28}, ${typeof doc.entryCount === "number" ? doc.entryCount : 0}, ${JSON.stringify(doc.totals ?? {})})`;
    result.inserted += 1;
  }
  for (const id of body.deletedEntryIds) {
    const rows = await db`SELECT workspace_id FROM perf_entries WHERE id = ${id} LIMIT 1`;
    const eOwner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (eOwner !== workspaceId) continue;
    await db`DELETE FROM perf_entries WHERE id = ${id}`;
    result.deleted += 1;
  }
  for (const id of body.deletedRetentionIds ?? []) {
    const rows = await db`SELECT r.id FROM retention_notes r JOIN projects p ON p.id = r.project_id WHERE r.id = ${id} AND p.workspace_id = ${workspaceId} LIMIT 1`;
    if (rows.length === 0) continue;
    await db`DELETE FROM retention_notes WHERE id = ${id}`;
    result.deleted += 1;
  }
  for (const id of body.deletedSignalIds ?? []) {
    const rows = await db`SELECT workspace_id FROM channel_signals WHERE id = ${id} LIMIT 1`;
    const sOwner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (sOwner !== workspaceId) continue;
    await db`DELETE FROM channel_signals WHERE id = ${id}`;
    result.deleted += 1;
  }
  for (const id of body.deletedSnapshotIds ?? []) {
    const rows = await db`SELECT workspace_id FROM analytics_snapshots WHERE id = ${id} LIMIT 1`;
    const sOwner = (rows[0] as { workspace_id?: string } | undefined)?.workspace_id;
    if (sOwner !== workspaceId) continue;
    await db`DELETE FROM analytics_snapshots WHERE id = ${id}`;
    result.deleted += 1;
  }
  return result;
}

function forbiddenSync(): never {
  throw forbidden("This project belongs to another workspace.");
}

async function upsertDoc(table: string, projectId: string, row: Record<string, unknown>): Promise<boolean> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const cols = Object.keys(row).filter((c) => c !== "project_id");
  const vals = cols.map((c) => {
    const v = row[c];
    return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
  });
  const existing = await db.unsafe(`SELECT project_id FROM ${table} WHERE project_id = $1 LIMIT 1`, [projectId] as never[]);
  if (existing.length > 0) {
    await db.unsafe(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = now() WHERE project_id = $${cols.length + 1}`,
      [...vals, projectId] as never[],
    );
    return false;
  }
  await db.unsafe(
    `INSERT INTO ${table} (project_id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})`,
    [projectId, ...vals] as never[],
  );
  return true;
}

async function upsertExtra(projectId: string, key: string, data: unknown): Promise<void> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  await db.unsafe(
    `INSERT INTO project_extras (project_id, key, data) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [projectId, key, JSON.stringify(data)] as never[],
  );
}

export async function syncGet(kind: Parameters<typeof syncPut>[0], user: SessionUser): Promise<unknown> {
  const db = getDb();
  if (!db) throw backendUnavailable("Database");
  const workspaceId = await defaultWorkspace(user);
  await requireMembership(workspaceId, user, "viewer");

  if (kind === "workspace") {
    const projects = await db`SELECT id, workspace_id, channel_id, name, content_type, platform, topic, description, goal, stages, current_stage, status, created_at, updated_at FROM projects WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 500`;
    const channels = await db`SELECT id, name, niche, created_at FROM channels WHERE workspace_id = ${workspaceId} AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 100`;
    const events = await db`SELECT id, project_id, kind, detail, created_at FROM project_events WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 1000`;
    return {
      version: 1,
      projects: (projects as unknown as Record<string, unknown>[]).map(fromProjectRow),
      channels: (channels as unknown as Record<string, unknown>[]).map(fromChannelRow),
      events: (events as unknown as Record<string, unknown>[]).map(fromEventRow),
    };
  }
  if (kind === "media") {
    const assets = await db`SELECT id, workspace_id, project_id, scene_ids, kind, source, status, title, payload, mime, duration_sec, width, height, file_size, seed, tags, approval, error, created_at, updated_at FROM media_assets WHERE workspace_id = ${workspaceId} ORDER BY updated_at DESC LIMIT 500`;
    const extras = await db`SELECT project_id, key, data FROM project_extras WHERE key IN ('voices','consistency') AND project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const voices: unknown[] = [];
    const consistency: unknown[] = [];
    for (const row of extras as unknown as { project_id: string; key: string; data: unknown }[]) {
      if (row.key === "voices" && Array.isArray(row.data)) voices.push(...row.data);
      if (row.key === "consistency" && row.data && typeof row.data === "object") consistency.push(row.data);
    }
    return {
      version: 1,
      assets: (assets as unknown as Record<string, unknown>[]).map(fromAssetRow),
      voices,
      consistency,
    };
  }
  if (kind === "analytics") {
    const entries = await db`SELECT * FROM perf_entries WHERE workspace_id = ${workspaceId} ORDER BY date DESC LIMIT 1000`;
    const retention = await db`SELECT r.* FROM retention_notes r JOIN projects p ON p.id = r.project_id WHERE p.workspace_id = ${workspaceId} ORDER BY r.created_at DESC LIMIT 500`;
    const signals = await db`SELECT * FROM channel_signals WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 200`;
    const snapshots = await db`SELECT * FROM analytics_snapshots WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 50`;
    const camel = (row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), v]),
      );
    return {
      version: 1,
      entries: (entries as unknown as Record<string, unknown>[]).map(camel),
      retention: (retention as unknown as Record<string, unknown>[]).map(camel),
      signals: (signals as unknown as Record<string, unknown>[]).map(camel),
      snapshots: (snapshots as unknown as Record<string, unknown>[]).map(camel),
    };
  }
  if (kind === "intel") {
    const dnaRows = await db`SELECT channel_id, identity, audience, tone, voice, topics, pillars, formats, visual_identity, use_words, avoid_words, positioning, updated_at FROM brand_profiles WHERE channel_id IN (SELECT id FROM channels WHERE workspace_id = ${workspaceId})`;
    const dna: Record<string, unknown> = {};
    for (const r of dnaRows as unknown as Record<string, unknown>[]) {
      dna[String(r.channel_id)] = {
        channelId: r.channel_id,
        identity: r.identity,
        audience: r.audience,
        tone: r.tone,
        voice: r.voice,
        topics: r.topics,
        pillars: r.pillars,
        formats: r.formats,
        visualIdentity: r.visual_identity,
        useWords: r.use_words,
        avoidWords: r.avoid_words,
        positioning: r.positioning,
        updatedAt: r.updated_at,
      };
    }
    const opps = await db`SELECT id, project_id, title, topic, angle, audience, reasoning, format, hook, source_task, status, created_at FROM opportunities WHERE workspace_id = ${workspaceId} ORDER BY updated_at DESC LIMIT 200`;
    const camelOpp = (row: Record<string, unknown>) => ({
      id: row.id,
      projectId: row.project_id ?? undefined,
      title: row.title,
      topic: row.topic,
      angle: row.angle,
      audience: row.audience,
      reasoning: row.reasoning,
      format: row.format,
      hook: row.hook,
      sourceTask: row.source_task,
      status: row.status,
      createdAt: row.created_at,
    });
    const intelRows = await db`SELECT project_id, audience, strategy, titles, hooks, retention, brief, history, updated_at FROM project_intel WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const intel: Record<string, unknown> = {};
    for (const r of intelRows as unknown as Record<string, unknown>[]) {
      intel[String(r.project_id)] = {
        projectId: r.project_id,
        audience: r.audience,
        strategy: r.strategy,
        titles: r.titles,
        hooks: r.hooks,
        retention: r.retention,
        brief: r.brief,
        history: r.history,
        updatedAt: r.updated_at,
      };
    }
    return {
      version: 1,
      dna,
      intel,
      opportunities: (opps as unknown as Record<string, unknown>[]).map(camelOpp),
    };
  }
  if (kind === "scripts") {
    const scripts = await db`SELECT project_id, format, tone, complexity, structure, target_words, wpm, instruction, sections, versions, notes, updated_at FROM project_scripts WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const boards = await db`SELECT project_id, scenes, updated_at FROM project_boards WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const extras = await db`SELECT project_id, data FROM project_extras WHERE key = 'loops' AND project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const scriptsMap: Record<string, unknown> = {};
    for (const s of scripts as unknown as Record<string, unknown>[]) {
      scriptsMap[String(s.project_id)] = {
        projectId: s.project_id, format: s.format, tone: s.tone, complexity: s.complexity,
        structure: s.structure, targetWords: s.target_words, wpm: s.wpm, instruction: s.instruction,
        sections: s.sections, versions: s.versions, notes: s.notes, updatedAt: s.updated_at,
      };
    }
    const boardsMap: Record<string, unknown> = {};
    for (const b of boards as unknown as Record<string, unknown>[]) {
      boardsMap[String(b.project_id)] = { projectId: b.project_id, scenes: b.scenes, updatedAt: b.updated_at };
    }
    const loopsMap: Record<string, unknown> = {};
    for (const e of extras as unknown as { project_id: string; data: unknown }[]) {
      loopsMap[e.project_id] = Array.isArray(e.data) ? e.data : [];
    }
    return { version: 1, scripts: scriptsMap, boards: boardsMap, loops: loopsMap };
  }
  if (kind === "video") {
    const comps = await db`SELECT project_id, tracks, clips, canvas, snapshots, updated_at FROM project_compositions WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
    const requests = await db`SELECT id, project_id, preset, settings, issues, health, status, created_at FROM render_requests WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 200`;
    const camelReq = (row: Record<string, unknown>) => ({
      id: row.id, projectId: row.project_id, preset: row.preset, settings: row.settings,
      issues: row.issues, health: row.health, status: row.status, createdAt: row.created_at,
    });
    const snapshots: unknown[] = [];
    const compositions = (comps as unknown as Record<string, unknown>[]).map((c) => {
      if (Array.isArray(c.snapshots)) snapshots.push(...c.snapshots);
      return {
        projectId: c.project_id, tracks: c.tracks, clips: c.clips, canvas: c.canvas, updatedAt: c.updated_at,
      };
    });
    return {
      version: 1,
      compositions,
      snapshots,
      requests: (requests as unknown as Record<string, unknown>[]).map(camelReq),
    };
  }
  // packaging
  const packRows = await db`SELECT project_id, concepts, variants, titles, seo, packs, items, updated_at FROM project_packaging WHERE project_id IN (SELECT id FROM projects WHERE workspace_id = ${workspaceId})`;
  const withProject = (list: unknown, pid: string) =>
    Array.isArray(list) ? list.map((item) => ({ ...(item as object), projectId: pid })) : [];
  const concepts: unknown[] = [];
  const variants: unknown[] = [];
  const titles: unknown[] = [];
  const seo: unknown[] = [];
  const packs: unknown[] = [];
  const items: unknown[] = [];
  for (const r of packRows as unknown as Record<string, unknown>[]) {
    const pid = String(r.project_id);
    concepts.push(...withProject(r.concepts, pid));
    variants.push(...withProject(r.variants, pid));
    titles.push(...withProject(r.titles, pid));
    if (r.seo && typeof r.seo === "object") seo.push({ ...(r.seo as object), projectId: pid });
    packs.push(...withProject(r.packs, pid));
    items.push(...withProject(r.items, pid));
  }
  return { version: 1, concepts, variants, titles, seo, packs, items };
}
