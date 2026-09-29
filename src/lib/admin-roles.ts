/** Admin team roles, shared by the server guard and the admin menu. Owners (ADMIN_EMAILS) can do everything. */
export type AdminRole = "owner" | "support" | "finance" | "operations";

export const ROLE_LABELS: Record<Exclude<AdminRole, "owner">, { label: string; blurb: string }> = {
  support: { label: "Support", blurb: "Users (view), support chats, inbox, generations, failed jobs" },
  finance: { label: "Finance", blurb: "Users (view), credits, bulk credits, revenue, plans, AI costs, affiliates, data export" },
  operations: { label: "Operations", blurb: "Users (view), generations, failed jobs, projects, feature switches, system, AI costs" },
};

export const ROLE_ACTIONS: Record<Exclude<AdminRole, "owner">, string[]> = {
  support: ["overview", "users.list", "users.view", "users.viewas", "support.", "inbox.", "usage.view", "jobs."],
  finance: ["overview", "users.list", "users.view", "credits.", "revenue.", "plans.", "costs.", "bulk.", "export.", "affiliates."],
  operations: ["overview", "users.list", "users.view", "users.viewas", "usage.view", "jobs.", "projects.view", "features.", "system", "costs."],
};

export function roleAllows(role: AdminRole, action: string): boolean {
  if (role === "owner") return true;
  return ROLE_ACTIONS[role].some((p) => (p.endsWith(".") ? action.startsWith(p) : action === p));
}
