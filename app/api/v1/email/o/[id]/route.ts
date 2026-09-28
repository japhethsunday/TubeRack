import { getDb } from "@/src/server/db";

// 1×1 transparent GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** GET /api/v1/email/o/:id — campaign open pixel (records the first open; always returns the image). */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = (await ctx.params).id;
  if (/^[0-9a-f-]{36}$/.test(id)) {
    const db = getDb();
    if (db) await db`UPDATE campaign_sends SET opened_at = coalesce(opened_at, now()) WHERE id = ${id}`.catch(() => undefined);
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
