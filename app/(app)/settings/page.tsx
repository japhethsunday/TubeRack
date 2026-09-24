import { Tabs } from "@/src/components/ui/Tabs";
import { VerifyBanner } from "@/src/components/auth/VerifyBanner";
import { ProfilePanel, SecurityPanel, SessionsPanel } from "@/src/components/settings/account-panels";
import { PreferencesPanel, NotificationsPanel } from "@/src/components/settings/preference-panels";
import { WorkspacePanel, BillingPanel, DataPanel } from "@/src/components/settings/workspace-panels";

const VALID = [
  "profile",
  "preferences",
  "notifications",
  "security",
  "sessions",
  "workspace",
  "billing",
  "data",
] as const;

/** Account settings: profile, security, sessions, workspace, billing, data. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initial = (VALID as readonly string[]).includes(tab ?? "") ? (tab as string) : "profile";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-text">
          Your account, your preferences, and your workspace — each in its place.
        </p>
      </div>

      <VerifyBanner />

      <Tabs
        defaultId={initial}
        tabs={[
          { id: "profile", label: "Profile", content: <ProfilePanel /> },
          { id: "preferences", label: "Preferences", content: <PreferencesPanel /> },
          { id: "notifications", label: "Notifications", content: <NotificationsPanel /> },
          { id: "security", label: "Security", content: <SecurityPanel /> },
          { id: "sessions", label: "Sessions", content: <SessionsPanel /> },
          { id: "workspace", label: "Workspace", content: <WorkspacePanel /> },
          { id: "billing", label: "Billing", content: <BillingPanel /> },
          { id: "data", label: "Data", content: <DataPanel /> },
        ]}
      />
    </div>
  );
}
