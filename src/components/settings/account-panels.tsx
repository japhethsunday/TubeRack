"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound, Smartphone } from "lucide-react";
import { Input } from "@/src/components/ui/fields";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { profileSchema, changePasswordSchema } from "@/src/lib/auth/validation";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";
import { Alert } from "@/src/components/ui/Alert";
import { EmptyState } from "@/src/components/ui/states";
import { PREVIEW_IDENTITY } from "@/src/config/identity";

function Saved({ feature, detail }: { feature: string; detail: string }) {
  return (
    <div className="mt-4">
      <AuthBoundaryNotice feature={feature} validated={detail} />
    </div>
  );
}

export function ProfilePanel() {
  const [name, setName] = useState(PREVIEW_IDENTITY.name);
  const [username, setUsername] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse({ name, username: username || undefined });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setSaved(false);
      return;
    }
    setErrors({});
    setSaved(true);
  }

  return (
    <form onSubmit={save} noValidate className="max-w-lg space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} size="lg" />
        <div>
          <p className="text-sm font-medium">Avatar</p>
          <p className="text-xs text-muted-text">Uploads activate with storage in Phase 11.</p>
        </div>
      </div>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} autoComplete="name" />
      <Input label="Email" type="email" defaultValue={PREVIEW_IDENTITY.email} disabled hint="Changing email re-verifies the address — available in Phase 11." />
      <Input label="Username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} error={errors.username} placeholder="studio-ada" hint="Lowercase letters, numbers, dashes." />
      <Button type="submit">Save profile</Button>
      {saved && <Saved feature="Profile update" detail={`Profile for “${name}” passed local validation.`} />}
    </form>
  );
}

export function SecurityPanel() {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ current, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setSaved(false);
      return;
    }
    setErrors({});
    setSaved(true);
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <form onSubmit={save} noValidate className="max-w-lg space-y-4" aria-label="Change password">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-text" aria-hidden="true" />
          Change password
        </h3>
        <PasswordField label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
        <div className="space-y-2">
          <PasswordField label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
          <PasswordStrength value={password} />
        </div>
        <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        <Button type="submit">Update password</Button>
        {saved && <Saved feature="Password change" detail="New password passed local validation." />}
      </form>

      <section aria-label="Two-factor authentication" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Smartphone className="size-4 text-muted-text" aria-hidden="true" />
          Two-factor authentication
          <Badge tone="preview">Phase 11</Badge>
        </h3>
        <p className="mt-1 text-sm text-muted-text">
          TOTP + recovery codes land with the auth service. No partial or fake
          2FA is offered.
        </p>
        <Button disabled title="Two-factor setup arrives in Phase 11" className="mt-3">
          Set up 2FA
        </Button>
      </section>

      <section aria-label="Recovery" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-muted-text" aria-hidden="true" />
          Recovery
        </h3>
        <p className="mt-1 text-sm text-muted-text">
          Recovery codes are issued alongside 2FA in Phase 11. Until then, email
          reset is the only recovery path.
        </p>
      </section>
    </div>
  );
}

export function SessionsPanel() {
  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="This session" className="rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold">This browser</h3>
        <p className="mt-1 text-sm text-muted-text">
          Preview context — no session token exists yet. Device, IP, and
          last-active tracking start with server sessions (Phase 11).
        </p>
        <div className="mt-3">
          <Alert tone="info" title="Nothing to sign out">
            There is no session to end. Sign-out becomes real alongside sessions
            in Phase 11 — and will return you to the login screen.
          </Alert>
        </div>
      </section>
      <EmptyState
        title="No other sessions"
        body="Every signed-in device lists here with revoke controls once session storage ships."
      />
      <div>
        <Button disabled title="Session revocation arrives in Phase 11">
          Sign out other sessions
        </Button>
      </div>
    </div>
  );
}
