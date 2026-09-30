/**
 * Help Center articles. Everything here must match how Recktube really
 * works (see src/server/support/facts.ts); never promise features or
 * numbers that aren't true.
 */

import { PLAYBOOK, type PlaybookEntry } from "@/src/content/playbook";

export interface HelpArticle {
  slug: string;
  title: string;
  category: "Getting started" | "Making videos" | "Publishing" | "Tools" | "Credits & plans" | "Account & security";
  summary: string;
  /** Paragraphs; lines starting with "1. " etc. render as steps, "• " as bullets. */
  body: string[];
}

export const HELP_CATEGORIES: HelpArticle["category"][] = ["Getting started", "Making videos", "Publishing", "Tools", "Credits & plans", "Account & security"];

const GUIDES: HelpArticle[] = [
  {
    slug: "what-is-recktube",
    title: "What is Recktube?",
    category: "Getting started",
    summary: "One studio to go from a video idea to a published YouTube video or Short.",
    body: [
      "Recktube is an all-in-one studio for video creators on YouTube (long videos and Shorts), TikTok, Instagram Reels and Facebook.",
      "You can find ideas that are working in your niche, write a script that holds attention, turn it into a finished video with voice-over, visuals, music and captions, and publish or schedule it on YouTube — all in one place.",
      "Every account starts with free credits that refill every 30 days, so you can try the whole flow without paying.",
    ],
  },
  {
    slug: "make-your-first-video",
    title: "Make your first video",
    category: "Getting started",
    summary: "From a topic to a finished video in a few minutes.",
    body: [
      "1. Open Script Studio and create a project with your topic.",
      "2. Write the script, or let Recktube write it with a strong hook and clear sections. Edit anything you like.",
      "3. Press Generate video. Recktube records the voice-over, finds stock footage and makes pictures for each scene, adds background music, animated captions and a thumbnail.",
      "4. Watch the result. Fine-tune it in the Video Studio if you want (timeline, text, transitions, audio mix).",
      "5. Publish to YouTube, save the file to your device, or on a paid plan post it to TikTok.",
      "Keep the tab open while the video is being generated: switching apps on a phone can pause it.",
    ],
  },
  {
    slug: "find-video-ideas",
    title: "Find video ideas that work",
    category: "Getting started",
    summary: "Use Content Creator, Trend Radar and niche research to pick topics with real demand.",
    body: [
      "Content Creator suggests video ideas based on what is working in your niche right now, and can study your connected channel.",
      "Trend Radar follows niches for you and sends briefs when something takes off.",
      "Most Paying Niches helps you pick a niche with real demand and earning potential.",
      "Any idea can be sent straight to Script Studio to start writing.",
    ],
  },
  {
    slug: "why-did-my-video-fail",
    title: "Why did my video fail?",
    category: "Making videos",
    summary: "What to check when a generation or export doesn't finish — and what happens to your credits.",
    body: [
      "Credits are only used when a generation succeeds. If a generated video can't be made at all, its credits are refunded automatically.",
      "Common causes and fixes:",
      "• The tab was closed or the phone screen turned off while generating. Keep the page open until it finishes, then try again.",
      "• A slow or dropped connection. Try again on a stable connection.",
      "• A very busy moment for the AI services. Wait a minute and try again.",
      "• An empty script section. Every section with text becomes a scene, so make sure the script isn't blank.",
      "Still stuck? Use the support chat in the app (bottom-right button) — it can check your account and bring in a person.",
    ],
  },
  {
    slug: "export-and-download",
    title: "Export or save a video to your device",
    category: "Making videos",
    summary: "Videos are exported in your browser as MP4.",
    body: [
      "Recktube builds the final video in your browser, so exporting doesn't depend on a slow upload.",
      "Open the video, choose Save to phone (or Export in the Video Studio) and keep the tab open until it finishes.",
      "Use Chrome or Edge for MP4 files. Some browsers, such as Firefox, export WebM instead, which some platforms (including TikTok) don't accept.",
    ],
  },
  {
    slug: "shorts-vs-long-videos",
    title: "Shorts and long videos",
    category: "Making videos",
    summary: "Choose vertical 9:16 for Shorts, Reels and TikTok, or 16:9 for long YouTube videos.",
    body: [
      "When you generate a video you can pick the format: Short (vertical 9:16, 1080×1920) or Long (landscape 16:9, 1920×1080).",
      "Shorts work best under 60 seconds with a hook in the first two seconds and captions on screen — Recktube adds animated captions for you.",
    ],
  },
  {
    slug: "connect-youtube",
    title: "Connect your YouTube channel",
    category: "Publishing",
    summary: "Connect once with Google sign-in, then publish, schedule and see analytics.",
    body: [
      "1. Open My Channel in the app.",
      "2. Choose Connect YouTube and sign in with the Google account that owns the channel.",
      "3. Allow the permissions Recktube asks for (upload, analytics and channel settings).",
      "If Recktube loses access — for example after a password change or if access was removed in your Google account — just reconnect from My Channel.",
      "You can disconnect at any time in Recktube, or remove access from your Google account's permissions page.",
    ],
  },
  {
    slug: "publish-and-schedule",
    title: "Publish or schedule on YouTube",
    category: "Publishing",
    summary: "Post now or pick a date and time; add a title, description, tags and thumbnail.",
    body: [
      "Press Publish on a finished video and choose YouTube. Recktube can write the title, description and tags from what is working in your niche, and you can edit them.",
      "Choose Public, Unlisted or Private, or pick a date and time to schedule it (at least 15 minutes ahead).",
      "Custom thumbnails need a verified YouTube channel. Verify yours for free at youtube.com/verify with your phone number.",
      "Keep the tab open until the upload finishes; YouTube then processes the video on its own.",
    ],
  },
  {
    slug: "post-to-tiktok",
    title: "Post to TikTok",
    category: "Publishing",
    summary: "On paid plans: connect TikTok, then post straight away or send the video to your TikTok drafts.",
    body: [
      "Posting to TikTok is included in every paid plan (Creator, Pro and Studio). The Free plan connects YouTube only — see recktube.xyz/pricing.",
      "1. Connect TikTok in Settings → Connections (or on My Channel).",
      "2. Open a finished video, press Publish and choose TikTok.",
      "3. Post now or send it to your drafts, choose who can see it, and allow comments, duets or stitches.",
      "If you send it to drafts, open the TikTok app on the account you connected and look in your inbox notifications or Profile → Drafts to finish posting.",
      "TikTok needs MP4 or MOV, so export in Chrome or Edge.",
    ],
  },
  {
    slug: "instagram-and-facebook",
    title: "Instagram Reels and Facebook",
    category: "Publishing",
    summary: "Make vertical videos for them in Recktube and upload them in their app.",
    body: [
      "Recktube makes videos ready for Reels and Facebook (vertical 9:16, captions). There is no direct posting to them yet: save the video to your device and upload it in their app.",
    ],
  },
  {
    slug: "how-credits-work",
    title: "How credits work",
    category: "Credits & plans",
    summary: "100 free credits every 30 days, and what each tool costs.",
    body: [
      "Every account gets 100 free credits that refill every 30 days — enough for one full generated video or 10 images.",
      "Monthly credits don't roll over: every 30 days they reset to your plan's amount. Credits from a credit pack are kept until used, and monthly credits are spent first.",
      "What things cost:",
      "• Full generated video: 100",
      "• Image: 10",
      "• AI video clip: 25",
      "• Voice-over: 5",
      "• Transcription: 5",
      "• Research: 2",
      "• Text (ideas, scripts, titles): 1",
      "Credits are only used when a generation succeeds, and a generated video that can't be made at all is refunded automatically.",
    ],
  },
  {
    slug: "upgrades-and-paid-features",
    title: "Upgrades and paid features",
    category: "Credits & plans",
    summary: "What the paid plans add, and how to upgrade.",
    body: [
      "Paid plans (Creator $5, Pro $12 and Studio $25 a month) give you more credits every month and add posting to TikTok, AI video clips and AI motion. See every plan at recktube.xyz/pricing.",
      "AI video clips and AI motion (turning pictures into real moving shots) are available on paid plans. On a free account you'll see them with a Paid badge.",
      "To upgrade, choose a plan on the Pricing page, or email support@recktube.xyz and the team will set it up for you.",
    ],
  },
  {
    slug: "reset-password",
    title: "Reset your password",
    category: "Account & security",
    summary: "Get a 6-digit code by email to set a new password.",
    body: [
      "1. On the sign-in page choose Forgot password?",
      "2. Enter your account email.",
      "3. Type the 6-digit code we email you (valid for 15 minutes) and choose a new password.",
      "For your safety, other devices are signed out after a reset.",
    ],
  },
  {
    slug: "verify-email",
    title: "Verify your email",
    category: "Account & security",
    summary: "Confirm your email with the link we send when you sign up.",
    body: [
      "New accounts confirm their email from a link we send, valid for 24 hours. If it expired or didn't arrive, check your spam folder and request a new one from the app.",
    ],
  },
  {
    slug: "privacy-and-your-data",
    title: "Privacy and your data",
    category: "Account & security",
    summary: "We don't sell your data or train AI on your content.",
    body: [
      "We never sell your data or use it for advertising, and we don't use your content to train or fine-tune any AI model.",
      "Cached YouTube data is deleted after 30 days. You can delete your account in Settings → Account at any time.",
      "Read the full Privacy Policy at recktube.xyz/privacy. To report a security issue, email security@recktube.xyz.",
    ],
  },
];

/** Simple ranked search over titles, summaries and text. */
export function searchHelp(query: string, articles: HelpArticle[] = HELP_ARTICLES): HelpArticle[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return articles;
  return articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const rest = `${a.summary} ${a.body.join(" ")}`.toLowerCase();
      const score = words.reduce((s, w) => s + (title.includes(w) ? 3 : 0) + (rest.includes(w) ? 1 : 0), 0);
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

const PLAN_LINE: Record<PlaybookEntry["plan"], string> = {
  Free: "Available on every plan, including Free.",
  Creator: "Available on the Creator, Pro and Studio plans.",
  Pro: "Available on the Pro and Studio plans.",
  Admin: "For the Recktube team.",
};

/** One "How to use" article per tool, from the support playbook. */
const TOOL_ARTICLES: HelpArticle[] = PLAYBOOK.filter((e) => e.plan !== "Admin").map((e) => ({
  slug: `guide-${e.id}`,
  title: e.name,
  category: "Tools",
  summary: e.what,
  body: [
    `Where: ${e.where}. ${PLAN_LINE[e.plan]}`,
    "How to use it:",
    ...e.steps.map((step, i) => `${i + 1}. ${step}`),
    "If something goes wrong:",
    ...e.problems.map((p) => `• ${p.issue}: ${p.fix}`),
    ...(e.handoff ? [`Need a person? ${e.handoff} Email support@recktube.xyz.`] : []),
  ],
}));

export const HELP_ARTICLES: HelpArticle[] = [...GUIDES, ...TOOL_ARTICLES];
