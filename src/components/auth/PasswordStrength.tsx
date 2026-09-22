"use client";

import { passwordScore, STRENGTH_HINTS } from "@/src/lib/auth/password";
import { cx } from "@/src/components/ui/cx";

/** Live password feedback: meter + label + hints. Updates as the user types. */
export function PasswordStrength({ value }: { value: string }) {
  const { score, label } = passwordScore(value);
  const tones = ["bg-destructive", "bg-destructive", "bg-warning", "bg-info", "bg-success"];
  return (
    <div aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 gap-1" role="img" aria-label={`Password strength: ${value ? label : "empty"}`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cx(
                "h-1.5 flex-1 rounded-full",
                value && i < score ? tones[score] : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="text-xs font-medium text-muted-text">{value ? label : "—"}</span>
      </div>
      {value && score < 3 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-text" aria-label="How to strengthen">
          {STRENGTH_HINTS.slice(0, 4 - score).map((h) => (
            <li key={h}>· {h}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
