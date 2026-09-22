import { AppShell } from "@/src/components/shell/AppShell";

/** Authenticated-app route group shell. No auth yet (Phase 3) — layout only. */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
