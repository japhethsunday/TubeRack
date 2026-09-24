/**
 * Tolerant JSON-object extraction for LLM output: strips code fences and
 * surrounding prose, removes trailing commas, and — as a last resort —
 * repairs a reply that was cut off mid-way (closes the open string and
 * brackets, dropping the incomplete last element).
 */

function stripTrailingCommas(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}

function tryParse(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Close a truncated JSON document; returns null if it can't be made valid. */
export function repairTruncated(s: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // Index just after the last point where the document was structurally complete.
  let lastSafe = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") {
      stack.pop();
      lastSafe = i + 1;
    } else if (c === ",") lastSafe = i;
  }
  if (stack.length === 0 && !inString) return s;
  if (lastSafe <= 0) return null;
  // Cut back to the last complete element, then close every open bracket.
  const head = s.slice(0, lastSafe).replace(/,\s*$/, "");
  const reopened: string[] = [];
  inString = false;
  escaped = false;
  for (const c of head) {
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") reopened.push(c === "{" ? "}" : "]");
    else if (c === "}" || c === "]") reopened.pop();
  }
  return head + reopened.reverse().join("");
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const direct = tryParse(raw) ?? tryParse(stripTrailingCommas(raw));
  if (direct) return direct;
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const end = raw.lastIndexOf("}");
  if (end > start) {
    const slice = raw.slice(start, end + 1);
    const parsed = tryParse(slice) ?? tryParse(stripTrailingCommas(slice));
    if (parsed) return parsed;
  }
  const repaired = repairTruncated(raw.slice(start));
  return repaired ? tryParse(stripTrailingCommas(repaired)) : null;
}
