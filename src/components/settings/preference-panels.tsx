"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Select } from "@/src/components/ui/fields";
import { Switch } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { ThemeToggle } from "@/src/components/shell/ThemeToggle";
import type { NotificationKey, NotificationPreference } from "@/src/lib/auth/types";

export const NOTIFICATION_PREFS: NotificationPreference[] = [
  { key: "generation-completed", label: "Generation completed", blurb: "Image, voice, and music jobs finish." },
  { key: "generation-failed", label: "Generation failed", blurb: "Retries needed, with the reason." },
  { key: "render-completed", label: "Render completed", blurb: "Video renders finish or fail." },
  { key: "project-activity", label: "Project activity", blurb: "Comments and stage changes (Phase 4+)." },
  { key: "publishing-events", label: "Publishing events", blurb: "Scheduled releases go live or fail." },
  { key: "account-security", label: "Account & security", blurb: "Sign-ins, password and email changes." },
  { key: "product-updates", label: "Product updates", blurb: "Occasional feature announcements." },
];

export function PreferencesPanel() {
  const [saved, setSaved] = useState(false);
  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="Appearance" className="rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold">Appearance</h3>
        <div className="mt-3 flex items-center gap-3">
          <ThemeToggle />
          <p className="text-sm text-muted-text">
            Light / dark applies immediately on this device — the one preference
            that is real today.
          </p>
        </div>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
        className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2"
        aria-label="General preferences"
      >
        <Select label="Language" defaultValue="English">
          <option>English</option>
          <option disabled>More languages — Phase 4+</option>
        </Select>
        <Select label="Timezone" defaultValue="UTC">
          <option>UTC</option>
          <option>America/New_York</option>
          <option>Europe/Berlin</option>
          <option>Africa/Lagos</option>
          <option>Asia/Tokyo</option>
        </Select>
        <Select label="Editor default aspect" defaultValue="16:9">
          <option>16:9</option>
          <option>9:16</option>
          <option>1:1</option>
        </Select>
        <Select label="AI default tone" defaultValue="Helpful and direct">
          <option>Helpful and direct</option>
          <option>Playful and fast</option>
          <option>Calm and cinematic</option>
        </Select>
        <div className="sm:col-span-2">
          <Button type="submit">Save preferences</Button>
          {saved && (
            <div className="mt-4">
              <AuthBoundaryNotice
                feature="Preference sync"
                validated="Preferences read correctly and the theme applied locally."
              />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

export function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Record<NotificationKey, boolean>>({
    "generation-completed": true,
    "generation-failed": true,
    "render-completed": true,
    "project-activity": false,
    "publishing-events": true,
    "account-security": true,
    "product-updates": false,
  });

  return (
    <div className="max-w-3xl space-y-4">
      <Alert tone="info" title="Preferences are preview-only">
        Toggles work locally so the UX can be reviewed. Alerts activate as each
        feature ships, and choices are saved with account sync (Phase 11).
      </Alert>
      <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Notification preferences">
        {NOTIFICATION_PREFS.map((n) => (
          <li key={n.key} className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 size-4 shrink-0 text-muted-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-xs text-muted-text">{n.blurb}</p>
              </div>
            </div>
            <Switch
              label={`Notify: ${n.label}`}
              checked={prefs[n.key]}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, [n.key]: v }))}
            />
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-xs text-muted-text">
        Every option maps to a real future event — none are decorative.
        <Badge tone="preview">Phase 11</Badge>
      </p>
    </div>
  );
}
