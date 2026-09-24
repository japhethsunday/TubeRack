"use client";

import { useState } from "react";
import {
  User,
  Settings,
  CreditCard,
  ShieldCheck,
  CircleHelp,
  LogOut,
  Plus,
  Check,
} from "lucide-react";
import { Avatar } from "@/src/components/ui/Avatar";
import { Drawer, Modal } from "@/src/components/ui/overlays";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { signOut, type SessionInfo } from "@/src/components/auth/useSession";

const MENU_LINKS = [
  { href: "/settings?tab=profile", icon: User, label: "Profile", blurb: "Name, email, username" },
  { href: "/settings?tab=security", icon: ShieldCheck, label: "Security", blurb: "Password, 2FA, recovery" },
  { href: "/settings?tab=billing", icon: CreditCard, label: "Billing", blurb: "Plan, credits, invoices" },
  { href: "/settings", icon: Settings, label: "All settings", blurb: "Preferences, sessions, data" },
];

/**
 * Account menu: real identity from the session, workspace, settings,
 * and a working sign-out (revokes the server session).
 */
export function UserMenu({ user, onClose }: { user: SessionInfo | null; onClose: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = user?.name || "Your account";
  const workspaceName = user?.name ? `${user.name}'s workspace` : "Workspace";

  return (
    <>
      <Drawer title="Account" description="Identity, workspace, and session controls." onClose={onClose}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-text">{user?.email ?? ""}</p>
            </div>
          </div>

          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-disabled-text">
              Workspace
            </p>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-sm">
                <Avatar name={workspaceName} size="sm" />
                <span className="flex-1 truncate font-medium">{workspaceName}</span>
                <Check className="size-4 text-success" aria-label="Current workspace" />
              </li>
              <li>
                <span
                  aria-disabled="true"
                  title="Multiple workspaces are not available yet"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-text opacity-60"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New workspace — coming soon
                </span>
              </li>
            </ul>
          </div>

          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-disabled-text">
              Account
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {MENU_LINKS.map((l) => (
                <li key={l.href + l.label}>
                  <a
                    href={l.href}
                    onClick={onClose}
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted"
                  >
                    <l.icon className="size-4 text-muted-text" aria-hidden="true" />
                    <span className="flex-1">{l.label}</span>
                    <span className="text-xs text-muted-text">{l.blurb}</span>
                  </a>
                </li>
              ))}
              <li>
                <a
                  href="/verify-email"
                  onClick={onClose}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted"
                >
                  <CircleHelp className="size-4 text-muted-text" aria-hidden="true" />
                  <span className="flex-1">Verify email</span>
                  {user?.email_verified_at ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Unverified</Badge>}
                </a>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => setLoggingOut(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted"
          >
            <LogOut className="size-4 text-muted-text" aria-hidden="true" />
            Log out
          </button>
        </div>
      </Drawer>

      {loggingOut && (
        <Modal title="Log out?" description="End the session on this device." onClose={() => setLoggingOut(false)}>
          <p className="text-sm text-muted-text">
            Your projects stay saved. You can sign back in anytime.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLoggingOut(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true);
                void signOut();
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Log out
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
