import { getDb } from "@/src/server/db";

/**
 * Audit logging. Best-effort and silent on failure — an audit write must
 * never break the operation it records. Never logs secrets or tokens.
 */

export interface AuditEntry {
  workspaceId?: string;
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

const SECRET_KEYS = new Set(["password", "token", "secret", "key", "hash", "authorization"]);

export function scrubMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = scrubMetadata(value as Record<string, unknown>);
    } else {
      out[key] = typeof value === "string" && value.length > 500 ? `${value.slice(0, 500)}…` : value;
    }
  }
  return out;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;
    await db`
      INSERT INTO audit_log (workspace_id, user_id, action, resource_type, resource_id, metadata)
      VALUES (${entry.workspaceId ?? null}, ${entry.userId ?? null}, ${entry.action}, ${entry.resourceType ?? null}, ${entry.resourceId ?? null}, ${JSON.stringify(scrubMetadata(entry.metadata ?? {}))})
    `;
  } catch {
    // Audit is observability, not control flow.
  }
}
