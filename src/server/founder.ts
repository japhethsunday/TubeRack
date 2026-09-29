import { getDb } from "@/src/server/db";
import { adminEmails } from "@/src/server/admin";

/**
 * Who signs mail sent from founder@: the owner's own name from their
 * Recktube account (the first ADMIN_EMAILS address), as Founder & CEO.
 */

export const FOUNDER_TITLE = "Founder & CEO, Recktube";

export interface Founder {
  name: string;
  first: string;
  title: string;
  /** Sign-off block for the end of an email. */
  signoff: string;
  /** Display name in the From line. */
  fromName: string;
}

let cached: { at: number; value: Founder } | null = null;

export function founderFrom(name: string): Founder {
  const clean = name.replace(/[<>"\r\n]/g, "").trim().slice(0, 60);
  if (!clean) return { name: "", first: "", title: FOUNDER_TITLE, signoff: `Warm regards,\n\nThe Founder\n${FOUNDER_TITLE}`, fromName: "Recktube Founder" };
  return { name: clean, first: clean.split(/\s+/)[0], title: FOUNDER_TITLE, signoff: `Warm regards,\n\n${clean}\n${FOUNDER_TITLE}`, fromName: clean };
}

export async function founder(): Promise<Founder> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  let name = "";
  try {
    const db = getDb();
    const owner = adminEmails()[0];
    if (db && owner) {
      const [u] = await db`SELECT name FROM users WHERE lower(email) = ${owner} AND deleted_at IS NULL LIMIT 1`;
      name = String(u?.name ?? "");
    }
  } catch {
    name = "";
  }
  const value = founderFrom(name);
  cached = { at: Date.now(), value };
  return value;
}
