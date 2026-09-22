import { AppShell } from "@/src/components/shell/AppShell";
import { WorkspaceProviders } from "@/app/(app)/providers";

/** Authenticated-app route group shell with device-local workspace state. */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProviders>
      <AppShell>{children}</AppShell>
    </WorkspaceProviders>
  );
}
