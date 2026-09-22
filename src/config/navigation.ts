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
        href: "/projects/preview?stage=strategy",
        icon: Compass,
        status: "preview",
        phase: "Phase 5",
        blurb: "Opportunities, angles, positioning.",
      },
      {
        slug: "research",
        label: "Research",
        href: "/projects/preview?stage=research",
        icon: FlaskConical,
        status: "preview",
        phase: "Phase 5",
        blurb: "Sources, evidence, notes.",
      },
      {
        slug: "script",
        label: "Script Studio",
        href: "/projects/preview?stage=script",
        icon: PenLine,
        status: "preview",
        phase: "Phase 6",
        blurb: "Hooks, scripts, retention.",
      },
      {
        slug: "storyboard",
        label: "Storyboard",
        href: "/projects/preview?stage=storyboard",
        icon: Columns3,
        status: "preview",
        phase: "Phase 6",
        blurb: "Scenes, pacing, visuals plan.",
      },
      {
        slug: "assets",
        label: "Assets",
        href: "/projects/preview?stage=assets",
        icon: Image,
        status: "preview",
        phase: "Phase 7",
        blurb: "Images, footage, generations.",
      },
      {
        slug: "voice",
        label: "Voice",
        href: "/projects/preview?stage=audio",
        icon: Mic,
        status: "preview",
        phase: "Phase 7",
        blurb: "Narration, voices, captions.",
      },
      {
        slug: "music",
        label: "Music",
        href: "/projects/preview?stage=audio",
        icon: Music,
        status: "preview",
        phase: "Phase 7",
        blurb: "Tracks, SFX, mix.",
      },
      {
        slug: "video",
        label: "Video Studio",
        href: "/projects/preview?stage=video",
        icon: Clapperboard,
        status: "preview",
        phase: "Phase 8",
        blurb: "Timeline, edit, render.",
      },
      {
        slug: "thumbnail",
        label: "Thumbnail Studio",
        href: "/projects/preview?stage=thumbnail",
        icon: Stamp,
        status: "preview",
        phase: "Phase 9",
        blurb: "Thumbnails, variants, tests.",
      },
      {
        slug: "seo",
        label: "SEO",
        href: "/projects/preview?stage=seo",
        icon: SearchCheck,
        status: "preview",
        phase: "Phase 9",
        blurb: "Titles, descriptions, tags.",
      },
      {
        slug: "repurposing",
        label: "Repurposing",
        href: "/projects/preview?stage=publishing",
        icon: Repeat2,
        status: "preview",
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
        href: "/dashboard",
        icon: ChartLine,
        status: "planned",
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
