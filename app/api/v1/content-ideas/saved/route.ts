import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { backendUnavailable, toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

const body = z.object({
  sets: z
    .array(
      z.object({ generatedAt: z.string().max(40), niche: z.string().max(200).default(""), ideas: z.array(z.unknown()).max(40) }).passthrough(),
    )
    .max(20),
});

/**
 * POST /api/v1/content-ideas/saved — move idea sets that were only kept in
 * this browser into the workspace (skips any already saved).
 */
export async function POST(request: Request) {
  try {
    const { workspaceId, user } = await requireWorkspace("editor");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const { sets } = await parseBody(request, body);
    let added = 0;
    for (const set of sets) {
      if (JSON.stringify(set).length > 200_000) continue;
      const exists = await db`SELECT 1 FROM content_idea_sets WHERE workspace_id = ${workspaceId} AND data->>'generatedAt' = ${set.generatedAt} LIMIT 1`;
      if (exists.length) continue;
      await db`INSERT INTO content_idea_sets (workspace_id, user_id, niche, data, created_at) VALUES (${workspaceId}, ${user.id}, ${set.niche.slice(0, 200)}, ${db.json(set as never)}, ${Number.isNaN(Date.parse(set.generatedAt)) ? new Date().toISOString() : set.generatedAt})`;
      added += 1;
    }
    return NextResponse.json({ data: { added } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
