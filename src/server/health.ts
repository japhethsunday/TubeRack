import { getServerEnv } from "@/src/lib/env";
import { getDb } from "@/src/server/db";
import { adminEmails } from "@/src/server/admin";
import { FEATURES, featureFlags, putSetting } from "@/src/server/admin-ops";
import { sharedLimit } from "@/src/server/shared-limit";
import { renderEmail } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { scanSafety } from "@/src/server/safety";

/**
 * Health watch and the admins' morning briefing.
 * - After a failed generation, at most every 10 minutes per tool: if that tool
 *   failed 90%+ of at least 15 tries in the last hour, it pauses itself (users
 *   see a "back soon" note instead of errors) and the admins get an email.
 * - Every morning: safety scan + a one-page briefing email.
 */

const app = () => getServerEnv().APP_URL.replace(/\/$/, "");
const PAUSE_NOTE = "This tool is having trouble right now. We're on it — please try again a little later.";

async function mailAdmins(subject: string, heading: string, intro: string, blocks: Parameters<typeof renderEmail>[0]["blocks"], cta = { label: "Open the admin console", url: `${app()}/admin` }) {
  const mail = renderEmail({ preheader: intro.slice(0, 110), eyebrow: "Admin", heading, intro, blocks, cta, reason: "You're receiving this because you're a Recktube admin.", appUrl: app() });
  for (const to of adminEmails()) {
    await sendEmail({ to, subject, ...mail, kind: "alert", fromName: "Recktube", fromAddress: "support@recktube.xyz" }).catch(() => undefined);
  }
}

export async function watchFailure(kind: string): Promise<void> {
  if (!FEATURES.some((f) => f.id === kind) || kind === "all") return;
  try {
    await sharedLimit(`health-check:${kind}`, 1, 600);
  } catch {
    return; // checked recently
  }
  const db = getDb();
  if (!db) return;
  const [r] = await db`
    SELECT count(*) AS total, count(*) FILTER (WHERE status = 'failed') AS failed
    FROM usage_events WHERE kind = ${kind} AND created_at > now() - interval '1 hour'`;
  const total = Number(r?.total ?? 0);
  const failed = Number(r?.failed ?? 0);
  if (total < 15 || failed / total < 0.9) return;
  const flags = { ...(await featureFlags()) };
  if (flags[kind]?.off) return;
  flags[kind] = { off: true, message: PAUSE_NOTE };
  const [owner] = adminEmails().length ? await db`SELECT id FROM users WHERE lower(email) = ANY(${adminEmails()}) LIMIT 1` : [];
  if (!owner) return;
  await putSetting("features", flags, String(owner.id));
  const label = FEATURES.find((f) => f.id === kind)?.label ?? kind;
  await mailAdmins(
    `⚠️ Paused automatically: ${label}`,
    `${label} paused automatically`,
    `${failed} of the last ${total} ${label.toLowerCase()} requests failed in the past hour, so the tool was paused. Users see a "back soon" note instead of errors.`,
    [{ type: "callout", title: "What to do", text: "Check the provider (keys, quota, outages) in Admin → System, then switch the tool back on in Feature switches." }],
    { label: "Open feature switches", url: `${app()}/admin/features` },
  );
}

export async function morningBriefing(): Promise<Record<string, unknown>> {
  const safety = await scanSafety();
  const db = getDb();
  if (!db || !adminEmails().length) return { safety };
  const [s] = await db`
    SELECT
      (SELECT count(*) FROM users WHERE created_at > now() - interval '1 day' AND deleted_at IS NULL) AS signups,
      (SELECT count(DISTINCT user_id) FROM auth_sessions WHERE last_used_at > now() - interval '1 day') AS active,
      (SELECT count(*) FROM usage_events WHERE created_at > now() - interval '1 day' AND status = 'completed') AS ok,
      (SELECT count(*) FROM usage_events WHERE created_at > now() - interval '1 day' AND status = 'failed') AS failed,
      (SELECT count(*) FROM safety_flags WHERE status = 'open') AS flags,
      (SELECT count(*) FROM safety_flags WHERE auto_action <> '' AND created_at > now() - interval '1 day') AS auto_actions,
      (SELECT count(*) FROM support_conversations WHERE status = 'handoff') AS support,
      (SELECT count(*) FROM affiliates WHERE status = 'pending') AS affiliates,
      (SELECT coalesce(sum(commission_minor), 0) FROM affiliate_commissions WHERE status IN ('pending', 'approved')) AS owed`;
  const flags = await featureFlags();
  const paused = FEATURES.filter((f) => flags[f.id]?.off).map((f) => f.label);
  const n = (v: unknown) => Number(v ?? 0);
  const todo = [
    n(s.support) && `${n(s.support)} support chat(s) waiting for a teammate`,
    n(s.flags) && `${n(s.flags)} safety flag(s) to review`,
    n(s.affiliates) && `${n(s.affiliates)} affiliate application(s) to review`,
    n(s.owed) && `$${(n(s.owed) / 100).toFixed(2)} affiliate commission owed`,
    paused.length && `Paused tools: ${paused.join(", ")}`,
  ].filter(Boolean) as string[];
  await mailAdmins(
    `☀️ Recktube today: ${n(s.signups)} new, ${n(s.active)} active${todo.length ? ` · ${todo.length} to do` : ""}`,
    "Your morning briefing",
    "Here's the last 24 hours at a glance.",
    [
      { type: "stats", items: [{ label: "New sign-ups", value: String(n(s.signups)), tone: "good" }, { label: "Active users", value: String(n(s.active)) }, { label: "Generations", value: String(n(s.ok)) }, { label: "Failed", value: String(n(s.failed)), ...(n(s.failed) > n(s.ok) * 0.2 ? { tone: "hot" as const } : {}) }] },
      ...(todo.length ? [{ type: "steps" as const, items: todo.map((t) => ({ title: t, text: "" })) }] : [{ type: "text" as const, text: "Nothing needs you today. 🎉" }]),
      ...(n(s.auto_actions) ? [{ type: "callout" as const, title: "Handled automatically", text: `${n(s.auto_actions)} safety action(s) were taken on their own. Review them in Admin → Safety.` }] : []),
    ],
  );
  return { safety, briefed: true };
}
