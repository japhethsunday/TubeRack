"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Monitor, LogOut } from "lucide-react";
import { Input } from "@/src/components/ui/fields";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { fieldErrors } from "@/src/components/auth/form";
import { changePasswordSchema } from "@/src/lib/auth/validation";
import { useSession, signOut } from "@/src/components/auth/useSession";
import { api, ApiError } from "@/src/lib/api";
import { Avatar } from "@/src/components/ui/Avatar";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";

function Result({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p role={ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
      {message}
    </p>
  );
}

function SignedOutNote() {
  return (
    <p className="text-sm text-muted-text">
      <Link href="/login" className="font-medium text-foreground underline">Sign in</Link> to manage your account.
    </p>
  );
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.details?.[0] ?? e.message : "Something went wrong. Nothing was changed.");

export function ProfilePanel() {
  const session = useSession();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the editable field once the session loads.
    if (session.user) setName(session.user.name);
  }, [session.user]);

  if (session.status === "loading") return <p className="text-sm text-muted-text">Loading profile…</p>;
  if (session.status === "signed-out") return <SignedOutNote />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setResult({ ok: false, message: "Name is required." });
      return;
    }
    setBusy(true);
    try {
      await api.patch("/api/v1/users/me", { name: name.trim() });
      setResult({ ok: true, message: "Profile saved." });
    } catch (error) {
      setResult({ ok: false, message: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="max-w-lg space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} size="lg" />
        <div>
          <p className="text-sm font-medium">{name || "Your name"}</p>
          <p className="flex items-center gap-2 text-xs text-muted-text">
            {session.user.email}
            {session.user.email_verified_at ? <Badge tone="ok">Verified</Badge> : (
              <Link href="/verify-email" className="underline">Verify email</Link>
            )}
          </p>
        </div>
      </div>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <Input label="Email" type="email" value={session.user.email} disabled hint="Your sign-in address." />
      <Button type="submit" loading={busy}>Save profile</Button>
      {result && <Result {...result} />}
    </form>
  );
}

export function SecurityPanel() {
  const session = useSession();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (session.status === "signed-out") return <SignedOutNote />;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ current, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post("/api/v1/auth/password/change", { current, password, confirm });
      setResult({ ok: true, message: "Password updated. Other devices were signed out." });
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (error) {
      setResult({ ok: false, message: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
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
      <Button type="submit" loading={busy}>Update password</Button>
      {result && <Result {...result} />}
      <p className="text-xs text-muted-text">
        Forgot it? <Link href="/forgot-password" className="underline">Reset by email</Link>.
      </p>
    </form>
  );
}

export function SessionsPanel() {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (session.status === "signed-out") return <SignedOutNote />;

  async function revokeOthers() {
    setBusy(true);
    try {
      await api.post("/api/v1/auth/sessions/revoke-others");
      setResult({ ok: true, message: "Every other device was signed out." });
    } catch (error) {
      setResult({ ok: false, message: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <section aria-label="This session" className="rounded-xl border border-border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Monitor className="size-4 text-muted-text" aria-hidden="true" />
          This browser <Badge tone="ok">Active</Badge>
        </h3>
        <p className="mt-1 text-sm text-muted-text">Signed in as {session.user?.email ?? "…"}.</p>
        <Button variant="outline" className="mt-3" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </section>
      <section aria-label="Other sessions" className="rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold">Other devices</h3>
        <p className="mt-1 text-sm text-muted-text">Lost a device or signed in somewhere public? End every other session at once.</p>
        <Button className="mt-3" loading={busy} onClick={() => void revokeOthers()}>
          Sign out other devices
        </Button>
        {result && <div className="mt-3"><Result {...result} /></div>}
      </section>
    </div>
  );
}
