import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireUser } from "@/src/server/auth";
import { authorizeResource } from "@/src/server/authz";
import { toErrorResponse, backendUnavailable, notFound } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";
import { limiterFor, callerKey } from "@/src/server/rate-limit";
import { rateLimited } from "@/src/server/errors";
import { audit } from "@/src/server/audit";

const brandSchema = z.object({
  identity: z.string().trim().max(200).default(""),
  audience: z.string().trim().max(500).default(""),
  tone: z.string().trim().max(200).default(""),
  voice: z.string().trim().max(200).default(""),
  topics: z.string().trim().max(500).default(""),
  pillars: z.string().trim().max(500).default(""),
  formats: z.string().trim().max(300).default(""),
  visual_identity: z.string().trim().max(500).default(""),
  use_words: z.string().trim().max(300).default(""),
  avoid_words: z.string().trim().max(300).default(""),
  positioning: z.string().trim().max(500).default(""),
});

const COLS = "id, channel_id, identity, audience, tone, voice, topics, pillars, formats, visual_identity, use_words, avoid_words, positioning, updated_at";

function channelIdFrom(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const idx = parts.indexOf("channels");
  return parseId(parts[idx + 1] ?? "", "channel");
}

/** GET /api/v1/channels/[id]/brand — channel DNA (empty defaults when unset). */
export async function GET(request: Request) {
  try {
    const limit = limiterFor("read").take(`read:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const channelId = channelIdFrom(request);
    await authorizeResource("channels", channelId, user, "viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(`SELECT ${COLS} FROM brand_profiles WHERE channel_id = $1 LIMIT 1`, [channelId] as never[]);
    return NextResponse.json({ data: rows[0] ?? null });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** PUT /api/v1/channels/[id]/brand — upsert DNA (editor+). */
export async function PUT(request: Request) {
  try {
    const limit = limiterFor("write").take(`write:${callerKey(request)}`);
    if (limit.allowed === false) throw rateLimited(limit.retryAfterSec);
    const user = await requireUser();
    const channelId = channelIdFrom(request);
    const auth = await authorizeResource("channels", channelId, user, "editor");
    const body = await parseBody(request, brandSchema);
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const values = [channelId, body.identity, body.audience, body.tone, body.voice, body.topics, body.pillars, body.formats, body.visual_identity, body.use_words, body.avoid_words, body.positioning];
    const rows = await db.unsafe(
      `INSERT INTO brand_profiles (channel_id, identity, audience, tone, voice, topics, pillars, formats, visual_identity, use_words, avoid_words, positioning)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (channel_id) DO UPDATE SET
         identity = EXCLUDED.identity, audience = EXCLUDED.audience, tone = EXCLUDED.tone,
         voice = EXCLUDED.voice, topics = EXCLUDED.topics, pillars = EXCLUDED.pillars,
         formats = EXCLUDED.formats, visual_identity = EXCLUDED.visual_identity,
         use_words = EXCLUDED.use_words, avoid_words = EXCLUDED.avoid_words,
         positioning = EXCLUDED.positioning, updated_at = now()
       RETURNING ${COLS}`,
      values as never[],
    );
    if (rows.length === 0) throw notFound("Channel");
    await audit({ workspaceId: auth.workspaceId, userId: user.id, action: "brand.updated", resourceType: "brand_profiles", resourceId: channelId });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    return toErrorResponse(error);
  }
}
