import {
  LayoutDashboard,
  FolderKanban,
  Compass,
  FlaskConical,
  PenLine,
  Columns3,
  Image,
  Mic,
  Music,
  Clapperboard,
  Stamp,
  SearchCheck,
  Repeat2,
  Rocket,
  ChartLine,
  Settings,
  CreditCard,
  Palette,
  LogIn,
  UserPlus,
  Activity,
  type LucideIcon,
} from "lucide-react";

export type NavStatus = "live" | "preview" | "planned";

export interface NavItem {
  slug: string;
  label: string;
  href: string;
  icon: LucideIcon;
  status: NavStatus;
  /** Phase that delivers real functionality. */
  phase: string;
  blurb: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Single source of truth for shell navigation. Hierarchy is deliberate:
 * primary work first, production pipeline second, system last.
 * `preview` items render inside the preview workspace; `planned` items are
 * disabled with their owning phase — never dead links.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Workspace",
    items: [
      {
        slug: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        status: "live",
        phase: "Phase 2",
        blurb: "Overview, projects, usage, activity.",
      },
      {
        slug: "projects",
        label: "Projects",
        href: "/projects",
        icon: FolderKanban,
        status: "live",
        phase: "Phase 2",
        blurb: "All content projects.",
      },
      {
        slug: "activity",
        label: "Activity",
        href: "/activity",
        icon: Activity,
        status: "live",
        phase: "Phase 4",
        blurb: "Workspace and project events.",
      },
    ],
  },
  {
    title: "Production",
    items: [
      {
        slug: "intelligence",
        label: "Content Intelligence",
        href: "/intelligence",
        icon: Compass,
        status: "live",
        phase: "Phase 5",
        blurb: "Opportunities, angles, positioning.",
      },
      {
        slug: "research",
        label: "Research",
        href: "/projects/preview?stage=research",
        icon: FlaskConical,
        status: "preview",
        phase: "Phase 6",
        blurb: "Sources, evidence, notes.",
      },
      {
        slug: "script",
        label: "Script Studio",
        href: "/studio/script",
        icon: PenLine,
        status: "live",
        phase: "Phase 6",
        blurb: "Write, structure, review scripts.",
      },
      {
        slug: "storyboard",
        label: "Storyboard",
        href: "/studio/storyboard",
        icon: Columns3,
        status: "live",
        phase: "Phase 6",
        blurb: "Scenes, pacing, visuals plan.",
      },
      {
        slug: "assets",
        label: "Assets",
        href: "/studio/media",
        icon: Image,
        status: "live",
        phase: "Phase 7",
        blurb: "Library, drafts, uploads.",
      },
      {
        slug: "voice",
        label: "Voice",
        href: "/studio/media?tab=voice",
        icon: Mic,
        status: "live",
        phase: "Phase 7",
        blurb: "Takes, profiles, assignment.",
      },
      {
        slug: "music",
        label: "Music",
        href: "/studio/media?tab=audio",
        icon: Music,
        status: "live",
        phase: "Phase 7",
        blurb: "Tracks, SFX, mix.",
      },
      {
        slug: "video",
        label: "Video Studio",
        href: "/studio/video",
        icon: Clapperboard,
        status: "live",
        phase: "Phase 8",
        blurb: "Timeline, preview, export prep.",
      },
      {
        slug: "thumbnail",
        label: "Thumbnail Studio",
        href: "/studio/package?tab=thumbnail",
        icon: Stamp,
        status: "live",
        phase: "Phase 9",
        blurb: "Concepts, variants, review.",
      },
      {
        slug: "seo",
        label: "SEO",
        href: "/studio/package?tab=seo",
        icon: SearchCheck,
        status: "live",
        phase: "Phase 9",
        blurb: "Description, keywords, chapters.",
      },
      {
        slug: "repurposing",
        label: "Repurposing",
        href: "/studio/package?tab=repurpose",
        icon: Repeat2,
        status: "live",
        phase: "Phase 9",
        blurb: "Shorts, posts, derivatives.",
      },
      {
        slug: "publishing",
        label: "Publishing",
        href: "/projects/preview?stage=publishing",
        icon: Rocket,
        status: "preview",
        phase: "Phase 9",
        blurb: "Schedule, export, release.",
      },
      {
        slug: "analytics",
        label: "Analytics",
        href: "/analytics",
        icon: ChartLine,
        status: "live",
        phase: "Phase 10",
        blurb: "Performance, feedback loop.",
      },
    ],
  },
  {
    title: "System",
    items: [
      {
        slug: "design",
        label: "Design system",
        href: "/design",
        icon: Palette,
        status: "live",
        phase: "Phase 2",
        blurb: "Components, tokens, patterns.",
      },
      {
        slug: "settings",
        label: "Settings",
        href: "/settings",
        icon: Settings,
        status: "live",
        phase: "Phase 3",
        blurb: "Profile, preferences, security, data.",
      },
      {
        slug: "billing",
        label: "Billing",
        href: "/dashboard",
        icon: CreditCard,
        status: "planned",
        phase: "Phase 10",
        blurb: "Credits, usage, subscription.",
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Routes the command menu + search can actually navigate to. */
export const SEARCHABLE_ROUTES: NavItem[] = ALL_NAV_ITEMS.filter(
  (i) => i.status !== "planned",
);

/**
 * Public auth pages: real routes outside the shell, searchable but never in
 * the sidebar. Enforcement and sessions arrive in Phase 11.
 */
export const AUTH_PAGES: NavItem[] = [
  {
    slug: "login",
    label: "Sign in",
    href: "/login",
    icon: LogIn,
    status: "live",
    phase: "Phase 3",
    blurb: "Sign in to your workspace.",
  },
  {
    slug: "signup",
    label: "Create account",
    href: "/signup",
    icon: UserPlus,
    status: "live",
    phase: "Phase 3",
    blurb: "One account, every studio.",
  },
  {
    slug: "onboarding",
    label: "Onboarding",
    href: "/onboarding",
    icon: Settings,
    status: "live",
    phase: "Phase 3",
    blurb: "Profile, goals, channel, brand.",
  },
];

/** Full command-menu index: shell routes + public auth pages. */
export const COMMAND_INDEX: NavItem[] = [...SEARCHABLE_ROUTES, ...AUTH_PAGES];

/**
 * Intelligence deep links for the command menu. Real routes under
 * /intelligence; kept separate so the sidebar stays hierarchized.
 */
export const INTEL_PAGES: NavItem[] = [
  {
    slug: "intel-lab",
    label: "Idea Lab",
    href: "/intelligence/lab",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Analyze ideas, explore angles.",
  },
  {
    slug: "intel-audience",
    label: "Audience intelligence",
    href: "/intelligence/audience",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Structured audience profiles.",
  },
  {
    slug: "intel-strategy",
    label: "Strategy engine",
    href: "/intelligence/strategy",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Briefs as structured data.",
  },
  {
    slug: "intel-titles",
    label: "Title intelligence",
    href: "/intelligence/titles",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Checks, directions, approvals.",
  },
  {
    slug: "intel-hooks",
    label: "Hook intelligence",
    href: "/intelligence/hooks",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Weak openings, frameworks.",
  },
  {
    slug: "intel-retention",
    label: "Retention intelligence",
    href: "/intelligence/retention",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Structural outline risks.",
  },
  {
    slug: "intel-gaps",
    label: "Content gaps",
    href: "/intelligence/gaps",
    icon: Compass,
    status: "live",
    phase: "Phase 5",
    blurb: "Catalog vs topic prompts.",
  },
  {
    slug: "intel-research",
    label: "YouTube research",
    href: "/intelligence/research",
    icon: Compass,
    status: "live",
    phase: "Phase 13",
    blurb: "Live YouTube search with real view counts.",
  },
];

/** Script + storyboard studio routes for the command menu. */
export const STUDIO_PAGES: NavItem[] = [
  {
    slug: "studio-script",
    label: "Script Studio",
    href: "/studio/script",
    icon: PenLine,
    status: "live",
    phase: "Phase 6",
    blurb: "Write, structure, review scripts.",
  },
  {
    slug: "studio-storyboard",
    label: "Storyboard",
    href: "/studio/storyboard",
    icon: Columns3,
    status: "live",
    phase: "Phase 6",
    blurb: "Scenes from script sections.",
  },
  {
    slug: "studio-video",
    label: "Video Studio",
    href: "/studio/video",
    icon: Clapperboard,
    status: "live",
    phase: "Phase 8",
    blurb: "Timeline, preview, export prep.",
  },
  {
    slug: "studio-package",
    label: "Packaging Studio",
    href: "/studio/package",
    icon: Stamp,
    status: "live",
    phase: "Phase 9",
    blurb: "Thumbnail, SEO, repurposing.",
  },
];

/** Complete search index: shell + auth + intelligence + studios. */
export const FULL_COMMAND_INDEX: NavItem[] = [...COMMAND_INDEX, ...INTEL_PAGES, ...STUDIO_PAGES];
