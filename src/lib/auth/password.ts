export type StrengthLabel = "Too weak" | "Weak" | "Fair" | "Strong";

export interface Strength {
  score: number; // 0–4
  label: StrengthLabel;
}

/**
 * Real client-side password feedback. Measures variety + length only —
 * never estimated crack time, never sent anywhere.
 */
export function passwordScore(value: string): Strength {
  let points = 0;
  if (value.length >= 8) points += 1;
  if (value.length >= 12) points += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) points += 1;
  if (/\d/.test(value)) points += 1;
  if (/[^a-zA-Z0-9]/.test(value)) points += 1;
  const score = Math.min(4, points);
  const label: StrengthLabel =
    score <= 1 ? "Too weak" : score === 2 ? "Weak" : score === 3 ? "Fair" : "Strong";
  return { score, label };
}

export const STRENGTH_HINTS = [
  "Use at least 8 characters.",
  "Mix upper- and lowercase letters.",
  "Add numbers or symbols.",
  "Longer passphrases beat complex short ones.",
] as const;
