"use client";

import { GoogleButton } from "@/src/components/auth/GoogleButton";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { CircuitBackdrop } from "@/src/components/auth/CircuitBackdrop";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { fieldErrors } from "@/src/components/auth/form";
import { signupSchema } from "@/src/lib/auth/validation";
import { api, ApiError } from "@/src/lib/api";
import { Checkbox } from "@/src/components/ui/choices";
import { Button } from "@/src/components/ui/Button";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { cx } from "@/src/components/ui/cx";

const stagger = (i: number) => ({ animationDelay: `${420 + i * 70}ms` });

/** Icon field with an animated gradient border on focus. */
function Field({
  icon: Icon,
  label,
  error,
  password,
  ...rest
}: { icon: typeof User; label: string; error?: string; password?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const id = `su-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="su-field" data-invalid={Boolean(error)}>
        <div className="flex items-center gap-2.5 rounded-[11px] bg-surface px-3">
          <Icon className="size-4 shrink-0 text-muted-text" aria-hidden="true" />
          <input
            id={id}
            placeholder={label}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            type={password ? (shown ? "text" : "password") : rest.type}
            className="h-11 w-full bg-transparent text-sm placeholder:text-muted-text"
            style={{ outline: "none" }}
            {...rest}
          />
          {password && (
            <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} className="text-muted-text hover:text-foreground">
              {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          )}
        </div>
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();

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

  /** The glass panel sweeps across the card, then we go to sign in. */
  function toLogin(e: React.MouseEvent) {
    e.preventDefault();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return router.push("/login");
    setLeaving(true);
    window.setTimeout(() => router.push("/login"), 520);
  }

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <CircuitBackdrop />
      <div className="su-card relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-surface/80 backdrop-blur-xl md:grid-cols-[1fr_1.1fr]">
        {/* Welcome panel */}
        <div className={cx("su-panel relative overflow-hidden bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-600 p-8 text-white md:p-10 md:pr-16", leaving && "su-panel-leave z-10")}>
          <div className="auth-grid absolute inset-0 opacity-60" />
          <div className="otp-glass absolute inset-0" />
          <div className="relative flex h-full flex-col">
            <Link href="/" aria-label="Recktube home" className="su-from-left flex items-center gap-2" style={{ animationDelay: "300ms" }}>
              <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <BrandMark className="size-[18px]" />
              </span>
              <span className="font-semibold tracking-tight">Recktube</span>
            </Link>
            <div className="my-8 md:my-auto">
              <h1 className="su-from-left text-3xl font-extrabold uppercase tracking-tight md:text-4xl" style={{ animationDelay: "450ms" }}>
                Hello, creator!
              </h1>
              <p className="su-from-left mt-3 max-w-xs text-sm text-white/80" style={{ animationDelay: "560ms" }}>
                Enter your details and start building your channel — from idea to published video, all in one studio.
              </p>
              <a
                href="/login"
                onClick={toLogin}
                className="su-from-left mt-6 inline-flex h-10 items-center gap-2 rounded-full border border-white/60 px-5 text-sm font-semibold transition hover:bg-white hover:text-violet-700"
                style={{ animationDelay: "660ms" }}
              >
                I have an account — Sign in
              </a>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="relative p-6 sm:p-8 md:p-10">
          <h2 className="su-from-right text-2xl font-bold tracking-tight" style={{ animationDelay: "350ms" }}>Sign up</h2>
          <p className="su-from-right mt-1 text-sm text-muted-text" style={{ animationDelay: "400ms" }}>One account for every studio. Free to start.</p>
          <div className="mt-6">
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
          </div>
        </div>
      </div>
    </main>
  );
}
