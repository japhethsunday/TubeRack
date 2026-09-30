"use client";

import { GoogleButton } from "@/src/components/auth/GoogleButton";
import { TermsNotice } from "@/src/components/auth/TermsNotice";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { GlowField, GlassAuthCard, stagger } from "@/src/components/auth/SplitAuthCard";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { AccountStateBanner } from "@/src/components/auth/AccountStateBanner";
import { fieldErrors } from "@/src/components/auth/form";
import { loginSchema } from "@/src/lib/auth/validation";
import { api, ApiError } from "@/src/lib/api";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";

export function LoginForm({ returnTo, expired, externalError }: { returnTo: string; expired: boolean; externalError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setDone(false);
      setShake((n) => n + 1);
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
        setShake((n) => n + 1);
      } else {
        setFormError("Something went wrong. Nothing was changed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassAuthCard
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={<>New to Recktube? <Link href="/signup" className="font-medium text-foreground hover:text-primary">Create an account</Link></>}
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
        <>
        {externalError && (
          <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{externalError}</p>
        )}
        <div className="su-from-left mb-4" style={stagger(0)}>
          <GoogleButton returnTo={returnTo} />
        </div>
        <form key={shake} onSubmit={submit} noValidate className={`space-y-4 ${shake > 0 ? "auth-shake" : ""}`}>
          <div className="su-from-left" style={stagger(1)}>
            <GlowField icon={Mail} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          </div>
          <div className="su-from-left" style={stagger(2)}>
            <GlowField icon={Lock} label="Password" password autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
            <p className="mt-1.5 text-right">
              <Link href="/forgot-password" className="text-xs font-medium text-muted-text hover:text-foreground">
                Forgot password?
              </Link>
            </p>
          </div>
          <div className="su-from-left" style={stagger(3)}>
            <Checkbox
              label="Stay signed in for 30 days"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="su-from-left" style={stagger(4)}>
            <Button type="submit" loading={loading} className="auth-sheen group h-11 w-full rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white">
              {loading ? "Signing in…" : "Sign in"}
              {!loading && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />}
            </Button>
            <TermsNotice action="signing in" />
          </div>
        </form>
        </>
      )}
    </GlassAuthCard>
  );
}
