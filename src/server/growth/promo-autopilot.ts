import { getDb } from "@/src/server/db";
import { getSetting } from "@/src/server/admin-ops";
import { adminEmails } from "@/src/server/admin";
import { getServerEnv } from "@/src/lib/env";
import { sendEmail } from "@/src/server/email";
import { renderEmail } from "@/src/server/email-templates";
import { PROMO_FEATURES, PROMO_STYLES, styleFor, writePromo, type PromoPackage } from "@/src/server/growth/promo";

/**
 * Promo autopilot: every morning the AI writes a few different promo Shorts
 * for Recktube (rotating features, styles and angles so no two look alike)
 * and emails the owner. Nothing is published without a person: each promo
 * becomes a video with one tap ("Produce video") and is posted from the studio.
 */

export interface AutopilotSettings { enabled: boolean; perDay: number }
export const AUTOPILOT_DEFAULTS: AutopilotSettings = { enabled: false, perDay: 2 };
export const MAX_PER_DAY = 5;

/** Fresh creative directions, rotated so each day feels different. */
export const ANGLES = [
  "A creator's frustrating Tuesday before and after Recktube",
  "Three quick tips for faster Shorts, the last one uses Recktube",
  "From a blank page to a finished video, shown step by step",
  "Answer a common question new YouTubers ask",
  "The one habit that grows channels, and how Recktube helps with it",
  "A myth about making YouTube videos, busted",
  "What most creators get wrong about hooks",
  "A day-one channel: idea, script and video in one sitting",
  "Why consistency beats talent, and how to stay consistent",
  "Turn one idea into a week of Shorts",
];

export async function autopilotSettings(): Promise<AutopilotSettings> {
  const s = await getSetting<AutopilotSettings>("promo_autopilot", AUTOPILOT_DEFAULTS);
  return { enabled: Boolean(s.enabled), perDay: Math.max(1, Math.min(MAX_PER_DAY, Math.round(Number(s.perDay) || 2))) };
}

/** Pick `count` feature/style/angle combinations not used in the last two weeks. */
export function pickCombos(count: number, recent: { feature: string; style: string }[], seed = Date.now()): { feature: string; style: string; angle: string }[] {
  const used = new Set(recent.map((r) => `${r.feature}|${r.style}`));
  const all: { feature: string; style: string }[] = [];
  for (const f of PROMO_FEATURES) for (const st of PROMO_STYLES) all.push({ feature: f.id, style: st });
  const fresh = all.filter((c) => !used.has(`${c.feature}|${c.style}`));
  const pool = fresh.length >= count ? fresh : all;
  const out: { feature: string; style: string; angle: string }[] = [];
  const features = new Set<string>();
  let i = Math.abs(seed) % pool.length;
  for (let n = 0; n < pool.length * 2 && out.length < count; n++, i = (i + 7) % pool.length) {
    const c = pool[i];
    // Different features on the same day where possible.
    if (features.has(c.feature) && features.size < PROMO_FEATURES.length && n < pool.length) continue;
    if (out.some((o) => o.feature === c.feature && o.style === c.style)) continue;
    features.add(c.feature);
    out.push({ ...c, angle: ANGLES[(Math.floor(seed / 86_400_000) + out.length * 3) % ANGLES.length] });
  }
  return out;
}

/** Write today's promos (or `count` now) and email the owner. */
export async function runPromoAutopilot(opts: { force?: boolean; count?: number; createdBy?: string | null } = {}): Promise<{ made: number; skipped?: string }> {
  const db = getDb();
  if (!db) return { made: 0, skipped: "no database" };
  const settings = await autopilotSettings();
  if (!settings.enabled && !opts.force) return { made: 0, skipped: "off" };
  const target = Math.max(1, Math.min(MAX_PER_DAY, opts.count ?? settings.perDay));
  if (!opts.force) {
    const [today] = await db`SELECT count(*) AS n FROM promo_videos WHERE source = 'autopilot' AND created_at > now() - interval '20 hours'`;
    if (Number(today?.n ?? 0) >= target) return { made: 0, skipped: "already made today" };
  }
  const recent = (await db`SELECT feature, style FROM promo_videos WHERE created_at > now() - interval '14 days'`).map((r) => ({ feature: String(r.feature), style: String(r.style) }));
  const owner = opts.createdBy ?? (await ownerId());
  const made: { id: string; pkg: PromoPackage; feature: string }[] = [];
  for (const [n, c] of pickCombos(target, recent).entries()) {
    // Mostly teaching Shorts (3 of 4), with the occasional straight promo.
    c.style = styleFor(n, Date.now(), "how-to");
    try {
      const pkg = await writePromo({ feature: c.feature, style: c.style, platform: "YouTube Shorts", lengthSec: 30, angle: "" }); // the AI invents a fresh idea, avoiding past ones
      if (!pkg.scenes.length) continue;
      const [r] = await db`
        INSERT INTO promo_videos (created_by, feature, style, platform, length_sec, package, source, status)
        VALUES (${owner}, ${c.feature}, ${c.style}, ${"YouTube Shorts"}, ${30}, ${JSON.stringify(pkg)}, 'autopilot', 'ready') RETURNING id`;
      made.push({ id: String(r.id), pkg, feature: c.feature });
    } catch (error) {
      console.error("promo autopilot write failed:", error instanceof Error ? error.message : String(error));
    }
  }
  if (made.length) await emailOwner(made);
  return { made: made.length };
}

async function ownerId(): Promise<string | null> {
  const db = getDb();
  const email = adminEmails()[0];
  if (!db || !email) return null;
  const [u] = await db`SELECT id FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL LIMIT 1`;
  return u ? String(u.id) : null;
}

async function emailOwner(made: { id: string; pkg: PromoPackage; feature: string }[]) {
  const app = getServerEnv().APP_URL.replace(/\/$/, "");
  const mail = renderEmail({
    preheader: made.map((m) => m.pkg.title).join(" · ").slice(0, 120),
    eyebrow: "Promo autopilot",
    heading: `${made.length} promo video${made.length === 1 ? " is" : "s are"} ready`,
    intro: "Today's promo Shorts are written. Review them, then tap Produce video: the voice-over, visuals, captions and thumbnail are made for you, and you post from the studio.",
    blocks: made.map((m) => ({ type: "text" as const, text: `• ${m.pkg.title}\n  ${PROMO_FEATURES.find((f) => f.id === m.feature)?.name ?? m.feature} — “${m.pkg.hook}”` })),
    cta: { label: "Review promo videos", url: `${app}/admin/promo` },
    reason: "You're receiving this because Promo autopilot is switched on in the Recktube admin console.",
    appUrl: app,
  });
  for (const to of adminEmails().slice(0, 3)) {
    await sendEmail({ to, subject: `${made.length} promo video${made.length === 1 ? " is" : "s are"} ready to produce`, html: mail.html, text: mail.text, kind: "alert" }).catch(() => undefined);
  }
}
