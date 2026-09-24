"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Select } from "@/src/components/ui/fields";
import { Switch } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { ThemeToggle } from "@/src/components/shell/ThemeToggle";
import type { NotificationKey, NotificationPreference } from "@/src/lib/auth/types";

export const NOTIFICATION_PREFS: NotificationPreference[] = [
  { key: "generation-completed", label: "Generation completed", blurb: "Image, voice, and music jobs finish." },
  { key: "generation-failed", label: "Generation failed", blurb: "Retries needed, with the reason." },
  { key: "render-completed", label: "Render completed", blurb: "Video renders finish or fail." },
  { key: "project-activity", label: "Project activity", blurb: "Stage changes and project updates." },
  { key: "publishing-events", label: "Publishing events", blurb: "Scheduled releases go live or fail." },
  { key: "account-security", label: "Account & security", blurb: "Sign-ins, password and email changes." },
  { key: "product-updates", label: "Product updates", blurb: "Occasional feature announcements." },
];

const PREFS_KEY = "tuberack.prefs.v1";

interface StoredPrefs {
  general?: Record<string, string>;
  notifications?: Partial<Record<NotificationKey, boolean>>;
}

function readPrefs(): StoredPrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as StoredPrefs;
  } catch {
    return {};
  }
}

function writePrefs(patch: StoredPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...patch }));
  } catch {
    // Storage blocked (private mode): choices last for this session.
  }
}

const GENERAL_DEFAULTS: Record<string, string> = {
  timezone: "UTC",
  aspect: "16:9",
  tone: "Helpful and direct",
};

export function PreferencesPanel() {
  const [saved, setSaved] = useState(false);
  const [general, setGeneral] = useState<Record<string, string>>(GENERAL_DEFAULTS);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate saved choices from this device.
    setGeneral({ ...GENERAL_DEFAULTS, ...(readPrefs().general ?? {}) });
  }, []);
  const set = (key: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setGeneral((g) => ({ ...g, [key]: e.target.value }));
    setSaved(false);
  };
  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="Appearance" className="rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold">Appearance</h3>
        <div className="mt-3 flex items-center gap-3">
          <ThemeToggle />
          <p className="text-sm text-muted-text">
            Light / dark applies immediately on this device.
          </p>
        </div>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          writePrefs({ general });
          setSaved(true);
        }}
        className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2"
        aria-label="General preferences"
      >
        <Select label="Timezone" value={general.timezone} onChange={set("timezone")}>
          <option>UTC</option>
          <option>America/New_York</option>
          <option>Europe/Berlin</option>
          <option>Africa/Lagos</option>
          <option>Asia/Tokyo</option>
        </Select>
        <Select label="Editor default aspect" value={general.aspect} onChange={set("aspect")}>
          <option>16:9</option>
          <option>9:16</option>
          <option>1:1</option>
        </Select>
        <Select label="AI default tone" value={general.tone} onChange={set("tone")}>
          <option>Helpful and direct</option>
          <option>Playful and fast</option>
          <option>Calm and cinematic</option>
        </Select>
        <div className="sm:col-span-2">
          <Button type="submit">Save preferences</Button>
          {saved && <p role="status" className="mt-3 text-sm text-success">Preferences saved on this device.</p>}
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
  useEffect(() => {
    const stored = readPrefs().notifications;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate saved choices from this device.
    if (stored) setPrefs((p) => ({ ...p, ...stored }));
  }, []);

  return (
    <div className="max-w-3xl space-y-4">
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
              onCheckedChange={(v) =>
                setPrefs((p) => {
                  const next = { ...p, [n.key]: v };
                  writePrefs({ notifications: next });
                  return next;
                })
              }
            />
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-text">Choices save automatically on this device.</p>
    </div>
  );
}
