"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { AccountStateBanner } from "@/src/components/auth/AccountStateBanner";
import { fieldErrors } from "@/src/components/auth/form";
import { loginSchema } from "@/src/lib/auth/validation";
import { Input } from "@/src/components/ui/fields";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";

export function LoginForm({ returnTo, expired }: { returnTo: string; expired: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setDone(false);
      return;
    }
    setErrors({});
    setLoading(true);
    // Local validation only — no network call exists until Phase 11.
    window.setTimeout(() => {
      setLoading(false);
      setDone(true);
    }, 400);
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
              Applies once server sessions exist (Phase 11).
            </p>
          </div>
          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
