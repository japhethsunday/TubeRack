"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { fieldErrors } from "@/src/components/auth/form";
import { forgotSchema } from "@/src/lib/auth/validation";
import { FORGOT_SUBMITTED_MESSAGE } from "@/src/lib/auth/errors";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { api, ApiError } from "@/src/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/auth/password/forgot", { email });
      setSubmitted(true);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a 60-minute reset link."
      footer={
        <Link href="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      }
    >
      {submitted ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <MailCheck className="size-4 text-success" aria-hidden="true" />
            Request submitted
          </p>
          <p role="status" className="text-sm text-muted-text">
            {FORGOT_SUBMITTED_MESSAGE}
          </p>
          <p className="text-xs text-muted-text">Check your spam folder if it does not arrive within a few minutes.</p>
        </div>
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
          {formError && (
            <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              {formError}
            </p>
          )}
          <Button type="submit" loading={loading} className="auth-sheen w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
