import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { EMPTY_CONTENT, assertReady, campaignStats, isAudience, renderCampaign, runCampaign, sendTest, writeCampaign, type CampaignContent } from "@/src/server/growth/campaigns";
import { audit } from "@/src/server/audit";
import { notFound, toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody, parseId } from "@/src/server/validate";

export const maxDuration = 300;

async function load(id: string) {
  const [c] = await adminDb()`SELECT * FROM campaigns WHERE id = ${id}`;
  if (!c) throw notFound("Campaign");
  return {
    id: String(c.id),
    name: String(c.name),
    subject: String(c.subject),
    audience: String(c.audience),
    status: String(c.status),
    content: { ...EMPTY_CONTENT, ...(c.content as object) } as CampaignContent,
    scheduledAt: c.scheduled_at ? new Date(String(c.scheduled_at)).toISOString() : null,
    sentAt: c.sent_at ? new Date(String(c.sent_at)).toISOString() : null,
  };
}

/** GET /api/v1/admin/campaigns/:id — the campaign, its results and a rendered preview. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request, "campaigns.view");
    const c = await load(parseId((await ctx.params).id, "campaign"));
    const preview = renderCampaign(c, { email: admin.email, name: admin.name }, null);
    return NextResponse.json({ data: { ...c, stats: await campaignStats(c.id), previewHtml: preview.html } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const str = (n: number) => z.string().max(n).default("");
const contentSchema = z.object({
  preheader: str(160), heading: str(120), body: str(6000), ctaLabel: str(40), ctaUrl: str(500),
  videoUrl: str(500), videoThumb: str(500), videoTitle: str(160),
});
const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().max(120).optional(),
  audience: z.string().optional(),
  content: contentSchema.optional(),
});

const httpsOrPath = (v: string) => !v || v.startsWith("/") || /^https:\/\/[^\s]+$/i.test(v);

/** PATCH /api/v1/admin/campaigns/:id — edit a draft or scheduled campaign. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, patchSchema);
    const admin = await requireAdmin(request, "campaigns.edit");
    const c = await load(parseId((await ctx.params).id, "campaign"));
    if (c.status === "sending" || c.status === "sent") throw validationError("This campaign has already been sent.");
    if (input.audience !== undefined && !isAudience(input.audience)) throw validationError("Unknown audience.");
    if (input.content) {
      for (const k of ["ctaUrl", "videoUrl", "videoThumb"] as const) {
        if (!httpsOrPath(input.content[k])) throw validationError("Links must start with / or https://.");
      }
    }
    await adminDb()`
      UPDATE campaigns SET
        name = ${input.name ?? c.name},
        subject = ${input.subject ?? c.subject},
        audience = ${input.audience ?? c.audience},
        content = ${JSON.stringify(input.content ?? c.content)},
        updated_at = now()
      WHERE id = ${c.id}`;
    await audit({ userId: admin.id, action: "admin.campaign.edited", resourceType: "campaign", resourceId: c.id });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const actionSchema = z.object({
  action: z.enum(["write", "test", "send", "schedule", "unschedule"]),
  brief: z.string().trim().max(1200).default(""),
  at: z.string().datetime().optional(),
});

/** POST /api/v1/admin/campaigns/:id — write with AI, test, send now, schedule. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const input = await parseBody(request, actionSchema);
    const admin = await requireAdmin(request, `campaigns.${input.action}`);
    const c = await load(parseId((await ctx.params).id, "campaign"));
    const db = adminDb();
    switch (input.action) {
      case "write": {
        if (input.brief.length < 3) throw validationError("Say what the email should be about.");
        if (!isAudience(c.audience)) throw validationError("Unknown audience.");
        const draft = await writeCampaign(input.brief, c.audience);
        const { subject, ...content } = draft;
        return NextResponse.json({ data: { subject, content: { ...content, videoUrl: c.content.videoUrl, videoThumb: c.content.videoThumb, videoTitle: c.content.videoTitle } } });
      }
      case "test": {
        const res = await sendTest(c.id, admin.email, admin.name);
        if (!res.sent) throw validationError(res.reason);
        return NextResponse.json({ data: { sent: true, to: admin.email } });
      }
      case "send": {
        assertReady(c);
        await audit({ userId: admin.id, action: "admin.campaign.send", resourceType: "campaign", resourceId: c.id });
        const result = await runCampaign(c.id, 240_000);
        return NextResponse.json({ data: result });
      }
      case "schedule": {
        assertReady(c);
        if (!input.at || new Date(input.at).getTime() < Date.now() + 60_000) throw validationError("Pick a time in the future.");
        await db`UPDATE campaigns SET status = 'scheduled', scheduled_at = ${input.at}, updated_at = now() WHERE id = ${c.id} AND status IN ('draft', 'scheduled')`;
        await audit({ userId: admin.id, action: "admin.campaign.scheduled", resourceType: "campaign", resourceId: c.id, metadata: { at: input.at } });
        return NextResponse.json({ data: { ok: true } });
      }
      case "unschedule":
        await db`UPDATE campaigns SET status = 'draft', scheduled_at = null, updated_at = now() WHERE id = ${c.id} AND status = 'scheduled'`;
        return NextResponse.json({ data: { ok: true } });
    }
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** DELETE /api/v1/admin/campaigns/:id — remove a draft (sent campaigns stay for the record). */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin(request, "campaigns.delete");
    const c = await load(parseId((await ctx.params).id, "campaign"));
    if (c.status === "sending" || c.status === "sent") throw validationError("Sent campaigns are kept for your records.");
    await adminDb()`DELETE FROM campaigns WHERE id = ${c.id}`;
    await audit({ userId: admin.id, action: "admin.campaign.deleted", resourceType: "campaign", resourceId: c.id });
    return NextResponse.json({ data: { deleted: true } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
