"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { signupSchema } from "@/src/lib/auth/validation";
import { api, ApiError } from "@/src/lib/api";
import { Input } from "@/src/components/ui/fields";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";

const stagger = (i: number) => ({ animationDelay: `${240 + i * 60}ms` });

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
      // Full navigation: every provider re-reads the new session cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard?welcome=1");
      return;
    } catch (error) {
      if (error instanceof ApiError && error.isUnavailable()) {
        setOffline(true);
      } else if (error instanceof ApiError && error.code === "CONFLICT") {
        setErrors({ email: "An account with this email already exists. Sign in instead." });
        setShake((n) => n + 1);
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
    <AuthLayout
      title="Create your account"
      subtitle="One account for every studio. Free to start."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      {offline ? (
        <AuthBoundaryNotice
          feature="Sign-up"
          validated={`Details for ${email} passed validation, but the server could not be reached.`}
          returnTo="/dashboard"
        />
      ) : (
        <form key={shake} onSubmit={submit} noValidate className={`space-y-4 ${shake > 0 ? "auth-shake" : ""}`}>
          <div className="auth-rise" style={stagger(0)}>
            <Input label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="Ada Lovelace" />
          </div>
          <div className="auth-rise" style={stagger(1)}>
            <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@studio.com" />
          </div>
          <div className="auth-rise space-y-2" style={stagger(2)}>
            <PasswordField
              label="Password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint="At least 8 characters — longer beats complex."
            />
            <PasswordStrength value={password} />
          </div>
          <div className="auth-rise" style={stagger(3)}>
            <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          </div>
          <div className="auth-rise" style={stagger(4)}>
            <Checkbox label="I accept the Terms and Privacy Policy" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            {errors.terms && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.terms}
              </p>
            )}
          </div>
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="auth-rise" style={stagger(5)}>
            <Button type="submit" loading={loading} className="auth-sheen group h-11 w-full">
              {loading ? "Creating your workspace…" : "Create account"}
              {!loading && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />}
            </Button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
