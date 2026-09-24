/**
 * JSON/JSONB handling for the Postgres driver.
 *
 * Call sites pass JSON columns either as objects or as pre-serialized JSON
 * strings. The driver's default serializer JSON.stringify()s whatever it
 * gets, so pre-serialized strings were stored double-encoded (a JSON
 * *string* holding the object). Clients then rejected the data and fell
 * back to empty device state ("project missing on my phone").
 *
 * serialize: pass JSON text through untouched; encode everything else.
 * parse: decode, and unwrap values that were stored double-encoded.
 */

function isJsonText(x: string): boolean {
  const t = x.trimStart()[0];
  if (t !== "{" && t !== "[") return false;
  try {
    JSON.parse(x);
    return true;
  } catch {
    return false;
  }
}

export function serializeJson(x: unknown): string {
  if (typeof x === "string" && isJsonText(x)) return x;
  return JSON.stringify(x, (_k, v) => (v === undefined ? null : v));
}

export function parseJson(x: string): unknown {
  const v: unknown = JSON.parse(x);
  return typeof v === "string" && isJsonText(v) ? JSON.parse(v) : v;
}

export const jsonType = { to: 114, from: [114, 3802], serialize: serializeJson, parse: parseJson };

/**
 * int8 (bigint) columns — file sizes, subscriber counts — come back from the
 * driver as strings by default, which client schemas reject. Every such
 * value in this app is far below 2^53, so plain numbers are exact.
 */
export const bigintType = {
  to: 20,
  from: [20],
  serialize: (x: unknown) => String(x),
  parse: (x: string) => {
    const n = Number(x);
    return Number.isSafeInteger(n) ? n : x;
  },
};

/**
 * Date-only columns (analytics entry dates, calendar days) stay the plain
 * "YYYY-MM-DD" strings the app uses. The driver default turns them into
 * midnight-UTC timestamps, which client schemas reject.
 */
export const dateOnlyType = {
  to: 1082,
  from: [1082],
  serialize: (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x)),
  parse: (x: string) => x,
};
