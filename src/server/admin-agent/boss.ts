import { getDb } from "@/src/server/db";
import { adminEmails, isAdmin } from "@/src/server/admin";
import type { SessionUser } from "@/src/server/auth";
import { FEATURES, featureFlags } from "@/src/server/admin-ops";
import { listInbox } from "@/src/server/inbox";

/**
 * "Boss mode": only the founder's own account (the first ADMIN_EMAILS
 * address, verified and active) gets a personal to-do briefing from the
 * assistant. Checked on the server every time; other admins never see it.
 */

export function isBoss(user: Pick<SessionUser, "email" | "emailVerifiedAt" | "status"> | null): boolean {
  const owner = adminEmails()[0];
  return Boolean(user && owner && isAdmin(user) && user.email.trim().toLowerCase() === owner);
}

export interface BossTodo { id: string; title: string; detail: string; href: string; tone: "urgent" | "normal" | "good" }

export async function bossTodos(): Promise<BossTodo[]> {
  const db = getDb();
  if (!db) return [];
  const n = (v: unknown) => Number(v ?? 0);
  const [s] = await db`
    SELECT
      (SELECT count(*) FROM support_conversations WHERE status = 'handoff') AS support,
      (SELECT count(*) FROM safety_flags WHERE status = 'open') AS flags,
      (SELECT count(*) FROM safety_flags WHERE status = 'open' AND severity = 'high') AS flags_high,
      (SELECT count(*) FROM affiliates WHERE status = 'pending') AS affiliates,
      (SELECT coalesce(sum(commission_minor), 0) FROM affiliate_commissions WHERE status IN ('pending', 'approved')) AS owed,
      (SELECT count(*) FROM promo_videos WHERE source = 'autopilot' AND status = 'ready' AND created_at > now() - interval '3 days') AS promos,
      (SELECT count(*) FROM usage_events WHERE created_at > now() - interval '1 day' AND status = 'failed') AS failed,
      (SELECT count(*) FROM usage_events WHERE created_at > now() - interval '1 day' AND status = 'completed') AS ok,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '1 day' AND deleted_at IS NULL) AS signups,
      (SELECT count(*) FROM campaigns WHERE status = 'sending') AS sending`;
  const todos: BossTodo[] = [];
  if (n(s.flags_high)) todos.push({ id: "flags-high", title: `${n(s.flags_high)} serious safety flag${n(s.flags_high) === 1 ? "" : "s"}`, detail: "Possible fraud or harmful use. Review first.", href: "/admin/safety", tone: "urgent" });
  if (n(s.support)) todos.push({ id: "support", title: `${n(s.support)} creator${n(s.support) === 1 ? " is" : "s are"} waiting for support`, detail: "The support assistant handed these over to a person.", href: "/admin/support", tone: "urgent" });
  // Mail to the addresses that are never answered automatically.
  try {
    const { emails } = await listInbox();
    const since = Date.now() - 48 * 3_600_000;
    const personal = emails.filter((e) => e.mailbox !== "support" && Date.parse(e.receivedAt) > since);
    if (personal.length) {
      const boxes = [...new Set(personal.map((e) => `${e.mailbox}@`))].join(", ");
      todos.push({ id: "inbox", title: `${personal.length} new email${personal.length === 1 ? "" : "s"} to ${boxes}`, detail: "Last 48 hours. These are never answered automatically.", href: "/admin/inbox", tone: personal.some((e) => e.mailbox === "security") ? "urgent" : "normal" });
    }
  } catch {
    // inbox unavailable: skip
  }
  const failRate = n(s.ok) + n(s.failed) ? n(s.failed) / (n(s.ok) + n(s.failed)) : 0;
  if (n(s.failed) >= 5 && failRate > 0.2) todos.push({ id: "failures", title: `${n(s.failed)} failed generations in 24 hours (${Math.round(failRate * 100)}%)`, detail: "Higher than normal. See what's failing.", href: "/admin/failed", tone: "urgent" });
  if (n(s.promos)) todos.push({ id: "promos", title: `${n(s.promos)} promo video${n(s.promos) === 1 ? " is" : "s are"} ready to produce`, detail: "Written by autopilot. One tap each to make the video.", href: "/admin/promo", tone: "normal" });
  const lowFlags = n(s.flags) - n(s.flags_high);
  if (lowFlags > 0) todos.push({ id: "flags", title: `${lowFlags} safety flag${lowFlags === 1 ? "" : "s"} to review`, detail: "Lower priority checks from the daily scan.", href: "/admin/safety", tone: "normal" });
  if (n(s.affiliates)) todos.push({ id: "affiliates", title: `${n(s.affiliates)} affiliate application${n(s.affiliates) === 1 ? "" : "s"}`, detail: "Waiting for your decision.", href: "/admin/affiliates", tone: "normal" });
  if (n(s.owed) >= 100) todos.push({ id: "owed", title: `$${(n(s.owed) / 100).toFixed(2)} affiliate commission owed`, detail: "Pay out or review.", href: "/admin/affiliates", tone: "normal" });
  try {
    const flags = await featureFlags();
    const paused = FEATURES.filter((f) => flags[f.id]?.off).map((f) => f.label);
    if (paused.length) todos.push({ id: "paused", title: `Paused: ${paused.slice(0, 3).join(", ")}${paused.length > 3 ? "…" : ""}`, detail: "Creators can't use these right now. Switch back on when fixed.", href: "/admin/features", tone: "normal" });
  } catch {
    // skip
  }
  if (n(s.sending)) todos.push({ id: "sending", title: `${n(s.sending)} email campaign${n(s.sending) === 1 ? " is" : "s are"} still sending`, detail: "The daily job finishes them.", href: "/admin/campaigns", tone: "good" });
  if (n(s.signups)) todos.push({ id: "signups", title: `${n(s.signups)} new sign-up${n(s.signups) === 1 ? "" : "s"} today`, detail: "Say hello or check where they came from.", href: "/admin/growth", tone: "good" });
  return todos.slice(0, 10);
}
