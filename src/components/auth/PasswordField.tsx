"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Password input with an accessible show/hide toggle. */
export function PasswordField({
  label,
  hint,
  error,
  id,
  autoComplete,
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  autoComplete?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  const fieldId = id ?? `pw-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const descId = `${fieldId}-desc`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={fieldId}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hint || error ? descId : undefined}
          className="h-10 w-full rounded-lg border border-border bg-surface px-3 pr-11 text-sm placeholder:text-disabled-text hover:border-muted-text/50 aria-[invalid=true]:border-destructive"
          {...rest}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-text hover:bg-muted hover:text-foreground"
        >
          {shown ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={descId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={descId} className="text-xs text-muted-text">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
