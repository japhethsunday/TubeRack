"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { PasswordField } from "@/src/components/auth/PasswordField";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { signupSchema } from "@/src/lib/auth/validation";
import { Input } from "@/src/components/ui/fields";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ name, email, password, confirm, terms });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setDone(false);
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
      title="Create your account"
      subtitle="One account, every studio. Free to start."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline">
            Sign in
          </Link>
        </>
      }
    >
      {done ? (
        <AuthBoundaryNotice
          feature="Sign-up"
          validated={`Details for ${email} passed local validation, terms accepted.`}
          returnTo="/onboarding"
        />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input
            label="Name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            placeholder="Ada Lovelace"
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            placeholder="you@studio.com"
          />
          <div className="space-y-2">
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
          <PasswordField
            label="Confirm password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <div>
            <Checkbox
              label="I accept the Terms and Privacy Policy"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            {errors.terms && (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {errors.terms}
              </p>
            )}
          </div>
          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
