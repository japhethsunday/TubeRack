"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { resetSchema } from "@/src/lib/auth/validation";
import { authError } from "@/src/lib/auth/errors";
import { ErrorState } from "@/src/components/ui/states";
import { Button } from "@/src/components/ui/Button";
import { InfoLine } from "@/src/components/ui/Toast";

export function ResetForm({ token, expired }: { token: string; expired: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (expired) {
    const content = authError("expired-token");
    return (
      <AuthLayout title="Reset your password" subtitle="Choose a new password.">
        <ErrorState
          title={content.title}
          body={content.body}
          recoveryHref="/forgot-password"
          recoveryLabel="Request a new link"
        />
      </AuthLayout>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resetSchema.safeParse({ token, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 400);
  }

  return (
    <AuthLayout
      title={done ? "Password updated" : "Choose a new password"}
      subtitle="Links expire after 60 minutes."
      footer={
        <Link href="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <AuthBoundaryNotice
          feature="Password reset"
          validated="New password passed local validation."
          returnTo="/login"
        />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <InfoLine>
            Link authenticity cannot be checked until the auth service exists
            (Phase 11) — this form demonstrates the reset UX; nothing is verified
            or saved.
          </InfoLine>
          <div className="space-y-2">
            <PasswordField
              label="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <PasswordStrength value={password} />
          </div>
          <PasswordField
            label="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <Button type="submit" loading={loading} className="w-full">
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
