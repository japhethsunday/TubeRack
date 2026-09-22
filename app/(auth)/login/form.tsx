"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { AccountStateBanner } from "@/src/components/auth/AccountStateBanner";
import { fieldErrors } from "@/src/components/auth/form";
import { loginSchema } from "@/src/lib/auth/validation";
import { api, ApiError } from "@/src/lib/api";
import { Input } from "@/src/components/ui/fields";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";

export function LoginForm({ returnTo, expired }: { returnTo: string; expired: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setDone(false);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api.post("/api/v1/auth/login", { email, password });
      // Full navigation so the new session cookie is read on the next page.
      // No next/navigation dependency: keeps server-rendered tests working.
      if (typeof window !== "undefined") {
        window.location.assign(returnTo);
      } else {
        setDone(true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.isUnavailable()) {
        // No backend: fall through to the honest boundary notice.
        setDone(true);
      } else if (error instanceof ApiError) {
        setFormError(error.code === "UNAUTHORIZED" ? "Email or password is incorrect." : error.message);
      } else {
        setFormError("Something went wrong. Nothing was changed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your workspace."
      footer={
        <>
          New to TubeRack?{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Create an account
          </Link>
        </>
      }
    >
      {expired && (
        <div className="mb-4">
          <AccountStateBanner state="session-expired" actionHref="/login" actionLabel="Sign in again" />
        </div>
      )}
      {done ? (
        <AuthBoundaryNotice
          feature="Sign-in"
          validated={`Credentials for ${email} passed local validation${remember ? " (remember-me requested)" : ""}.`}
          returnTo={returnTo}
        />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@studio.com"
          />
          <div>
            <PasswordField
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <p className="mt-1 text-right">
              <Link href="/forgot-password" className="text-xs font-medium text-muted-text underline">
                Forgot password?
              </Link>
            </p>
          </div>
          <div>
            <Checkbox
              label="Stay signed in for 30 days"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <p className="mt-1 text-xs text-muted-text">
              Applies to server sessions when the backend is connected (Phase 11).
            </p>
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
