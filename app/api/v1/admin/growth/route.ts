import { NextResponse } from "next/server";
import { adminDb, requireAdmin } from "@/src/server/admin";
import { toErrorResponse } from "@/src/server/errors";

/** GET /api/v1/admin/growth — where sign-ups come from, referrals, opt-ins, lifecycle emails. */
export async function GET(request: Request) {
  try {
    await requireAdmin(request, "growth.view");
    const db = adminDb();
    const [totals] = await db`
      SELECT count(*) AS users,
        count(*) FILTER (WHERE created_at > now() - interval '30 days') AS new30,
        count(*) FILTER (WHERE created_at > now() - interval '7 days') AS new7,
        count(*) FILTER (WHERE marketing_opt_in) AS opted_in,
        count(*) FILTER (WHERE email_verified_at IS NOT NULL) AS verified
      FROM users WHERE deleted_at IS NULL`;
    const sources = await db`
      SELECT coalesce(nullif(signup_source, ''), 'direct') AS source, coalesce(nullif(signup_campaign, ''), '—') AS campaign, count(*) AS n
      FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '90 days'
      GROUP BY 1, 2 ORDER BY n DESC LIMIT 30`;
    const daily = await db`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*) AS n
      FROM users WHERE deleted_at IS NULL AND created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;
    const [ref] = await db`
      SELECT count(*) AS total, count(*) FILTER (WHERE status = 'rewarded') AS rewarded, coalesce(sum(reward), 0) * 2 AS credits FROM referrals`;
    const topReferrers = await db`
      SELECT u.id, u.email, u.name, count(*) AS invited, count(*) FILTER (WHERE r.status = 'rewarded') AS joined
      FROM referrals r JOIN users u ON u.id = r.referrer_id GROUP BY u.id ORDER BY joined DESC, invited DESC LIMIT 10`;
    const lifecycle = await db`
      SELECT split_part(kind, ':', 1) AS kind, count(*) AS n FROM lifecycle_sends WHERE sent_at > now() - interval '30 days' GROUP BY 1 ORDER BY n DESC`;
    const n = (v: unknown) => Number(v ?? 0);
    return NextResponse.json({
      data: {
        totals: { users: n(totals.users), new30: n(totals.new30), new7: n(totals.new7), optedIn: n(totals.opted_in), verified: n(totals.verified) },
        sources: sources.map((r) => ({ source: String(r.source), campaign: String(r.campaign), count: n(r.n) })),
        daily: daily.map((r) => ({ day: String(r.day), count: n(r.n) })),
        referrals: { total: n(ref.total), rewarded: n(ref.rewarded), creditsGiven: n(ref.credits) },
        topReferrers: topReferrers.map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name), invited: n(r.invited), joined: n(r.joined) })),
        lifecycle: lifecycle.map((r) => ({ kind: String(r.kind), count: n(r.n) })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
