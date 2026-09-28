"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Lock, Mail, MailCheck } from "lucide-react";
import { GlassAuthCard, GlowField, gradientButton } from "@/src/components/auth/SplitAuthCard";
import { CodeInput } from "@/src/components/auth/CodeInput";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { fieldErrors } from "@/src/components/auth/form";
import { forgotSchema, resetSchema } from "@/src/lib/auth/validation";
import { Button } from "@/src/components/ui/Button";
import { api, ApiError } from "@/src/lib/api";

type Step = "email" | "code" | "password" | "done";
const RESEND_AFTER = 60;

const errorText = (e: unknown) => (e instanceof ApiError ? e.details?.[0] ?? e.message : "Something went wrong. Try again.");

/** Glass badge with a floating key and a pulsing ring. */
function Badge({ done }: { done?: boolean }) {
  return (
    <div className="relative mx-auto mb-5 flex size-14 items-center justify-center">
      <span className="otp-badge-ring absolute inset-0 rounded-2xl" />
      <span className="otp-badge relative flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-fuchsia-500/20 via-violet-600/20 to-sky-500/20 text-primary shadow-lg shadow-violet-900/20 backdrop-blur">
        {done ? (
          <svg viewBox="0 0 24 24" className="size-7 text-success" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="otp-check" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <KeyRound className="size-6" aria-hidden="true" />
        )}
      </span>
    </div>
  );
}

export function ForgotFlow({ initialEmail, startAtCode }: { initialEmail: string; startAtCode: boolean }) {
  const [step, setStep] = useState<Step>(startAtCode ? "code" : "email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [codeState, setCodeState] = useState<"idle" | "error" | "success">("idle");
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(startAtCode ? 0 : RESEND_AFTER);

  useEffect(() => {
    if (step !== "code" || resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [step, resendIn]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = forgotSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setStep("email");
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/auth/password/forgot", { email });
      setCode("");
      setCodeState("idle");
      setResendIn(RESEND_AFTER);
      setStep("code");
    } catch (error) {
      setFormError(errorText(error));
    }
    setLoading(false);
  }

  async function verify(value = code) {
    if (value.length !== 6 || loading) return;
    setFormError(null);
    setLoading(true);
    try {
      const res = await api.post<{ token: string }>("/api/v1/auth/password/verify-code", { email, code: value });
      setCodeState("success");
      setToken(res.token);
      window.setTimeout(() => setStep("password"), 900);
    } catch (error) {
      setCodeState("error");
      setFormError(errorText(error));
    }
    setLoading(false);
  }

  async function reset(e: React.FormEvent) {
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
      setStep("done");
    } catch (error) {
      setFormError(errorText(error));
    }
    setLoading(false);
  }

  const mmss = `${String(Math.floor(resendIn / 60)).padStart(2, "0")}:${String(resendIn % 60).padStart(2, "0")}`;
  const titles: Record<Step, [string, string]> = {
    email: ["Reset your password", "We'll email you a 6-digit code."],
    code: ["Verify it's you", "Enter the code we emailed you."],
    password: ["Choose a new password", "Your code checked out — pick something strong."],
    done: ["Password updated", "You're all set."],
  };
  const alert = formError && (
    <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>
  );

  return (
    <GlassAuthCard
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        <Link href="/login" className="font-medium text-foreground hover:text-primary">
          Back to sign in
        </Link>
      }
    >
      <div key={step} className="otp-in">
        {step === "email" && (
          <form onSubmit={sendCode} noValidate className="space-y-4">
            <Badge />
            <GlowField icon={Mail} label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
            {alert}
            <Button type="submit" loading={loading} className={gradientButton}>
              Send code
              {!loading && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />}
            </Button>
          </form>
        )}

        {step === "code" && (
          <div className="space-y-5 text-center">
            <Badge />
            <p className="text-sm text-muted-text">
              Sent to <strong className="text-foreground">{email}</strong>. It expires in 15 minutes.
            </p>
            <CodeInput
              value={code}
              onChange={(v) => { setCode(v); if (codeState === "error") setCodeState("idle"); }}
              onComplete={(v) => void verify(v)}
              state={codeState}
              disabled={loading || codeState === "success"}
              autoFocus
            />
            {alert}
            <p className="text-sm text-muted-text">
              Didn&apos;t get it?{" "}
              {resendIn > 0 ? (
                <span className="font-medium text-foreground tabular-nums">Resend in {mmss}</span>
              ) : (
                <button type="button" onClick={() => void sendCode()} disabled={loading} className="font-medium text-primary underline-offset-4 hover:underline">
                  Resend code
                </button>
              )}
            </p>
            <Button className={gradientButton} disabled={code.length !== 6 || codeState === "success"} onClick={() => void verify()}>
              {loading ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" /> Verifying code…</> : codeState === "success" ? "Verified" : "Verify code"}
            </Button>
            <button type="button" onClick={() => { setStep("email"); setFormError(null); }} className="inline-flex items-center gap-1 text-xs text-muted-text hover:text-foreground">
              <ArrowLeft className="size-3" aria-hidden="true" /> Use a different email
            </button>
          </div>
        )}

        {step === "password" && (
          <form onSubmit={reset} noValidate className="space-y-4">
            <Badge done />
            <div className="space-y-2">
              <GlowField icon={Lock} label="New password" password autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} />
              <PasswordStrength value={password} />
            </div>
            <GlowField icon={Lock} label="Confirm new password" password autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
            {alert}
            <Button type="submit" loading={loading} className={gradientButton}>Set new password</Button>
          </form>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <Badge done />
            <p role="status" className="flex items-center justify-center gap-2 text-sm">
              <MailCheck className="size-4 text-success" aria-hidden="true" />
              Your password was changed. Other devices were signed out.
            </p>
            <Link href="/login" className={`${gradientButton} inline-flex items-center justify-center px-4 text-sm font-medium hover:opacity-90`}>
              Sign in with your new password
            </Link>
          </div>
        )}
      </div>
    </GlassAuthCard>
  );
}
