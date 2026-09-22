import type { InputHTMLAttributes } from "react";
import { cx } from "@/src/components/ui/cx";

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
}

function Hint({ id, hint, error }: { id?: string; hint?: string; error?: string }) {
  if (error)
    return (
      <p id={id} role="alert" className="text-xs text-destructive">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={id} className="text-xs text-muted-text">
        {hint}
      </p>
    );
  return null;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-disabled-text transition-colors duration-150 hover:border-muted-text/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-text aria-[invalid=true]:border-destructive";

export function Input({
  label,
  hint,
  error,
  id,
  className,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const descId = `${fieldId}-desc`;
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descId : undefined}
        className={inputClass}
        {...rest}
      />
      <Hint id={descId} hint={hint} error={error} />
    </div>
  );
}

export function Textarea({
  label,
  hint,
  error,
  id,
  className,
  rows = 4,
  ...rest
}: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const descId = `${fieldId}-desc`;
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descId : undefined}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-disabled-text transition-colors duration-150 hover:border-muted-text/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-text aria-[invalid=true]:border-destructive"
        {...rest}
      />
      <Hint id={descId} hint={hint} error={error} />
    </div>
  );
}

export function Select({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: FieldProps & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const descId = `${fieldId}-desc`;
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <select
        id={fieldId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hint || error ? descId : undefined}
        className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground transition-colors duration-150 hover:border-muted-text/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-text aria-[invalid=true]:border-destructive"
        {...rest}
      >
        {children}
      </select>
      <Hint id={descId} hint={hint} error={error} />
    </div>
  );
}
