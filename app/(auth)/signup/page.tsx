"use client";

import { GoogleButton } from "@/src/components/auth/GoogleButton";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import { GlowField as Field, SplitAuthCard, stagger } from "@/src/components/auth/SplitAuthCard";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { signupSchema } from "@/src/lib/auth/validation";
import { api, ApiError } from "@/src/lib/api";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [shake, setShake] = useState(0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = signupSchema.safeParse({ name, email, password, confirm, terms });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setShake((n) => n + 1);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      await api.post("/api/v1/auth/signup", { name, email, password, confirm, terms });
      setSentTo(email);
      setLoading(false);
      return;
    } catch (error) {
      if (error instanceof ApiError && error.isUnavailable()) {
        setOffline(true);
      } else if (error instanceof ApiError) {
        setFormError(error.details?.[0] ?? error.message);
        setShake((n) => n + 1);
      } else {
        setFormError("Something went wrong. Nothing was changed.");
      }
    }
    setLoading(false);
  }

  return (
    <SplitAuthCard
      panelSide="left"
      panelTitle="Hello, creator!"
      panelText="Enter your details and start building your channel — from idea to published video, all in one studio."
      switchLabel="I have an account — Sign in"
      switchHref="/login"
      title="Sign up"
      subtitle="One account for every studio. Free to start."
    >
            {sentTo ? (
              <div role="status" className="otp-in space-y-3 text-sm">
                <p className="rounded-lg bg-success/10 p-3 text-success">Check your inbox at <strong>{sentTo}</strong>.</p>
                <p className="text-muted-text">We sent a link to finish creating your account — it signs you in and expires in 24 hours. Nothing arrived after a few minutes? Check spam, or sign in if you already have an account.</p>
              </div>
            ) : offline ? (
              <AuthBoundaryNotice feature="Sign-up" validated={`Details for ${email} passed validation, but the server could not be reached.`} returnTo="/dashboard" />
            ) : (
              <>
                <div className="su-from-right mb-4" style={stagger(0)}>
                  <GoogleButton returnTo="/onboarding" label="Sign up with Google" />
                </div>
                <form key={shake} onSubmit={submit} noValidate className={cx("space-y-3", shake > 0 && "auth-shake")}>
                  <div className="su-from-right" style={stagger(2)}>
                    <Field icon={User} label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
                  </div>
                  <div className="su-from-right" style={stagger(3)}>
                    <Field icon={Mail} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
                  </div>
                  <div className="su-from-right space-y-2" style={stagger(4)}>
                    <Field icon={Lock} label="Password" password autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
                    {password && <PasswordStrength value={password} />}
                  </div>
                  <div className="su-from-right" style={stagger(5)}>
                    <Field icon={Lock} label="Confirm password" password autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
                  </div>
                  <div className="su-from-right pt-1" style={stagger(6)}>
                    <Checkbox label="I accept the Terms and Privacy Policy" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                    <p className="mt-1 text-xs text-muted-text">
                      Read the <Link href="/terms" target="_blank" className="underline">Terms</Link> and <Link href="/privacy" target="_blank" className="underline">Privacy Policy</Link>.
                    </p>
                    {errors.terms && <p role="alert" className="mt-1 text-xs text-destructive">{errors.terms}</p>}
                  </div>
                  {formError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
                  <div className="su-from-right" style={stagger(7)}>
                    <Button type="submit" loading={loading} className="auth-sheen group h-11 w-full rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white">
                      {loading ? "Creating your workspace…" : "Sign up"}
                      {!loading && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />}
                    </Button>
                  </div>
                  <p className="su-from-right text-center text-xs text-muted-text md:hidden" style={stagger(8)}>
                    Already have an account? <Link href="/login" className="font-medium text-primary">Sign in</Link>
                  </p>
                </form>
              </>
            )}
    </SplitAuthCard>
  );
}
