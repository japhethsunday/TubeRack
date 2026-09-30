/**
 * Support playbook: one entry per feature. The single source for how each
 * tool works, which plan it's on, and how to fix common problems. It feeds
 * the support assistant, the admin assistant (via PRODUCT_FACTS) and the
 * Help Center ("Tools" articles). Keep it true to the app: never promise
 * something the product doesn't do.
 */

export interface PlaybookEntry {
  id: string;
  name: string;
  /** Where to find it in the app. */
  where: string;
  plan: "Free" | "Creator" | "Pro" | "Admin";
  what: string;
  steps: string[];
  problems: { issue: string; fix: string }[];
  /** When a person on the team should take over. */
  handoff?: string;
}

export const PLAYBOOK: PlaybookEntry[] = [
  {
    id: "idea-box",
    name: "Make a video from your idea",
    where: "Home screen (Dashboard), at the top",
    plan: "Free",
    what: "Type a few lines about the video you want; Recktube writes the full script, then makes the video with voice-over, visuals, music and captions.",
    steps: [
      "Describe the video in your own words (topic, tone, how it should end). Or tap an example under “Try:”.",
      "Choose Short (vertical) or Long video.",
      "Tap “Write & make my video”. The script is written automatically in Script Studio.",
      "When the script is ready, tap Generate video to make the full video.",
    ],
    problems: [
      { issue: "The button is greyed out", fix: "Write at least a sentence (10 characters or more)." },
      { issue: "The script doesn't match my idea", fix: "Add more detail (who it's for, the key points, the tone), or edit the script directly in Script Studio before generating the video." },
      { issue: "It stopped at the script", fix: "That's expected: review the script, then press Generate video. A full video costs 100 credits." },
    ],
  },
  {
    id: "script-studio",
    name: "Script Studio",
    where: "Menu → Script Studio (/studio/script)",
    plan: "Free",
    what: "Write, structure and polish a script with a strong hook and clear sections, by hand or with AI.",
    steps: [
      "Open a project (or create one with a topic).",
      "Press Generate to draft a full script, choosing format, length, tone and structure, or write it yourself.",
      "Edit any section; earlier versions are kept.",
      "Press Generate video when you're happy with it.",
    ],
    problems: [
      { issue: "The draft says [FACT CHECK: …]", fix: "The AI never invents facts. Replace those notes with a real, checked fact before publishing; they are skipped in the voice-over." },
      { issue: "Writing failed or is slow", fix: "The writing service may be busy. Wait a minute and try again. You're only charged when it succeeds." },
    ],
  },
  {
    id: "generate-video",
    name: "Generate video (full AI video)",
    where: "Script Studio → Generate video",
    plan: "Free",
    what: "Turns a script into a finished video: voice-over, stock footage and AI pictures per scene, background music and animated captions, plus a designed thumbnail for long videos (Shorts, TikTok and Reels use a frame from the video instead).",
    steps: [
      "In Script Studio, press Generate video.",
      "Pick Short (vertical) or Long, the visual style and the music mood (or No music).",
      "Keep the tab open while it works (a few minutes). Phones: keep the screen on.",
      "When it's done, preview it, then fine-tune in the Video Studio or publish.",
    ],
    problems: [
      { issue: "It failed part-way", fix: "Tap Try again; finished steps are kept. If a whole video can't be made, its 100 credits are refunded automatically." },
      { issue: "Not enough credits", fix: "A full video costs 100 credits. Credits reset every 30 days; paid plans and credit packs give more (recktube.xyz/pricing)." },
      { issue: "The voice sounds robotic", fix: "In Voice (Media Studio) pick a narrator voice (for example Achird · Friendly or Sulafat · Warm) and the Natural speaking style, then generate again." },
      { issue: "The same music keeps playing", fix: "Each video now picks a different track. For a specific feel, choose a different music mood before generating." },
    ],
  },
  {
    id: "video-studio",
    name: "Video Studio (editor and export)",
    where: "Menu → Video Studio (/studio/video)",
    plan: "Free",
    what: "A full editor: timeline, text, transitions, filters and audio mix, with MP4 export made in your browser.",
    steps: [
      "Open a project; drag clips on the timeline, add text and transitions.",
      "Adjust track volumes in the audio mix (music automatically dips under the voice).",
      "Press Export, choose the resolution and export. The file saves to your device.",
    ],
    problems: [
      { issue: "Export is stuck or fails", fix: "Use a current Chrome or Edge on a computer for the fastest, most reliable export. Keep the tab open and the screen on. On phones, close other apps and try a lower resolution." },
      { issue: "The exported video has no sound", fix: "Wait until the preview plays the voice and music before exporting (media must finish loading), check no track is muted, then export again." },
      { issue: "There is a small Recktube mark and only 720p", fix: "That's the Free plan. Paid plans export 1080p and 4K without the mark." },
      { issue: "4K is slow", fix: "4K depends on the device. 1080p is best for YouTube and much faster." },
    ],
  },
  {
    id: "voice",
    name: "Voice (narrator voices and styles)",
    where: "Menu → Voice (/studio/media?tab=voice)",
    plan: "Free",
    what: "Record takes, choose a narrator voice (24 options) and a speaking style used for all generated narration, including full videos.",
    steps: [
      "Choose a Narrator voice; each shows how it sounds (Friendly, Warm, Upbeat…).",
      "Choose a Speaking style: Natural, Energetic, Calm, Storyteller or Documentary.",
      "Generate a take to hear it. The choice applies to future videos made on this device.",
    ],
    problems: [
      { issue: "It doesn't sound human enough", fix: "Try Achird, Sulafat or Zubenelgenubi with the Natural style, and make sure the script is written the way people talk." },
      { issue: "The voice changed between videos", fix: "The voice and style are remembered per device. Pick them again on the new device." },
      { issue: "A word is said oddly", fix: "Spell it the way it sounds in the script (for example numbers as words) and generate the take again." },
    ],
  },
  {
    id: "music",
    name: "Music and sound",
    where: "Menu → Music (/studio/media?tab=audio)",
    plan: "Free",
    what: "Royalty-free instrumental tracks by mood, free for commercial use, plus the video's music level.",
    steps: ["Pick a mood, preview tracks and add one to the project.", "Adjust its volume in the Video Studio audio mix."],
    problems: [
      { issue: "Music is too quiet or too loud", fix: "Change the music track's volume in the Video Studio. It automatically dips while someone speaks." },
      { issue: "The music library is busy", fix: "Try again in a minute. If it stays busy, videos use a built-in soundtrack so they are never silent." },
    ],
  },
  {
    id: "assets-storage",
    name: "Assets and Storage",
    where: "Menu → Assets (/studio/media) and Storage (/storage)",
    plan: "Free",
    what: "Every image, voice-over, music track and video you generate or upload, per project (Assets) and across all projects (Storage). Download or reuse anything.",
    steps: ["Open Storage to see everything; filter by type.", "Download a file, or reuse it in another project."],
    problems: [
      { issue: "An upload is refused", fix: "Very large files (over about 2.8 GB) stay on your device instead of uploading. Trim or compress the video first." },
      { issue: "A file I made is missing on another device", fix: "Give it a moment to sync and refresh. Items made while offline sync when you're back online." },
    ],
  },
  {
    id: "storyboard",
    name: "Storyboard",
    where: "Menu → Storyboard (/studio/storyboard)",
    plan: "Creator",
    what: "Turns script sections into scenes with pacing and a visual plan before you build the video.",
    steps: ["Open a project with a script.", "Review each scene's visual and timing, and change anything.", "Generate the video from the storyboard."],
    problems: [{ issue: "It shows an upgrade screen", fix: "Storyboard is on the Creator plan and above (recktube.xyz/pricing)." }],
  },
  {
    id: "thumbnails",
    name: "Thumbnail Studio",
    where: "Menu → Thumbnail Studio (/studio/package?tab=thumbnail)",
    plan: "Free",
    what: "Thumbnail concepts and variants for your video, including an auto thumbnail when a video is generated.",
    steps: ["Open a project's Thumbnail tab.", "Generate concepts, pick one and adjust the text.", "It's used when you publish to YouTube."],
    problems: [
      { issue: "YouTube refused my custom thumbnail", fix: "YouTube only allows custom thumbnails on verified channels. Verify the channel at youtube.com/verify, then try again. The video itself still uploads." },
    ],
  },
  {
    id: "abtest",
    name: "Thumbnail A/B tests",
    where: "Menu → Thumbnail A/B (/studio/abtest)",
    plan: "Pro",
    what: "Rotates 2–4 thumbnails on a live YouTube video and keeps the one that performs best.",
    steps: ["Pick one of your uploaded videos.", "Add 2 to 4 thumbnails.", "Choose how often to swap (1, 2, 3 or 7 days) and how many rounds.", "Recktube reports the winner when it's done."],
    problems: [
      { issue: "It can't change the thumbnail", fix: "The channel must be verified (youtube.com/verify) and still connected on My Channel." },
      { issue: "Results look close", fix: "Give it more rounds or longer rotations; small channels need more views to show a clear winner." },
    ],
  },
  {
    id: "seo-repurpose",
    name: "SEO, Repurposing and Publishing tabs",
    where: "Project → Packaging Studio (/studio/package)",
    plan: "Free",
    what: "Title, description, keywords and chapters (SEO); Shorts and posts from a long video (Repurposing); and release settings per platform (Publishing).",
    steps: ["Open the project's Packaging Studio.", "Fill or generate the SEO fields.", "Use Repurposing for Shorts and posts, and Publishing to prepare each platform."],
    problems: [{ issue: "Generated text doesn't fit my channel", fix: "Add your niche and audience in the project brief, then generate again, or edit the text directly." }],
  },
  {
    id: "my-channel",
    name: "My Channel (YouTube)",
    where: "Menu → My Channel (/youtube)",
    plan: "Free",
    what: "Connect YouTube to publish and schedule, see analytics, and set channel branding (banner, about text, keywords, playlists).",
    steps: ["Tap Connect YouTube and sign in with the Google account that owns the channel.", "Allow the permissions.", "Publish or schedule from any finished video."],
    problems: [
      { issue: "The connection was lost", fix: "This happens after a Google password change or removing access. Reconnect from My Channel." },
      { issue: "Analytics show few or no views", fix: "YouTube analytics lag about 2 days; brand-new videos show up later." },
      { issue: "Wrong channel connected", fix: "Disconnect on My Channel, then connect again and pick the right channel or brand account in the Google screen." },
    ],
  },
  {
    id: "publish",
    name: "Publish and schedule on YouTube",
    where: "Video Studio → Publish to YouTube",
    plan: "Free",
    what: "Upload the finished video with title, description, tags and thumbnail, now or at a scheduled time.",
    steps: ["Press Publish to YouTube.", "Check the title, description and tags (suggestions are filled in).", "Choose Publish now or pick a date and time to schedule.", "Keep the tab open until the upload finishes."],
    problems: [
      { issue: "Upload failed", fix: "Check My Channel is still connected, keep the tab open, and try again. Very long videos take longer to upload." },
      { issue: "Scheduled video is private", fix: "That's how YouTube schedules: it stays private until the scheduled time, then goes public automatically." },
      { issue: "Daily upload limit", fix: "YouTube limits uploads per channel per day; try again tomorrow." },
    ],
  },
  {
    id: "tiktok",
    name: "TikTok posting",
    where: "Settings → Connections, or My Channel; then “Post to TikTok” on a video",
    plan: "Creator",
    what: "Post a finished video straight to TikTok or send it to your TikTok drafts, choosing who can see it.",
    steps: ["Connect TikTok (paid plans).", "On a finished video, choose Post to TikTok.", "Pick post now or send to drafts, and who can view it.", "It can take a few minutes to appear on your profile."],
    problems: [
      { issue: "TikTok isn't available", fix: "TikTok posting is on paid plans; the Free plan connects YouTube only." },
      { issue: "The video posted as private (only me)", fix: "TikTok limits public posting from new apps until TikTok approves them. Open the post in TikTok and change who can view it." },
      { issue: "The file was refused", fix: "TikTok needs MP4 or MOV. Export in Chrome or Edge, which make MP4." },
    ],
  },
  {
    id: "instagram-facebook",
    name: "Instagram Reels and Facebook",
    where: "Packaging Studio → Publishing",
    plan: "Free",
    what: "Plan and make vertical videos, captions and hashtags for Reels and Facebook. There is no direct posting yet.",
    steps: ["Make a vertical (9:16) video.", "Export it and download to your phone.", "Upload it in the Instagram or Facebook app with the prepared caption."],
    problems: [{ issue: "Can I post directly?", fix: "Not yet. Download the export and upload it in their app." }],
  },
  {
    id: "calendar",
    name: "Content calendar",
    where: "Menu → Calendar (/calendar)",
    plan: "Creator",
    what: "Plan your publishing schedule with reminders, let AI plan a month of content, and export to your own calendar (.ics).",
    steps: ["Tap + on a day to add an item, or ask it to plan your month.", "Set reminders.", "Export the calendar to Google or Apple Calendar."],
    problems: [{ issue: "It shows an upgrade screen", fix: "The calendar is on the Creator plan and above." }],
  },
  {
    id: "content-creator",
    name: "Content Creator (video ideas)",
    where: "Menu → Content Creator (/content-creator)",
    plan: "Free",
    what: "Video ideas based on your channel and what's winning in your niche, each with a hook, angle and why it works. Saved to history.",
    steps: ["Enter your niche and audience (or use your connected channel).", "Generate ideas.", "Tap an idea to start a project; the script is written for you."],
    problems: [
      { issue: "Ideas are too generic", fix: "Be specific about the niche and audience (for example “budget travel for students in Nigeria”) and connect your channel." },
      { issue: "It says it's busy", fix: "YouTube search has a daily budget per user; try again later or tomorrow." },
    ],
  },
  {
    id: "paying-niches",
    name: "Most Paying Niches",
    where: "Menu → Most Paying Niches (/intelligence/paying-niches)",
    plan: "Creator",
    what: "Ranks niches by earning potential using live YouTube data, so you can pick a profitable topic.",
    steps: ["Choose a region and niches to compare.", "Run the scan.", "Save the ones you like and start a channel or ideas from them."],
    problems: [
      { issue: "It shows an upgrade screen", fix: "Most Paying Niches is on the Creator plan and above." },
      { issue: "Earnings look different from my channel", fix: "They are estimates from public data to compare niches, not a promise of income." },
    ],
  },
  {
    id: "channel-creator",
    name: "Channel Creator",
    where: "Menu → Channel Creator (/channel-creator)",
    plan: "Pro",
    what: "Builds a full plan for a new channel from a niche (name, positioning, content pillars, first videos) and helps set up branding.",
    steps: ["Enter the niche and your audience.", "Generate the plan and review it.", "Apply branding to your connected channel and start the first videos."],
    problems: [{ issue: "It shows an upgrade screen", fix: "Channel Creator is on the Pro plan." }],
  },
  {
    id: "video-recreator",
    name: "Video Recreator",
    where: "Menu → Video Recreator (/video-recreator)",
    plan: "Pro",
    what: "Finds breakout videos in your niche and writes a better, original version (never a copy).",
    steps: ["Enter your niche.", "Pick a breakout video from the results.", "Generate your original version and start the project."],
    problems: [
      { issue: "It shows an upgrade screen", fix: "Video Recreator is on the Pro plan." },
      { issue: "No results", fix: "Try a broader niche, or try again later (YouTube search has a daily budget)." },
    ],
  },
  {
    id: "research-tools",
    name: "Niche Finder, Trend Radar, Research and Idea Lab",
    where: "Menu → Niche Finder, Trend Radar, Research",
    plan: "Free",
    what: "Score niches on demand and competition, see what's rising this week (with an optional morning email digest), search YouTube with real view counts, and test ideas and angles.",
    steps: ["Pick the tool, enter a topic or niche and run it.", "On Trend Radar, tick “Email me a morning digest” to follow a topic."],
    problems: [{ issue: "It says it's busy or out of searches", fix: "YouTube search has a daily budget per user. Try again later or tomorrow." }],
  },
  {
    id: "pro-intelligence",
    name: "Competitors, Content Gaps, Audience, Retention and Strategy",
    where: "Menu → Competitors and Content Intelligence",
    plan: "Pro",
    what: "Track competitor channels with breakout alerts, find topics your channel is missing, profile your audience, spot retention risks in a script, and build a channel strategy.",
    steps: ["Add competitor channels on Competitors.", "Open each analysis, give it your topic or script, and run it."],
    problems: [{ issue: "It shows an upgrade screen", fix: "These analyses are on the Pro plan." }],
  },
  {
    id: "analytics",
    name: "Analytics",
    where: "Menu → Analytics (/analytics)",
    plan: "Free",
    what: "Performance of your videos and a feedback loop to improve the next ones.",
    steps: ["Connect YouTube for real data.", "Review views, watch time and retention per video."],
    problems: [{ issue: "Numbers are behind", fix: "YouTube analytics lag about 2 days." }],
  },
  {
    id: "credits-plans",
    name: "Credits, plans and upgrades",
    where: "Settings → Billing, and recktube.xyz/pricing",
    plan: "Free",
    what: "Credits pay for AI work; plans add credits and tools. Monthly credits reset every 30 days and don't roll over; credit-pack and bonus credits are kept until used.",
    steps: ["See your balance at the top of the app.", "Compare plans at recktube.xyz/pricing.", "To upgrade, email support@recktube.xyz (card payment in the app is coming)."],
    problems: [
      { issue: "My credits went back down", fix: "Monthly credits reset to your plan's amount every 30 days and unused monthly credits expire. Credit-pack and bonus credits are kept." },
      { issue: "I was charged credits but it failed", fix: "Credits are only used when a generation succeeds; a full video that can't be made is refunded automatically. If something still looks wrong, hand over to the team." },
      { issue: "A tool shows an upgrade screen", fix: "That tool is on a higher plan. The screen lists what the plan unlocks." },
    ],
    handoff: "Billing disputes, refunds and plan changes go to the team.",
  },
  {
    id: "codes-referrals",
    name: "Bonus codes and inviting friends",
    where: "Account menu → Invite friends (/invite), and /redeem for codes",
    plan: "Free",
    what: "Redeem bonus credit codes, and invite friends: you both get 100 credits when they join (up to 50 friends). There are two kinds of codes: group codes (shared, e.g. a giveaway, each person uses it once, up to a set number of people) and personal codes (made for one account only, often sent by email).",
    steps: ["Share your invite link from Invite friends.", "To use a code, open /redeem (or tap the link in the email) and enter it. The credits are added straight away and show as “Redeemed”."],
    problems: [
      { issue: "The code doesn't work", fix: "Check the spelling. Codes can expire, reach their limit of people, be turned off or deleted, and each account can use a code only once." },
      { issue: "“That code belongs to another account”", fix: "It's a personal code made for someone else's account, so only they can use it. Ask for your own code or look for a group code." },
      { issue: "“You've already used this code”", fix: "Each account can redeem a code once; the credits from the first time are already in your balance." },
      { issue: "My friend joined but I got no credits", fix: "They must sign up through your link and verify their email (or sign up with Google). Credits arrive once that's done." },
    ],
  },
  {
    id: "sync",
    name: "Projects and syncing across devices",
    where: "Menu → Projects (/projects)",
    plan: "Free",
    what: "Projects, scripts and edits sync to your account so you can continue on another device.",
    steps: ["Sign in with the same account on each device.", "Open Projects; recent work appears after a short sync."],
    problems: [
      { issue: "A project is missing on my phone", fix: "Make sure you're signed in to the same account, stay online for a moment and refresh. Work done offline syncs once you're back online." },
      { issue: "The editor is slow on my phone", fix: "Close other tabs and apps; for long videos, a computer is faster." },
    ],
  },
  {
    id: "account",
    name: "Account, sign-in and security",
    where: "Settings (/settings)",
    plan: "Free",
    what: "Profile, password, email preferences, sessions and account deletion.",
    steps: [
      "Forgot password: on the sign-in page choose “Forgot password?”, then enter the 6-digit code we email (valid 15 minutes).",
      "Verify email: open the link we sent (valid 24 hours).",
      "Delete your account in Settings → Account.",
    ],
    problems: [
      { issue: "No email arrived", fix: "Check spam and promotions, wait a few minutes, then request a new one." },
      { issue: "I think someone else accessed my account", fix: "Reset the password now (other devices are signed out) and email security@recktube.xyz." },
    ],
    handoff: "Security concerns go to security@recktube.xyz.",
  },
];

/** The playbook as plain text for the assistants. */
export function playbookText(): string {
  return PLAYBOOK.map((e) =>
    [
      `### ${e.name} — ${e.where} — plan: ${e.plan === "Free" ? "all plans" : `${e.plan} and above`}`,
      e.what,
      `How: ${e.steps.join(" ")}`,
      `Fixes: ${e.problems.map((p) => `${p.issue} → ${p.fix}`).join(" | ")}`,
      e.handoff ? `Hand over: ${e.handoff}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n\n");
}
