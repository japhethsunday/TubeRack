/**
 * TubeRack design tokens — Phase 2 source of truth.
 * Components must consume these (via Tailwind `bg-background`-style utilities
 * mapped in globals.css, or these constants) — never hard-code colors.
 */

export const SEMANTIC_COLOR_KEYS = [
  "background",
  "foreground",
  "surface",
  "elevated",
  "muted",
  "border",
  "primary",
  "primaryForeground",
  "secondary",
  "success",
  "warning",
  "destructive",
  "info",
  "mutedText",
  "disabledText",
] as const;

export type SemanticColorKey = (typeof SEMANTIC_COLOR_KEYS)[number];

export type SemanticPalette = Record<SemanticColorKey, string>;

export const lightPalette: SemanticPalette = {
  background: "#fafafa",
  foreground: "#18181b",
  surface: "#ffffff",
  elevated: "#ffffff",
  muted: "#f4f4f5",
  border: "#e4e4e7",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  success: "#15803d",
  warning: "#b45309",
  destructive: "#be123c",
  info: "#1d4ed8",
  mutedText: "#52525b",
  disabledText: "#a1a1aa",
};

export const darkPalette: SemanticPalette = {
  background: "#09090b",
  foreground: "#fafafa",
  surface: "#101013",
  elevated: "#18181b",
  muted: "#1c1c21",
  border: "#27272a",
  primary: "#fafafa",
  primaryForeground: "#09090b",
  secondary: "#1c1c21",
  success: "#4ade80",
  warning: "#fbbf24",
  destructive: "#fb7185",
  info: "#93c5fd",
  mutedText: "#a1a1aa",
  disabledText: "#52525b",
};

/** Allowed spacing steps (Tailwind scale units). Components stay on-scale. */
export const SPACING_SCALE = [0, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24] as const;

/** Semantic spacing: page/section/card/component gaps. Values are Tailwind classes. */
export const spacing = {
  pageX: "px-4 sm:px-6 lg:px-8",
  pageY: "py-8 lg:py-12",
  sectionGap: "space-y-8",
  cardPadding: "p-5 sm:p-6",
  componentGap: "gap-3",
  formGap: "space-y-4",
  navGap: "gap-1",
  editorGap: "gap-4",
} as const;

export const radius = {
  sm: "0.375rem",
  md: "0.5rem",
  lg: "0.75rem",
  xl: "0.875rem",
  full: "9999px",
} as const;

export const TYPE_VARIANTS = [
  "display",
  "page",
  "section",
  "card",
  "body",
  "secondary",
  "caption",
  "label",
  "code",
] as const;

export type TypeVariant = (typeof TYPE_VARIANTS)[number];

/** Tailwind class per typography variant. Hierarchy through size/weight, not decoration. */
export const typeClasses: Record<TypeVariant, string> = {
  display: "text-4xl font-semibold tracking-tight text-foreground sm:text-5xl",
  page: "text-2xl font-semibold tracking-tight text-foreground sm:text-3xl",
  section: "text-lg font-semibold tracking-tight text-foreground",
  card: "text-sm font-semibold text-foreground",
  body: "text-sm leading-relaxed text-foreground",
  secondary: "text-sm leading-relaxed text-muted-text",
  caption: "text-xs leading-relaxed text-muted-text",
  label: "text-xs font-medium text-foreground",
  code: "font-mono text-xs leading-relaxed text-foreground",
};
