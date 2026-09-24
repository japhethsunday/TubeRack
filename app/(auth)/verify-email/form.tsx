"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MailCheck, BadgeCheck, OctagonX } from "lucide-react";
import { AuthLayout } from "@/src/components/auth/AuthLayout";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";

type Status = "idle" | "verifying" | "verified" | "failed";

/**
 * With ?token: consumes it via /api/v1/auth/verify. Without: lets a
 * signed-in user resend the link (the server knows their address).
 */
export function VerifyForm({ token }: { token?: string; preview?: boolean }) {
  const [status, setStatus] = useState<Status>(token ? "verifying" : "idle");
  const [message, setMessage] = useState<string | null>(null);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api
      .post("/api/v1/auth/verify", { token })
      .then(() => setStatus("verified"))
      .catch((error: unknown) => {
        setStatus("failed");
        setMessage(error instanceof ApiError ? error.message : "Verification failed.");
      });
  }, [token]);

  async function requestLink() {
    setResend("sending");
    setResendMessage(null);
    try {
      const result = await api.post<{ sent: boolean; reason: string }>("/api/v1/auth/verify/resend");
      setResend(result.sent ? "sent" : "error");
      setResendMessage(result.sent ? "A new link is on its way — check your inbox." : result.reason);
    } catch (error) {
      setResend("error");
      setResendMessage(
        error instanceof ApiError && error.code === "UNAUTHORIZED"
          ? "Sign in first, then request a new link."
          : error instanceof ApiError
            ? error.message
            : "Could not send the link.",
      );
    }
  }

  if (status === "verified") {
    return (
      <AuthLayout title="Email verified" subtitle="Your address is confirmed.">
        <div className="space-y-4">
          <p role="status" className="flex items-center gap-2 text-sm font-medium">
            <BadgeCheck className="size-4 text-success" aria-hidden="true" />
            Thanks — your account is verified.
          </p>
          {/* Full navigation so every provider picks up the new session. */}
          <a href="/dashboard?welcome=1" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go to your dashboard
          </a>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={status === "verifying" ? "Verifying…" : status === "failed" ? "Link did not work" : "Check your inbox"}
      subtitle={status === "verifying" ? "Confirming your address." : "We send a verification link when you sign up."}
      footer={
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-4">
        {status === "verifying" && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <MailCheck className="size-4 animate-pulse text-info" aria-hidden="true" />
            Checking your link…
          </p>
        )}
        {status === "failed" && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <OctagonX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {message}
          </p>
        )}
        {status !== "verifying" && (
          <>
            <p className="text-sm text-muted-text">Did not get it, or the link expired? Send a new one to your account email.</p>
            {resendMessage && (
              <p role="status" className={`rounded-lg p-3 text-sm ${resend === "sent" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                {resendMessage}
              </p>
            )}
            <Button variant="outline" className="w-full" loading={resend === "sending"} disabled={resend === "sent"} onClick={() => void requestLink()}>
              Resend verification email
            </Button>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
