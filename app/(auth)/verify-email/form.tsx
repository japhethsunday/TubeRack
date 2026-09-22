"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, BadgeCheck } from "lucide-react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { fieldErrors } from "@/src/components/auth/form";
import { forgotSchema } from "@/src/lib/auth/validation";
import { Input } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { Badge } from "@/src/components/ui/Badge";

export function VerifyForm({ token, preview }: { token?: string; preview: boolean }) {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resent, setResent] = useState(false);

  function resend(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setResent(true);
  }

  if (preview) {
    return (
      <AuthLayout title="Email verified" subtitle="Your address is confirmed.">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BadgeCheck className="size-4 text-success" aria-hidden="true" />
            Verification successful
            <Badge tone="preview">State preview</Badge>
          </p>
          <p className="text-sm text-muted-text">
            No verification was performed — this previews the success state.
            Token checking connects in Phase 11.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continue to onboarding
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={token ? "Verifying…" : "Check your inbox"}
      subtitle={
        token
          ? "Confirming your address."
          : "We sent a verification link when you signed up."
      }
      footer={
        <Link href="/login" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-4">
        {token ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <MailCheck className="size-4 text-info" aria-hidden="true" />
              Link received — verification pending
            </p>
            <p className="text-sm text-muted-text">
              Token authenticity cannot be checked until the auth service
              exists (Phase 11). Nothing was verified and no state changed.
            </p>
            <p className="text-xs text-muted-text">
              <Link href="/verify-email?preview=success" className="underline">
                Preview the verified-success state
              </Link>
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-text">
            Did not get it? Request another link — delivery activates with the
            email service in Phase 11, so nothing is sent yet.
          </p>
        )}
        {resent ? (
          <p role="status" className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            Request recorded locally. A fresh link will be emailed once the
            email service connects (Phase 11).
          </p>
        ) : (
          <form onSubmit={resend} noValidate className="space-y-3">
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              placeholder="you@studio.com"
            />
            <Button type="submit" variant="outline" className="w-full">
              Resend verification
            </Button>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}
