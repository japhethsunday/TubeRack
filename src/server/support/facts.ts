import { NAV_SECTIONS } from "@/src/config/navigation";
import { FEATURES, featureFlags } from "@/src/server/admin-ops";

/**
 * What the assistant (and the marketing writers) may say about Recktube.
 * The page list is read from the app's own navigation, so a new page is
 * known the moment it ships. Facts outside this text must not be promised.
 */

const PAGES = NAV_SECTIONS.filter((s) => s.title !== "Account")
  .flatMap((s) => s.items.filter((i) => i.status === "live").map((i) => `${i.label} (${i.href}): ${i.blurb}`))
  .join("\n  • ");

export const PRODUCT_FACTS = `About Recktube (recktube.xyz): an all-in-one studio for video creators — YouTube (long-form and Shorts), TikTok, Instagram Reels and Facebook videos.
- Pages in the app (menu name, address, what it does):
  • ${PAGES}
- Platforms:
  • YouTube: connect with Google sign-in on My Channel (/youtube); upload, schedule, analytics, channel branding (banner, about text, keywords, playlists) and thumbnail A/B tests. If access is lost (password change or access removed in Google), reconnect from My Channel.
  • TikTok: connect in Settings → Connections (also on My Channel). Post a finished video straight to TikTok (publish now) or send it to TikTok drafts, choose who can see it, and allow comments/duets/stitches. Use "Post to TikTok" from the video's publish options. TikTok needs MP4 or MOV: export in Chrome or Edge (some browsers such as Firefox export WebM, which TikTok rejects).
  • Instagram Reels and Facebook: plan and make videos for them (vertical 9:16 exports, captions, repurposing); there is no direct posting yet — download the export and upload it in their app.
- Making videos: Script Studio → Generate video builds a full video (voice-over, scene visuals from free stock footage and AI pictures animated with cinematic camera moves, background music, 19 animated caption styles, thumbnail). The Video Studio is a full editor (timeline, transitions, text, filters, audio mix) that exports MP4 in the browser.
- AI video clips and "AI motion" (turning pictures into real moving shots) are paid-plan features. Free accounts see them with a "Paid" badge and an "Ask to upgrade" button.
- Credits: every account gets 100 free credits that refill every 30 days — enough for one full generated video or 10 images. Costs: a full generated video 100; image 10; voice-over 5; transcription 5; AI video clip 25; research 2; text (ideas, scripts, titles) 1. If a generated video can't be made at all, its 100 credits are refunded automatically. Credits are only used when a generation succeeds. Admins can add bonus credits and set paid plans; there is no in-app card payment yet — upgrades are arranged with the team at support@recktube.xyz.
- Password reset: on the sign-in page choose "Forgot password?", enter the account email, then type the 6-digit code we email (valid 15 minutes). Other devices are signed out after a reset.
- Email verification: new accounts confirm their email from a link (valid 24 hours).
- Email preferences and notifications live in Settings. Briefs have a one-click unsubscribe.
- Account deletion: Settings → Account, or the team can delete it on request.
- Privacy: cached YouTube data is deleted after 30 days; data is never sold.
- Support: support@recktube.xyz. Security reports: security@recktube.xyz.`;

/** Tools an admin has paused right now, so the assistant never sends people to a switched-off feature. */
export async function liveStatus(): Promise<string> {
  try {
    const flags = await featureFlags();
    const paused = FEATURES.filter((f) => flags[f.id]?.off).map((f) => `${f.label}${flags[f.id]?.message ? ` — "${flags[f.id].message}"` : ""}`);
    return paused.length ? `Paused by the team right now (say so, and that it will be back): ${paused.join("; ")}.` : "Every tool is currently switched on.";
  } catch {
    return "";
  }
}
