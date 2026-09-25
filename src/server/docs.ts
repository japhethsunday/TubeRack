import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, validationError, notFound } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

/**
 * Per-project singleton documents (scripts, boards, compositions, intel,
 * packaging). Whole-document GET/PUT with shape validation + size caps.
 * Tables are internal constants — never client-controlled.
 */

const DOC_TABLES = {
  scripts: { table: "project_scripts", audit: "script.saved" },
  boards: { table: "project_boards", audit: "board.saved" },
  compositions: { table: "project_compositions", audit: "composition.saved" },
  intel: { table: "project_intel", audit: "intel.saved" },
  packaging: { table: "project_packaging", audit: "packaging.saved" },
} as const;

export type DocKind = keyof typeof DOC_TABLES;

const MAX_DOC_BYTES = 5 * 1024 * 1024;

const docSchemas: Record<DocKind, z.ZodType<Record<string, unknown>>> = {
  scripts: z.object({
    format: z.string().max(120).optional(),
    tone: z.string().max(120).optional(),
    complexity: z.string().max(60).optional(),
    structure: z.string().max(60).optional(),
    target_words: z.number().int().min(0).max(100000).optional(),
    wpm: z.number().int().min(60).max(300).optional(),
    instruction: z.string().max(8000).optional(),
    sections: z.array(z.unknown()).max(500).optional(),
    versions: z.array(z.unknown()).max(50).optional(),
    notes: z.string().max(20000).optional(),
  }) as never,
  boards: z.object({ scenes: z.array(z.unknown()).max(500) }) as never,
  compositions: z.object({
    tracks: z.array(z.unknown()).max(50).optional(),
    clips: z.array(z.unknown()).max(2000).optional(),
    canvas: z.record(z.string(), z.unknown()).optional(),
    snapshots: z.array(z.unknown()).max(20).optional(),
  }) as never,
  intel: z.object({
    audience: z.unknown().optional(),
    strategy: z.unknown().optional(),
    titles: z.array(z.unknown()).max(200).optional(),
    hooks: z.array(z.unknown()).max(200).optional(),
    retention: z.array(z.unknown()).max(100).optional(),
    brief: z.string().max(100000).optional(),
    voices: z.array(z.unknown()).max(50).optional(),
    consistency: z.unknown().optional(),
    history: z.array(z.unknown()).max(100).optional(),
  }) as never,
  packaging: z.object({
    concepts: z.array(z.unknown()).max(50).optional(),
    variants: z.array(z.unknown()).max(100).optional(),
    titles: z.array(z.unknown()).max(100).optional(),
    seo: z.unknown().optional(),
    packs: z.array(z.unknown()).max(20).optional(),
    items: z.array(z.unknown()).max(300).optional(),
  }) as never,
};

function projectIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  return parseId(parts[parts.indexOf("projects") + 1] ?? "", "project");
}

export function docHandlers(kind: DocKind) {
  const { table, audit: auditAction } = DOC_TABLES[kind];

  async function GET(request: Request) {
    try {
      const limit = limiterFor("read").take(`read:${callerKey(request)}`);
      if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
      const user = await requireUser();
      const projectId = projectIdFrom(request);
      await authorizeResource("projects", projectId, user, "viewer");
      const db = getDb();
      if (!db) throw backendUnavailable("Database");
      const rows = await db.unsafe(`SELECT * FROM ${table} WHERE project_id = $1 LIMIT 1`, [projectId] as never[]);
      return NextResponse.json({ data: (rows[0] as Record<string, unknown> | undefined) ?? null });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  async function PUT(request: Request) {
    try {
      const limit = limiterFor("write").take(`write:${callerKey(request)}`);
      if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
      const user = await requireUser();
      const projectId = projectIdFrom(request);
      const auth = await authorizeResource("projects", projectId, user, "editor");
      const body = await parseBody(request, docSchemas[kind] as never) as Record<string, unknown>;
      const raw = JSON.stringify(body);
      if (raw.length > MAX_DOC_BYTES) throw validationError("Document exceeds the 5 MB limit.");
      const db = getDb();
      if (!db) throw backendUnavailable("Database");
      // Upsert only known columns: project_id + payload keys present in body.
      const keys = Object.keys(body);
      if (keys.length === 0) throw validationError("Nothing to save.");
      const cols = keys.map((k) => k.replace(/[^a-z_]/g, "")).filter(Boolean);
      if (cols.length === 0) throw validationError("No valid fields.");
      const vals = cols.map((c) => {
        const v = (body as Record<string, unknown>)[c];
        return typeof v === "object" && v !== null ? JSON.stringify(v) : v;
      });
      const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
      const rows = await db.unsafe(
        `INSERT INTO ${table} (project_id, ${cols.join(", ")}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")})
         ON CONFLICT (project_id) DO UPDATE SET ${sets}, updated_at = now()
         RETURNING *`,
        [projectId, ...vals] as never[],
      );
      if (rows.length === 0) throw notFound("Project");
      await audit({ workspaceId: auth.workspaceId, userId: user.id, action: auditAction, resourceType: table, resourceId: projectId });
      return NextResponse.json({ data: rows[0] });
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return { GET, PUT };
}
