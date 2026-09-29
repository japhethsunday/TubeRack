import { z } from "zod";

/**
 * Parse a synced bundle without letting one bad item hide everything else.
 * The whole bundle is tried first; if it fails, each list (and each keyed
 * record) is checked item by item and only the items that don't fit are
 * dropped. The top-level shape (e.g. version) must still match.
 */
export function lenientParse<T>(schema: z.ZodObject<z.ZodRawShape>, data: unknown, label: string): { ok: true; data: T; dropped: number } | { ok: false; error: z.ZodError } {
  const full = schema.safeParse(data);
  if (full.success) return { ok: true, data: full.data as T, dropped: 0 };
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: full.error };
  const input = data as Record<string, unknown>;
  const cleaned: Record<string, unknown> = { ...input };
  let dropped = 0;
  for (const [key, field] of Object.entries(schema.shape)) {
    const value = input[key];
    if (field instanceof z.ZodArray && Array.isArray(value)) {
      const item = field.element as z.ZodType;
      cleaned[key] = value.filter((v) => {
        const ok = item.safeParse(v).success;
        if (!ok) dropped++;
        return ok;
      });
    } else if (field instanceof z.ZodRecord && value && typeof value === "object" && !Array.isArray(value)) {
      const item = field.valueType as z.ZodType;
      cleaned[key] = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).filter(([, v]) => {
          const ok = item.safeParse(v).success;
          if (!ok) dropped++;
          return ok;
        }),
      );
    }
  }
  const retry = schema.safeParse(cleaned);
  if (!retry.success) return { ok: false, error: full.error };
  if (dropped) console.error(`${label}: skipped ${dropped} item(s) that couldn't be read; everything else loaded.`);
  return { ok: true, data: retry.data as T, dropped };
}
