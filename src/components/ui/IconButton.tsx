import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

export function IconButton({
  icon: Icon,
  label,
  size = "md",
  className,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex items-center justify-center rounded-lg text-muted-text",
        "transition-[color,background-color,transform] duration-200 ease-out hover:-translate-y-px hover:bg-muted hover:text-foreground active:scale-90",
        "active:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} aria-hidden="true" />
    </button>
  );
}
