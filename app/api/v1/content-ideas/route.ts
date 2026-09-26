import { NextResponse } from "next/server";
import { z } from "zod";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller, youtubeSearchBudget } from "@/src/server/ai/guard";
import { backendUnavailable, toErrorResponse, validationError } from "@/src/server/errors";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { parseBody } from "@/src/server/validate";
import { generateContentIdeas } from "@/src/server/content/ideas";

export const maxDuration = 120;

/** GET /api/v1/content-ideas — this workspace's saved idea sets, newest first. */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db`SELECT id, data, created_at FROM content_idea_sets WHERE workspace_id = ${workspaceId} ORDER BY created_at DESC LIMIT 30`;
    return NextResponse.json({ data: (rows as unknown as { id: string; data: Record<string, unknown> }[]).map((r) => ({ ...r.data, id: r.id })) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** Keep a generated set in the workspace; returns its id (null if the database is unavailable). */
async function saveSet(workspaceId: string, userId: string, set: Record<string, unknown>): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db`INSERT INTO content_idea_sets (workspace_id, user_id, niche, data) VALUES (${workspaceId}, ${userId}, ${String(set.niche ?? "").slice(0, 200)}, ${db.json(set as never)}) RETURNING id`;
  return (rows[0] as { id?: string } | undefined)?.id ?? null;
}

const body = z.object({
  niche: z.string().trim().max(120).default(""),
  audience: z.string().trim().max(200).default(""),
  count: z.number().int().min(5).max(20).default(10),
  format: z.enum(["any", "long", "short"]).default("any"),
  useChannel: z.boolean().default(true),
});

/** POST /api/v1/content-ideas — study the connected channel + niche, then write grounded video ideas. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    await youtubeSearchBudget(caller);
    const input = await parseBody(request, body);
    let result;
    try {
      result = await generateContentIdeas({ workspaceId: caller.workspaceId, ...input });
    } catch (error) {
      if (error instanceof Error && /Enter your niche/.test(error.message)) throw validationError(error.message);
      throw error;
    }
    await recordUsage(caller, { kind: "text", provider: "gemini", model: result.model, status: "completed" });
    // Saved to the workspace so the ideas are there on return and on every device.
    const id = await saveSet(caller.workspaceId, caller.user.id, { ...result, audience: input.audience }).catch(() => null);
    return NextResponse.json({ data: { ...result, id } });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed" }).catch(() => undefined);
    return toErrorResponse(providerFailure(error, "Content Creator"));
  }
}
