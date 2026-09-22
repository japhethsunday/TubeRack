import { cx } from "@/src/components/ui/cx";

const sizes = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-12 text-base" } as const;

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-foreground",
        sizes[size],
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
