import type { ReactNode } from "react";
import { spacing } from "@/src/design/tokens";
import { cx } from "@/src/components/ui/cx";

export function Card({
  title,
  body,
  children,
  className,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cx(
        "rounded-xl border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
        spacing.cardPadding,
        className,
      )}
    >
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-text">{body}</p>
      {children}
    </section>
  );
}
