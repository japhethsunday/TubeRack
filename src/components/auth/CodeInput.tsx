"use client";

import { useRef, useState } from "react";
import { cx } from "@/src/components/ui/cx";

/**
 * Six-box code entry. One real input sits over the boxes, so paste, SMS/email
 * autofill ("one-time-code") and screen readers all work; the boxes animate.
 */
export function CodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  state = "idle",
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  state?: "idle" | "error" | "success";
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const half = Math.ceil(length / 2);

  function set(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, length);
    onChange(next);
    if (next.length === length && next !== value) onComplete?.(next);
  }

  const cell = (i: number) => {
    const digit = value[i];
    const active = focused && !disabled && (i === value.length || (value.length === length && i === length - 1));
    return (
      <div
        key={i}
        data-active={active}
        data-filled={Boolean(digit)}
        className="otp-cell flex h-12 w-10 items-center justify-center rounded-xl border border-border bg-background/60 text-2xl font-semibold tabular-nums shadow-inner backdrop-blur sm:h-14 sm:w-12"
        style={state === "success" ? { animationDelay: `${i * 70}ms` } : undefined}
      >
        {digit ? (
          <span key={`${i}-${digit}`} className="otp-digit">{digit}</span>
        ) : active ? (
          <span className="otp-caret h-6 w-0.5 rounded bg-primary" />
        ) : null}
      </div>
    );
  };

  return (
    <div
      key={state === "error" ? `err-${value}` : "ok"}
      className={cx("relative mx-auto w-fit", state === "error" && "auth-shake otp-error", state === "success" && "otp-success")}
      onClick={() => ref.current?.focus()}
    >
      <div className="flex items-center gap-1.5 sm:gap-2" aria-hidden="true">
        {Array.from({ length: half }, (_, i) => cell(i))}
        <span className="mx-0.5 h-0.5 w-3 rounded bg-border" />
        {Array.from({ length: length - half }, (_, i) => cell(i + half))}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d*"
        maxLength={length}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={`${length}-digit code`}
        aria-invalid={state === "error" || undefined}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  );
}
