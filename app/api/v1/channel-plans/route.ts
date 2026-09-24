import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/src/server/db";
import { requireWorkspace } from "@/src/server/workspace";
import { marketProfile } from "@/src/server/market/store";
import { channelUploads, handleTaken, resolveChannel } from "@/src/server/youtube/client";
import { isGeminiConfigured, writeChannelPlan } from "@/src/server/ai/gemini";
import { guardProviderCall, providerFailure, recordUsage, type ProviderCaller } from "@/src/server/ai/guard";
import { CATEGORIES, guessCategory, type CategoryId } from "@/src/lib/market/signals";
import { median } from "@/src/lib/niche/score";
import type { ChannelEvidence, ChannelInputs } from "@/src/lib/channel/plan";
import { backendUnavailable, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 60;

const body = z.object({
  niche: z.string().trim().min(2).max(80),
  query: z.string().trim().max(120).default(""),
  category: z.string().trim().max(40).default(""),
  audience: z.string().trim().max(300).default(""),
  region: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/).default(""),
  contentType: z.enum(["faceless", "on-camera", "mixed", "animation", "screen-recording"]).default("mixed"),
  platform: z.enum(["youtube", "youtube-shorts", "both"]).default("both"),
  style: z.string().trim().max(200).default(""),
  competitors: z.array(z.string().trim().min(3).max(200)).max(3).default([]),
  brandName: z.string().trim().max(60).default(""),
});

const LIST_COLS = "id, niche, region, inputs, plan->'names'->0->>'name' AS lead_name, created_at";

/** GET /api/v1/channel-plans — saved plans for this workspace (newest first). */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace("viewer");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const rows = await db.unsafe(`SELECT ${LIST_COLS} FROM channel_plans WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`, [workspaceId]);
    return NextResponse.json({ data: rows });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/v1/channel-plans — build a channel strategy from live evidence and save it. */
export async function POST(request: Request) {
  let caller: ProviderCaller | null = null;
  try {
    caller = await guardProviderCall();
    const input = await parseBody(request, body);
    if (!isGeminiConfigured()) throw validationError("The Channel Creator isn't available right now.");
    const db = getDb();
    if (!db) throw backendUnavailable("Database");
    const query = input.query || input.niche;
    const category = (input.category in CATEGORIES ? input.category : guessCategory(`${input.niche} ${query}`)) as CategoryId;

    const notes: string[] = [];
    const [marketResult, ...competitorResults] = await Promise.allSettled([
      marketProfile({ name: input.niche, query, region: input.region, category, focus: input.platform === "youtube-shorts" ? "shorts" : "youtube" }),
      ...input.competitors.map(async (c) => {
        const ch = await resolveChannel(c);
        const uploads = ch.uploadsPlaylist ? await channelUploads(ch.uploadsPlaylist, 12).catch(() => []) : [];
        return {
          title: ch.title,
          subscribers: ch.subscribers,
          videos: ch.videos,
          recentTitles: uploads.map((u) => u.title),
          medianViews: uploads.length ? Math.round(median(uploads.map((u) => u.views))) : null,
        };
      }),
    ]);
    const market = marketResult.status === "fulfilled" ? marketResult.value : null;
    if (!market) notes.push(`Market scan unavailable: ${marketResult.status === "rejected" && marketResult.reason instanceof Error ? marketResult.reason.message.slice(0, 160) : "unknown error"}`);
    const competitors = competitorResults.flatMap((r, i) => {
      if (r.status === "fulfilled") return [r.value];
      notes.push(`Competitor "${input.competitors[i]}" could not be loaded.`);
      return [];
    });
    const evidence: ChannelEvidence = {
      market: market && {
        category: market.category.label,
        tier: market.category.tier,
        medianViewsPerDay: market.measures.metrics.medianViewsPerDay,
        sponsoredShare: market.measures.sponsoredShare,
        affiliateShare: market.measures.affiliateShare,
        digitalShare: market.measures.digitalShare,
        shortsViewsPerDay: market.measures.shortsViewsPerDay,
        longViewsPerDay: market.measures.longViewsPerDay,
        medianLongMinutes: market.measures.medianLongMinutes,
        topTitles: market.angles.map((a) => a.title),
        scannedAt: market.scannedAt,
      },
      competitors,
      notes,
    };

    const inputs: ChannelInputs = { niche: input.niche, query, audience: input.audience, region: input.region, contentType: input.contentType, platform: input.platform, style: input.style, competitors: input.competitors, brandName: input.brandName };
    const { plan, model } = await writeChannelPlan(inputs, evidence);

    // Handle availability, checked against YouTube (1 quota unit each).
    plan.handles = await Promise.all(
      plan.handles.map(async (h) => ({ handle: h.handle, available: await handleTaken(h.handle).then((taken) => !taken).catch(() => null) })),
    );

    const rows = await db.unsafe(
      `INSERT INTO channel_plans (workspace_id, user_id, niche, region, inputs, plan, evidence, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, niche, region, inputs, plan, evidence, model, applied, created_at`,
      [caller.workspaceId, caller.user.id, input.niche, input.region, { ...inputs, category } as never, plan as never, evidence as never, model],
    );
    await recordUsage(caller, { kind: "text", provider: "gemini", status: "completed", ref: `channel-plan:${input.niche.slice(0, 60)}` });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    if (caller) await recordUsage(caller, { kind: "text", provider: "gemini", status: "failed", ref: "channel-plan" });
    return toErrorResponse(providerFailure(error, "Channel Creator"));
  }
}
