import { renderEmail, num, type EmailBlock } from "@/src/server/email-templates";
import type { TrendResult, TrendVideo } from "@/src/lib/growth/trends";

/**
 * Niche briefs: ten rotating daily formats built on the same trend data, so
 * the inbox stays fresh (a different angle and next step each day), plus the
 * instant "breakout in your niche" alert.
 */

export interface BriefSection {
  query: string;
  result: TrendResult;
}

type Ranked = TrendVideo & { query: string; median: number };

interface BriefContext {
  app: string;
  niches: string[];
  best: Ranked;
  all: Ranked[];
  newCount: number;
  phrase: string;
  lift: number;
}

interface BriefTheme {
  id: string;
  eyebrow: string;
  subject: (c: BriefContext) => string;
  heading: (c: BriefContext) => string;
  intro: (c: BriefContext) => string;
  /** The day's playbook: what to do with the data. */
  play: (c: BriefContext) => { title: string; text: string };
  steps?: (c: BriefContext) => { title: string; text: string }[];
  cta: (c: BriefContext) => { label: string; url: string };
}

const q = (v: string) => encodeURIComponent(v);
const short = (t: string, n = 48) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const watch = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const liftOf = (v: { viewsPerHour: number; median: number }) => (v.median > 0 ? v.viewsPerHour / v.median : 0);

export const BRIEF_THEMES: BriefTheme[] = [
  {
    id: "morning-pulse",
    eyebrow: "Morning pulse",
    subject: (c) => `☀️ Your ${c.niches[0]} pulse: “${short(c.best.title)}” leads today`,
    heading: (c) => `What's winning in ${c.niches[0]} this morning`,
    intro: () => "The fastest-moving videos in your niche right now, ranked by views per hour — so you know exactly what viewers are choosing today.",
    play: (c) => ({ title: "Today's move", text: `The #1 video is pulling ${num(c.best.viewsPerHour)} views an hour. Borrow its promise, bring your own angle, and publish while attention is here.` }),
    cta: (c) => ({ label: "Turn this into a video", url: `${c.app}/intelligence/lab?seed=${q(c.best.title)}` }),
  },
  {
    id: "breakout-watch",
    eyebrow: "Breakout watch",
    subject: (c) => `🚀 Breakout in ${c.niches[0]}: ${c.lift >= 1.5 ? `${c.lift.toFixed(1)}× the usual pace` : `${num(c.best.viewsPerHour)} views/hr`}`,
    heading: () => "One video is outrunning your niche",
    intro: () => "When a video beats the niche's normal pace this hard, it has found a nerve. Here's what it is and how to answer it.",
    play: () => ({ title: "Why it's working", text: "Look at three things: the promise in the first 5 words of the title, the single emotion in the thumbnail, and how fast the video delivers on the promise. Match the promise, beat the delivery." }),
    steps: (c) => [
      { title: "Watch the first 30 seconds", text: "Note the exact line that makes you keep watching." },
      { title: "Write your angle", text: `What would your audience add to “${short(c.best.title, 60)}”?` },
      { title: "Draft it in Recktube", text: "Idea Lab scores the angle before you film a minute." },
    ],
    cta: (c) => ({ label: "Study the breakout", url: `${c.app}/intelligence/lab?seed=${q(c.best.title)}` }),
  },
  {
    id: "title-lab",
    eyebrow: "Title lab",
    subject: (c) => `✍️ Viewers are clicking “${c.phrase}” — titles that work in ${c.niches[0]}`,
    heading: (c) => `The words winning clicks in ${c.niches[0]}`,
    intro: () => "Titles are the first thing a viewer judges. These phrases keep showing up in the videos pulling the most views this week.",
    play: (c) => ({ title: "Title formula of the day", text: `Lead with “${c.phrase}”, add a specific result or number, and close with curiosity. Short titles (under 55 characters) win on mobile.` }),
    cta: (c) => ({ label: "Write 10 titles now", url: `${c.app}/intelligence/titles?seed=${q(c.phrase)}` }),
  },
  {
    id: "hook-of-the-day",
    eyebrow: "Hook of the day",
    subject: (c) => `🎣 The hook behind today's #1 ${c.niches[0]} video`,
    heading: () => "Win the first 15 seconds",
    intro: () => "Most viewers decide in the first few seconds. The top videos in your niche open fast, promise a payoff, and prove it early.",
    play: (c) => ({ title: "Hook template", text: `“In the next few minutes you'll see ${c.phrase ? `the ${c.phrase} method` : "exactly how"} — and the one mistake almost everyone makes.” Show the result first, explain second.` }),
    cta: (c) => ({ label: "Generate hooks for my video", url: `${c.app}/intelligence/hooks?seed=${q(c.best.title)}` }),
  },
  {
    id: "thumbnail-teardown",
    eyebrow: "Thumbnail teardown",
    subject: (c) => `🖼️ Why this thumbnail is winning in ${c.niches[0]}`,
    heading: () => "Thumbnails that earn the click",
    intro: () => "Look at the thumbnails below before the titles. Notice what the winners share: one subject, big contrast, and almost no text.",
    play: () => ({ title: "Thumbnail checklist", text: "One clear focal point · readable at phone size · 3 words or fewer · a face or object showing emotion · colours that pop against YouTube's white and dark themes." }),
    cta: (c) => ({ label: "Design my thumbnail", url: `${c.app}/studio/package?tab=thumbnail` }),
  },
  {
    id: "gap-finder",
    eyebrow: "Gap finder",
    subject: (c) => `🧭 An open lane in ${c.niches[0]} this week`,
    heading: () => "Demand is here. Supply isn't — yet.",
    intro: () => "High views on a topic with few fresh uploads means an open lane. Here's where your niche is hungry.",
    play: (c) => ({ title: "The gap", text: `Viewers are watching “${c.phrase}” videos, but most are from bigger channels. A focused, beginner-friendly take is the fastest way in for a growing channel.` }),
    cta: (c) => ({ label: "Find more content gaps", url: `${c.app}/intelligence/gaps?seed=${q(c.niches[0])}` }),
  },
  {
    id: "shorts-signal",
    eyebrow: "Shorts signal",
    subject: (c) => `⚡ Turn today's top ${c.niches[0]} topic into a Short`,
    heading: () => "One trend, one Short, one day",
    intro: () => "A Short built on a proven topic is the quickest way to reach new viewers — and the best trailer for your long videos.",
    play: (c) => ({ title: "Short recipe", text: `Open with the result in 1 second, give one tip about “${c.phrase || c.niches[0]}”, end with a question that makes people comment. 20–40 seconds.` }),
    cta: (c) => ({ label: "Create Short ideas", url: `${c.app}/content-creator?niche=${q(c.niches[0])}&format=short` }),
  },
  {
    id: "competitor-radar",
    eyebrow: "Competitor radar",
    subject: (c) => `👀 ${c.best.channelTitle} is pulling ahead in ${c.niches[0]}`,
    heading: (c) => `Keep an eye on ${c.best.channelTitle}`,
    intro: () => "Channels that keep landing top videos set the pace in your niche. Track them and you'll see trends before they peak.",
    play: (c) => ({ title: "Learn from them", text: `${c.best.channelTitle} has today's fastest video. Track the channel in Recktube and you'll get an alert whenever one of their uploads breaks out.` }),
    cta: () => ({ label: "Track competitors", url: "/intelligence/competitors" }),
  },
  {
    id: "script-starter",
    eyebrow: "Script starter",
    subject: (c) => `📝 A ready-to-film outline for ${c.niches[0]}`,
    heading: () => "Your next video, already outlined",
    intro: () => "Blank pages kill momentum. Here's a structure the top videos in your niche follow — fill it in and you're halfway there.",
    play: () => ({ title: "Winning structure", text: "Hook (the payoff) → why it matters → 3 steps with one example each → the mistake to avoid → a clear next step." }),
    steps: (c) => [
      { title: "Hook", text: `Show the result: “${short(c.best.title, 70)}” — but your version.` },
      { title: "Three steps", text: "Each step: what to do, one example, one common mistake." },
      { title: "Close", text: "Tell viewers the exact next video to watch." },
    ],
    cta: (c) => ({ label: "Write the script", url: `${c.app}/studio/script?seed=${q(c.best.title)}` }),
  },
  {
    id: "weekly-game-plan",
    eyebrow: "Game plan",
    subject: (c) => `📅 Plan your next 3 ${c.niches[0]} videos from this week's winners`,
    heading: () => "Your content plan, built from real demand",
    intro: () => "Consistency beats virality. Use this week's winners to plan three videos — then put them on your calendar so they actually ship.",
    play: (c) => ({ title: "3-video plan", text: `1) Your take on the #1 video. 2) A “${c.phrase || "beginner"}” guide. 3) A Short that teases video 1.` }),
    cta: (c) => ({ label: "Plan it on my calendar", url: `${c.app}/calendar` }),
  },
];

/** The theme for a given day (rotates through all ten). */
export function themeForDay(date = new Date()): BriefTheme {
  const day = Math.floor(date.getTime() / 86_400_000);
  return BRIEF_THEMES[day % BRIEF_THEMES.length];
}

function context(sections: BriefSection[], app: string): BriefContext | null {
  const withVideos = sections.filter((s) => s.result.videos.length > 0);
  if (!withVideos.length) return null;
  const all = withVideos.flatMap((s) => s.result.videos.map((v) => ({ ...v, query: s.query, median: s.result.medianViewsPerHour })));
  const best = [...all].sort((a, b) => b.viewsPerHour - a.viewsPerHour)[0];
  return {
    app,
    niches: withVideos.map((s) => s.query),
    best,
    all,
    newCount: all.filter((v) => v.isNew).length,
    phrase: withVideos[0].result.phrases[0]?.phrase ?? "",
    lift: liftOf(best),
  };
}

/** The daily brief in today's (or a given) format. */
export function nicheBrief(sections: BriefSection[], app: string, theme: BriefTheme = themeForDay()): { subject: string; html: string; text: string } | null {
  const c = context(sections, app);
  if (!c) return null;
  const { best } = c;
  const blocks: EmailBlock[] = [
    {
      type: "stats",
      items: [
        { label: "Videos tracked", value: String(c.all.length) },
        { label: "New since last brief", value: String(c.newCount), tone: c.newCount ? "good" : undefined },
        { label: "Top views / hour", value: num(best.viewsPerHour), tone: "hot" },
      ],
    },
    {
      type: "hero-video",
      rank: 1,
      title: best.title,
      channel: `${best.channelTitle}${best.channelSubs !== null ? ` · ${num(best.channelSubs)} subscribers` : ""}`,
      thumbnail: best.thumbnail,
      url: watch(best.videoId),
      meta: [`${num(best.views)} views`, `${num(best.viewsPerHour)} views/hour`, ...(c.lift >= 1.5 ? [`${c.lift.toFixed(1)}× the niche pace`] : [])],
      badge: best.isNew ? "New" : c.lift >= 2 ? "Breakout" : undefined,
    },
    { type: "callout", ...theme.play(c) },
  ];
  if (theme.steps) blocks.push({ type: "steps", items: theme.steps(c) });
  for (const s of sections.filter((x) => x.result.videos.length)) {
    const rest = s.result.videos.filter((v) => v.videoId !== best.videoId).slice(0, 4);
    if (rest.length) {
      blocks.push({ type: "heading", text: `More in “${s.query}”`, note: "last 7 days" });
      blocks.push({
        type: "videos",
        items: rest.map((v, i) => ({
          rank: i + 2,
          title: v.title,
          channel: v.channelTitle,
          thumbnail: v.thumbnail,
          url: watch(v.videoId),
          meta: `${num(v.views)} views · ${num(v.viewsPerHour)}/hr`,
          badge: v.isNew ? "New" : s.result.medianViewsPerHour > 0 && v.viewsPerHour >= 2 * s.result.medianViewsPerHour ? "Breakout" : undefined,
        })),
      });
    }
    const phrases = s.result.phrases.slice(0, 8).map((p) => p.phrase);
    if (phrases.length) blocks.push({ type: "chips", label: `Words rising in “${s.query}” titles`, items: phrases });
  }
  const cta = theme.cta(c);
  const mail = renderEmail({
    preheader: `#1 right now: “${best.title}” — ${num(best.viewsPerHour)} views/hour.`,
    eyebrow: theme.eyebrow,
    heading: theme.heading(c),
    intro: theme.intro(c),
    blocks,
    cta: { label: cta.label, url: cta.url.startsWith("/") ? `${app}${cta.url}` : cta.url },
    secondary: { label: "Open Trend Radar", url: `${app}/intelligence/trends` },
    reason: "You get this brief because you follow a niche in Recktube. Change topics or turn it off in Trend Radar.",
    appUrl: app,
  });
  return { subject: theme.subject(c), ...mail };
}

/** A video in the user's niche is taking off right now: a short, urgent alert. */
export function breakoutAlert(niche: string, video: TrendVideo, median: number, app: string): { subject: string; html: string; text: string } {
  const lift = median > 0 ? video.viewsPerHour / median : 0;
  const mail = renderEmail({
    preheader: `${video.channelTitle} is getting ${num(video.viewsPerHour)} views an hour${lift >= 1.5 ? ` — ${lift.toFixed(1)}× the niche pace` : ""}.`,
    eyebrow: "Breakout alert",
    heading: `Something is taking off in ${niche}`,
    intro: "A brand-new video in your niche is moving far faster than usual. Topics like this peak within days — the channels that respond first catch the wave.",
    blocks: [
      {
        type: "hero-video",
        title: video.title,
        channel: `${video.channelTitle}${video.channelSubs !== null ? ` · ${num(video.channelSubs)} subscribers` : ""}`,
        thumbnail: video.thumbnail,
        url: watch(video.videoId),
        meta: [`${num(video.views)} views`, `${num(video.viewsPerHour)} views/hour`, ...(lift >= 1.5 ? [`${lift.toFixed(1)}× the niche pace`] : [])],
        badge: "Breakout",
      },
      {
        type: "steps",
        items: [
          { title: "Watch it now", text: "Note the promise in the title and the first line of the video." },
          { title: "Find your angle", text: "A beginner version, a counter-take, or a faster how-to all work." },
          { title: "Publish within 48 hours", text: "Recktube can take you from idea to finished video today." },
        ],
      },
    ],
    cta: { label: "Make my version", url: `${app}/intelligence/lab?seed=${q(video.title)}` },
    secondary: { label: "Watch on YouTube", url: watch(video.videoId) },
    reason: "You get breakout alerts for niches you follow in Recktube. Change them in Trend Radar.",
    appUrl: app,
  });
  return { subject: `🚀 Taking off in ${niche}: “${short(video.title)}”`, ...mail };
}

/** A new video counts as a breakout when it is well ahead of the niche's normal pace. */
export function isBreakout(video: TrendVideo, median: number): boolean {
  return video.isNew && video.viewsPerHour >= 500 && (median <= 0 || video.viewsPerHour >= 3 * median);
}
