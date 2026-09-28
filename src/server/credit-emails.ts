import { getServerEnv } from "@/src/lib/env";
import { renderEmail } from "@/src/server/email-templates";
import { sendEmail } from "@/src/server/email";
import { adminDb } from "@/src/server/admin";

/**
 * Tell a workspace's owners when the team adds credits or turns on unlimited.
 * Account mail (not marketing): it goes to verified, active owners regardless
 * of their marketing choice. Best effort — the credit change never waits on it.
 */
export async function notifyCreditGift(workspaceId: string, change: { added?: number; unlimited?: boolean; balance?: number; note?: string }): Promise<number> {
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  const owners = await adminDb()`
    SELECT u.email, u.name FROM memberships m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} AND m.role = 'owner'
      AND u.email_verified_at IS NOT NULL AND u.status = 'active' AND u.deleted_at IS NULL`;
  let sent = 0;
  for (const o of owners) {
    const first = String(o.name ?? "").trim().split(/\s+/)[0];
    const hi = first ? `Hi ${first}, ` : "";
    const unlimited = change.unlimited === true;
    const added = change.added ?? 0;
    const note = (change.note ?? "").trim();
    const mail = renderEmail({
      preheader: unlimited ? "Your Recktube account now has unlimited credits." : `${added} credits were added to your Recktube account.`,
      eyebrow: "Credits",
      heading: unlimited ? "You now have unlimited credits" : `${added.toLocaleString("en-US")} credits added`,
      intro: unlimited
        ? `${hi}the Recktube team has upgraded your account to unlimited credits. Every tool is yours to use without counting.`
        : `${hi}good news: the Recktube team has added ${added.toLocaleString("en-US")} credits to your account. They're ready to use right now.`,
      blocks: [
        ...(unlimited
          ? [{ type: "stats" as const, items: [{ label: "Balance", value: "Unlimited", tone: "good" as const }] }]
          : [{ type: "stats" as const, items: [{ label: "Added", value: `+${added.toLocaleString("en-US")}`, tone: "good" as const }, ...(change.balance !== undefined ? [{ label: "New balance", value: change.balance.toLocaleString("en-US") }] : [])] }]),
        ...(note && note !== "Admin adjustment" ? [{ type: "callout" as const, title: "Note from the team", text: note.slice(0, 200) }] : []),
        { type: "text" as const, text: "Put them to work: find a proven idea, write the script and build the video in minutes.\n\nThe Recktube team" },
      ],
      cta: { label: "Start creating", url: `${app}/content-creator` },
      secondary: { label: "See my credits", url: `${app}/settings?tab=billing` },
      reason: "You're receiving this because credits on your Recktube account changed.",
      appUrl: app,
    });
    try {
      const res = await sendEmail({
        to: String(o.email),
        subject: unlimited ? "Your Recktube account is now unlimited" : `🎁 ${added.toLocaleString("en-US")} credits added to your Recktube account`,
        ...mail,
        kind: "account",
        fromName: "Recktube",
        fromAddress: "support@recktube.xyz",
        replyTo: "support@recktube.xyz",
      });
      if (res.sent) sent++;
    } catch (error) {
      console.error("credit email failed:", error instanceof Error ? error.message : String(error));
    }
  }
  return sent;
}
