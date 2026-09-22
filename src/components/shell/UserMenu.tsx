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
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { PREVIEW_IDENTITY, PREVIEW_WORKSPACE } from "@/src/config/identity";

const MENU_LINKS = [
  { href: "/settings?tab=profile", icon: User, label: "Profile", blurb: "Name, email, username" },
  { href: "/settings?tab=security", icon: ShieldCheck, label: "Security", blurb: "Password, 2FA, recovery" },
  { href: "/settings?tab=billing", icon: CreditCard, label: "Billing", blurb: "Plan, credits, invoices" },
  { href: "/settings", icon: Settings, label: "All settings", blurb: "Preferences, sessions, data" },
];

/**
 * Polished account menu: identity, workspace, settings, help, logout.
 * Identity is labeled preview; logout discloses the no-session boundary
 * instead of faking a sign-out.
 */
export function UserMenu({ onClose }: { onClose: () => void }) {
  const [loggingOut, setLoggingOut] = useState(false);

  return (
    <>
      <Drawer title="Account" description="Identity, workspace, and session controls." onClose={onClose}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Avatar name={PREVIEW_IDENTITY.name} />
            <div className="min-w-0">
              <p className="flex items-center gap-2 truncate text-sm font-medium">
                {PREVIEW_IDENTITY.name}
                <Badge tone="preview">Preview</Badge>
              </p>
              <p className="truncate text-xs text-muted-text">
                {PREVIEW_IDENTITY.email} — no session yet
              </p>
            </div>
          </div>

          <div>
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-disabled-text">
              Workspace
            </p>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2 text-sm">
                <Avatar name={PREVIEW_WORKSPACE.name} size="sm" />
                <span className="flex-1 truncate font-medium">{PREVIEW_WORKSPACE.name}</span>
                <Check className="size-4 text-success" aria-label="Current workspace" />
              </li>
              <li>
                <span
                  aria-disabled="true"
                  title="Workspaces arrive in Phase 4"
                  className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-text opacity-60"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New workspace — Phase 4
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
                  <Badge tone="warn">Unverified</Badge>
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
          <AuthBoundaryNotice
            feature="Logout"
            validated="Logout intent confirmed."
          />
          <p className="mt-3 text-sm text-muted-text">
            There is no session to end yet, so you stay exactly where you are.
            Real sign-out — which returns you to the login screen — ships with
            server sessions in Phase 11.
          </p>
        </Modal>
      )}
    </>
  );
}
