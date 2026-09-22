import type { PreviewIdentity, WorkspaceSummary } from "@/src/lib/auth/types";

/**
 * Explicitly static preview identity. Rendered only beside "Preview" labels.
 * Real identity arrives with sessions in Phase 11.
 */
export const PREVIEW_IDENTITY: PreviewIdentity = {
  name: "Preview User",
  email: "preview@example.com",
  workspace: "Preview workspace",
  channel: "Preview channel",
};

export const PREVIEW_WORKSPACE: WorkspaceSummary = {
  id: "ws_preview",
  name: "Preview workspace",
  slug: "preview-workspace",
  role: "Owner (preview)",
  plan: "No plan — billing arrives Phase 10–11",
};
