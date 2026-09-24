"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { api, ApiError } from "@/src/lib/api";
import { CheckCircle2 } from "lucide-react";
import { fieldErrors } from "@/src/components/auth/form";
import { resetSchema } from "@/src/lib/auth/validation";
import { authError } from "@/src/lib/auth/errors";
import { ErrorState } from "@/src/components/ui/states";
import { Button } from "@/src/components/ui/Button";

export function ResetForm({ token, expired }: { token: string; expired: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = resetSchema.safeParse({ token, password, confirm });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/auth/password/reset", { token, password, confirm });
      setDone(true);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.details?.[0] ?? error.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
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
        <div className="space-y-4">
          <p role="status" className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
            Your password was changed. Other devices were signed out.
          </p>
          <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Sign in with your new password
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
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
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}{" "}
              <Link href="/forgot-password" className="font-medium underline">Request a new link</Link>
            </p>
          )}
          <Button type="submit" loading={loading} className="auth-sheen w-full">
            Set new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
