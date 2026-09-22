import type { InputHTMLAttributes } from "react";
import { cx } from "@/src/components/ui/cx";

const box =
  "size-4 shrink-0 cursor-pointer appearance-none rounded border border-border bg-surface transition-colors duration-150 checked:border-primary checked:bg-primary hover:border-muted-text disabled:cursor-not-allowed disabled:opacity-50";

export function Checkbox({
  label,
  className,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-foreground",
        className,
      )}
    >
      <input type="checkbox" className={cx(box, "rounded")} {...rest} />
      {label}
    </label>
  );
}

export function Radio({
  label,
  className,
  ...rest
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-foreground",
        className,
      )}
    >
      <input type="radio" className={cx(box, "rounded-full")} {...rest} />
      {label}
    </label>
  );
}

export function Switch({
  label,
  checked,
  onCheckedChange,
  className,
  ...rest
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "checked" | "onChange" | "type">) {
  return (
    <label
      className={cx(
        "inline-flex cursor-pointer items-center gap-2 text-sm text-foreground",
        className,
      )}
    >
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
        {...rest}
      />
      <span
        aria-hidden="true"
        className="inline-flex h-6 w-11 items-center rounded-full bg-border px-0.5 transition-colors duration-150 peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-50 peer-checked:[&>span]:translate-x-5"
      >
        <span className="size-5 rounded-full bg-surface shadow transition-transform duration-150" />
      </span>
      {label}
    </label>
  );
}
