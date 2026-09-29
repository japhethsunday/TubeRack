import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { PROMO_FEATURES, PROMO_PLATFORMS, PROMO_STYLES, writePromo } from "@/src/server/growth/promo";
import { audit } from "@/src/server/audit";
import { toErrorResponse } from "@/src/server/errors";
import { parseBody } from "@/src/server/validate";

export const maxDuration = 120;

/** GET /api/v1/admin/promo — saved promo videos + the options to make one. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "promo.list");
    const rows = await adminDb()`SELECT id, feature, style, platform, length_sec, package, project_id, source, status, youtube_video_id, last_error, created_at FROM promo_videos ORDER BY created_at DESC LIMIT 50`;
    return NextResponse.json({
      data: {
        options: { features: PROMO_FEATURES, styles: PROMO_STYLES, platforms: PROMO_PLATFORMS },
        promos: rows.map((r) => ({
          id: String(r.id), feature: String(r.feature), style: String(r.style), platform: String(r.platform), lengthSec: Number(r.length_sec),
          pkg: r.package, projectId: r.project_id ? String(r.project_id) : null, auto: r.source === "autopilot", status: String(r.status), youtubeUrl: r.youtube_video_id ? `https://youtu.be/${String(r.youtube_video_id)}` : null, lastError: String(r.last_error ?? ""), createdAt: new Date(String(r.created_at)).toISOString(),
        })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}

const body = z.object({
  feature: z.enum(PROMO_FEATURES.map((f) => f.id) as [string, ...string[]]),
  style: z.enum(PROMO_STYLES),
  platform: z.enum(PROMO_PLATFORMS),
  lengthSec: z.number().int().min(10).max(90),
  angle: z.string().trim().max(600).default(""),
});

/** POST /api/v1/admin/promo — write a new promo package with AI and save it. */
export async function POST(request: Request) {
  try {
    const input = await parseBody(request, body);
    const admin = await requireAdmin(request, "promo.write");
    const pkg = await writePromo(input);
    const [r] = await adminDb()`
      INSERT INTO promo_videos (created_by, feature, style, platform, length_sec, package)
      VALUES (${admin.id}, ${input.feature}, ${input.style}, ${input.platform}, ${input.lengthSec}, ${JSON.stringify(pkg)}) RETURNING id, created_at`;
    await audit({ userId: admin.id, action: "admin.promo.written", resourceType: "promo_video", resourceId: String(r.id) });
    return NextResponse.json({ data: { id: String(r.id), ...input, pkg, projectId: null, createdAt: new Date(String(r.created_at)).toISOString() } }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
