/**
 * Keeps people's identities out of AI prompts. Email addresses and known
 * names are swapped for stable placeholders before text goes to the model
 * (user_1@hidden.example, Person_1) and swapped back in what comes out, so
 * look-ups, actions and replies still reach the right person.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const TOKEN = /\buser_\d+@hidden\.example\b|\bPerson_\d+\b/g;
/** Keys whose string values are people's names in look-up data. */
const NAME_KEYS = new Set(["name", "fromName", "from_name", "userName", "fullName"]);
/** Our own addresses are not personal data and help the model reason. */
const KEEP = /@recktube\.xyz$/i;

/** Luhn checksum: real card numbers pass it, most other long numbers don't. */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * One-way: card numbers and phone numbers people type never reach the AI.
 * Conservative on purpose so dates, times, amounts and IDs stay untouched.
 */
export function hideNumbers(s: string): string {
  // Card numbers: 13–19 digits, optionally in groups, passing the Luhn check.
  let out = s.replace(/(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? "[card number]" : m;
  });
  // Phone numbers: international (+234 801 234 5678), local with a leading 0 (08012345678, 0801-234-5678)
  // or (555) 123-4567. Needs 9–15 digits.
  out = out.replace(/(?<![\w+-])(?:\+\d{1,3}[ .-]?|0)(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4}(?![\w-])|(?<![\w-])\(\d{3}\) ?\d{3}[ .-]\d{4}(?![\w-])/g, (m) => {
    const n = m.replace(/\D/g, "").length;
    return n >= 9 && n <= 15 ? "[phone number]" : m;
  });
  return out;
}

export class Masker {
  private toToken = new Map<string, string>();
  private toReal = new Map<string, string>();
  private emails = 0;
  private names = 0;
  /** Names that stay visible (e.g. the founder signing a letter). */
  private keep = new Set<string>();

  constructor(keepNames: string[] = []) {
    for (const n of keepNames) if (n.trim()) this.keep.add(n.trim());
  }

  private token(real: string, kind: "email" | "name"): string {
    const key = kind === "email" ? real.toLowerCase() : real;
    const hit = this.toToken.get(key);
    if (hit) return hit;
    const t = kind === "email" ? `user_${++this.emails}@hidden.example` : `Person_${++this.names}`;
    this.toToken.set(key, t);
    this.toReal.set(t, kind === "email" ? real.toLowerCase() : real);
    return t;
  }

  /** Remember a person's name so it is hidden wherever it appears. */
  addName(name: unknown): void {
    if (typeof name !== "string") return;
    const n = name.trim();
    // Very short strings would match inside ordinary words.
    if (n.length >= 3 && !this.keep.has(n) && !/^(null|undefined|unknown)$/i.test(n)) this.token(n, "name");
  }

  /** Collect names from look-up data (values under name-like keys), any depth. */
  learn(value: unknown, depth = 0): void {
    if (depth > 8 || value === null || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (NAME_KEYS.has(k)) this.addName(v);
      else this.learn(v, depth + 1);
    }
  }

  text(s: string): string {
    let out = s.replace(EMAIL, (m) => (KEEP.test(m) || /@hidden\.example$/i.test(m) ? m : this.token(m, "email")));
    out = hideNumbers(out);
    // Longest names first, so "Ada Lovelace" wins over "Ada".
    const names = [...this.toToken.entries()].filter(([, t]) => t.startsWith("Person_")).sort((a, b) => b[0].length - a[0].length);
    for (const [real, t] of names) {
      const esc = real.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Whole words only ("Sam" never touches "Sample").
      out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${esc}(?![\\p{L}\\p{N}_])`, "gu"), t);
    }
    return out;
  }

  /** Mask every string inside a JSON-like value (learns names first). */
  value<T>(v: T): T {
    this.learn(v);
    return this.walk(v, (s) => this.text(s)) as T;
  }

  unmaskText(s: string): string {
    return s.replace(TOKEN, (t) => this.toReal.get(t) ?? t);
  }

  unmask<T>(v: T): T {
    return this.walk(v, (s) => this.unmaskText(s)) as T;
  }

  private walk(v: unknown, f: (s: string) => string, depth = 0): unknown {
    if (depth > 10) return v;
    if (typeof v === "string") return f(v);
    if (Array.isArray(v)) return v.map((x) => this.walk(x, f, depth + 1));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, this.walk(x, f, depth + 1)]));
    return v;
  }
}
