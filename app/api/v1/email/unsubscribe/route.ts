import { NextResponse } from "next/server";
import { getDb } from "@/src/server/db";
import { verifyUnsubscribe, type UnsubscribeScope } from "@/src/server/unsubscribe";
import { limiterFor, clientKey } from "@/src/server/rate-limit";

function params(request: Request) {
  const url = new URL(request.url);
  return {
    email: (url.searchParams.get("e") ?? "").trim().toLowerCase().slice(0, 254),
    token: url.searchParams.get("t") ?? "",
    scope: (url.searchParams.get("k") === "m" ? "marketing" : "briefs") as UnsubscribeScope,
    sendId: /^[0-9a-f-]{36}$/.test(url.searchParams.get("s") ?? "") ? String(url.searchParams.get("s")) : null,
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, form?: { action: string }) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Recktube</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0714;color:#f4f1fb;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:420px;margin:24px;padding:32px;border:1px solid #2a2140;border-radius:20px;background:#140e22;text-align:center}h1{font-size:22px;margin:0 0 8px}p{color:#b7aecb;margin:0 0 20px}button,a.b{display:inline-block;border:0;border-radius:999px;padding:12px 22px;font-weight:600;color:#fff;background:linear-gradient(90deg,#c026d3,#7c3aed,#0284c7);cursor:pointer;text-decoration:none;font-size:14px}a.l{color:#b7aecb;font-size:13px}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p>${form ? `<form method="post" action="${esc(form.action)}"><button type="submit">Unsubscribe</button></form><p style="margin-top:16px"><a class="l" href="/settings?tab=notifications">Manage email preferences instead</a></p>` : `<a class="b" href="/dashboard">Open Recktube</a>`}</main></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

async function unsubscribe(email: string, scope: UnsubscribeScope, sendId: string | null): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (scope === "marketing") {
    await db`UPDATE users SET marketing_opt_in = false, marketing_opt_in_at = null, email_unsubscribed_at = coalesce(email_unsubscribed_at, now()) WHERE lower(email) = ${email}`;
    if (sendId) await db`UPDATE campaign_sends SET unsubscribed_at = coalesce(unsubscribed_at, now()) WHERE id = ${sendId}`;
    return;
  }
  await db`UPDATE trend_watches SET email_digest = false WHERE user_id IN (SELECT id FROM users WHERE lower(email) = ${email})`;
}

const WHAT: Record<UnsubscribeScope, string> = {
  briefs: "trend briefs, breakout alerts and reminders",
  marketing: "product news, tips and offers",
};

/** GET — confirmation page (link scanners must not unsubscribe people by prefetching). */
export async function GET(request: Request) {
  const { email, token, scope } = params(request);
  if (!verifyUnsubscribe(email, token, scope)) return page("Link not valid", "This unsubscribe link is incomplete or expired. You can change which emails you get in Settings.");
  const url = new URL(request.url);
  return page(scope === "marketing" ? "Stop product emails?" : "Stop briefs and alerts?", `You'll stop getting ${WHAT[scope]} at ${email}. Account and security emails still arrive.`, { action: `${url.pathname}${url.search}` });
}

/** POST — one-click unsubscribe (mail clients' "Unsubscribe" button, RFC 8058) and the confirm form. */
export async function POST(request: Request) {
  const limit = limiterFor("auth").take(`unsub:${clientKey(request)}`);
  if (limit.allowed === false) return new NextResponse("Too many requests", { status: 429 });
  const { email, token, scope, sendId } = params(request);
  if (!verifyUnsubscribe(email, token, scope)) return page("Link not valid", "This unsubscribe link is incomplete or expired.");
  try {
    await unsubscribe(email, scope, sendId);
  } catch (error) {
    console.error("unsubscribe failed:", error instanceof Error ? error.message : String(error));
    return page("Something went wrong", "We couldn't update your preferences. Please try again, or turn emails off in Settings.");
  }
  return page("You're unsubscribed", `We won't send ${WHAT[scope]} to ${email} any more. You can turn them back on in Settings at any time.`);
}
