"use client";

import { sanitizeSvg } from "@/src/lib/security/svg";
import { cx } from "@/src/components/ui/cx";

/**
 * A composed thumbnail drawn inline. An SVG shown through <img> can't load
 * the photo it references from storage, so it would appear as text only.
 */
export function SvgThumb({ svg, label, className }: { svg: string; label: string; className?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cx("aspect-video overflow-hidden [&>svg]:block [&>svg]:h-full [&>svg]:w-full", className)}
      dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
    />
  );
}
