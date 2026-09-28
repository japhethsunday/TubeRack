import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { AUDIENCES, EMPTY_CONTENT, audienceCounts, campaignStats, isAudience } from "@/src/server/growth/campaigns";
import { audit } from "@/src/server/audit";
import { toErrorResponse, validationError } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

/** GET /api/v1/admin/campaigns — campaigns with results, plus audience sizes. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "campaigns.list");
    const rows = await adminDb()`SELECT id, name, subject, audience, status, scheduled_at, sent_at, created_at, updated_at FROM campaigns ORDER BY created_at DESC LIMIT 100`;
    const campaigns = [];
    for (const r of rows) {
      campaigns.push({
        id: String(r.id),
        name: String(r.name),
        subject: String(r.subject),
        audience: String(r.audience),
        status: String(r.status),
        scheduledAt: r.scheduled_at ? new Date(String(r.scheduled_at)).toISOString() : null,
        sentAt: r.sent_at ? new Date(String(r.sent_at)).toISOString() : null,
        createdAt: new Date(String(r.created_at)).toISOString(),
        stats: await campaignStats(String(r.id)),
      });
    }
    return NextResponse.json({ data: { campaigns, audiences: AUDIENCES, counts: await audienceCounts() } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({ name: z.string().trim().min(1, "Name the campaign.").max(120), audience: z.string().default("opted_in") });

/** POST /api/v1/admin/campaigns — new draft. */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    const admin = await requireAdmin(request, "campaigns.create");
    if (!isAudience(input.audience)) throw validationError("Unknown audience.");
    const [c] = await adminDb()`
      INSERT INTO campaigns (name, audience, content, created_by) VALUES (${input.name}, ${input.audience}, ${JSON.stringify(EMPTY_CONTENT)}, ${admin.id}) RETURNING id`;
    await audit({ userId: admin.id, action: "admin.campaign.created", resourceType: "campaign", resourceId: String(c.id) });
    return NextResponse.json({ data: { id: String(c.id) } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
