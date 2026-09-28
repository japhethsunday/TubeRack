"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Eye, EyeOff, FileText, Mic, Sparkles, type LucideIcon } from "lucide-react";
import { FloatingCard, RotatingWord, STAGES } from "@/src/components/auth/AuthLayout";
import { CircuitBackdrop } from "@/src/components/auth/CircuitBackdrop";
import { BrandMark } from "@/src/components/ui/BrandMark";
import { cx } from "@/src/components/ui/cx";

export const stagger = (i: number) => ({ animationDelay: `${420 + i * 70}ms` });

/** Icon field with an animated gradient border on focus. */
export function GlowField({
  icon: Icon,
  label,
  error,
  password,
  ...rest
}: { icon: LucideIcon; label: string; error?: string; password?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
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

/**
 * Glass auth card: a diagonal brand panel on one side (sweeps across the card
 * before switching pages) and the form on the other, over the circuit backdrop.
 */
export function SplitAuthCard({
  panelSide,
  panelTitle,
  panelText,
  switchLabel,
  switchHref,
  title,
  subtitle,
  children,
}: {
  panelSide: "left" | "right";
  panelTitle: string;
  panelText: string;
  switchLabel: string;
  switchHref: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);
  const right = panelSide === "right";
  const from = right ? "su-from-right" : "su-from-left";
  const formFrom = right ? "su-from-left" : "su-from-right";

  function go(e: React.MouseEvent) {
    e.preventDefault();
    // Plain navigation (no router hook): the card also renders in server-side tests.
    const nav = () => window.location.assign(switchHref);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return nav();
    setLeaving(true);
    window.setTimeout(nav, 520);
  }

  const panel = (
    <div
      className={cx(
        "relative overflow-hidden bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-600 p-8 text-white md:p-10",
        right ? "su-panel-r md:order-2 md:pl-16" : "su-panel md:pr-16",
        leaving && (right ? "su-panel-r-leave z-10" : "su-panel-leave z-10"),
      )}
    >
      <div className="auth-grid absolute inset-0 opacity-60" />
      <div className="otp-glass absolute inset-0" />
      <div className={cx("relative flex h-full flex-col", right && "md:items-end md:text-right")}>
        <Link href="/" aria-label="Recktube home" className={cx(from, "flex items-center gap-2")} style={{ animationDelay: "300ms" }}>
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <BrandMark className="size-[18px]" />
          </span>
          <span className="font-semibold tracking-tight">Recktube</span>
        </Link>
        {/* Product glimpses (desktop): the floating cards from the brand panel. */}
        <div className="relative my-6 hidden h-56 w-full text-left md:block" aria-hidden="true">
          <FloatingCard className={cx("top-0 w-56", right ? "right-0" : "left-0")} delay="0s" tilt="-3deg">
            <p className="flex items-center gap-2 text-xs font-medium text-white/70"><Sparkles className="size-3.5 text-fuchsia-200" /> Video analysis</p>
            <p className="mt-1.5 text-sm leading-snug">Lead with the payoff — your hook buries the result 12s in.</p>
          </FloatingCard>
          <FloatingCard className={cx("top-[5.5rem] w-44", right ? "left-12" : "right-12")} delay="-2s" tilt="4deg">
            <p className="flex items-center gap-2 text-xs font-medium text-white/70"><FileText className="size-3.5 text-sky-200" /> Script draft</p>
            <p className="mt-1.5 text-sm">9 sections · 1,240 words</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="auth-progress h-full rounded-full bg-white/80" /></div>
          </FloatingCard>
          <FloatingCard className={cx("bottom-0 w-40", right ? "right-0" : "left-0")} delay="-4s" tilt="2deg">
            <p className="flex items-center gap-2 text-xs font-medium text-white/70"><Mic className="size-3.5 text-amber-200" /> Voiceover</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm"><CheckCircle2 className="size-3.5 text-emerald-200" /> Take ready</p>
          </FloatingCard>
        </div>
        <div className="my-8 md:my-0">
          <p className={cx(from, "text-3xl font-extrabold uppercase tracking-tight md:text-4xl")} style={{ animationDelay: "450ms" }}>
            {panelTitle}
          </p>
          <p className={cx(from, "mt-3 max-w-xs text-sm text-white/80", right && "md:ml-auto")} style={{ animationDelay: "560ms" }}>
            {panelText}
          </p>
          <a
            href={switchHref}
            onClick={go}
            className={cx(from, "mt-6 inline-flex h-10 items-center gap-2 rounded-full border border-white/60 px-5 text-sm font-semibold transition hover:bg-white hover:text-violet-700")}
            style={{ animationDelay: "660ms" }}
          >
            {switchLabel}
          </a>
        </div>
        {/* Rotating headline + production pipeline marquee. */}
        <div className={cx(from, "mt-auto w-full space-y-3 pt-8")} style={{ animationDelay: "760ms" }}>
          <p className="text-lg font-semibold leading-tight">
            Make better <RotatingWord className="text-white underline decoration-white/50 decoration-2 underline-offset-4" />
            <br />
            <span className="text-white/70">From idea to published.</span>
          </p>
          <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
            <ul className="auth-marquee flex w-max gap-2" aria-label="Production pipeline">
              {[...STAGES, ...STAGES].map((s, i) => (
                <li key={`${s}-${i}`} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white/90">{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <CircuitBackdrop />
      <div className="su-card relative grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-surface/80 backdrop-blur-xl md:grid-cols-2">
        {panel}
        <div className={cx("relative p-6 sm:p-8 md:p-10", right && "md:order-1")}>
          <h1 className={cx(formFrom, "text-2xl font-bold tracking-tight")} style={{ animationDelay: "350ms" }}>{title}</h1>
          <p className={cx(formFrom, "mt-1 text-sm text-muted-text")} style={{ animationDelay: "400ms" }}>{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** Brand gradient button look shared by the auth screens. */
export const gradientButton = "auth-sheen group h-11 w-full rounded-full bg-gradient-to-r from-fuchsia-600 via-violet-600 to-sky-600 text-white";

/** Single glass card over the circuit backdrop (password reset, code entry). */
export function GlassAuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <main id="main" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <CircuitBackdrop />
      <div className="relative w-full max-w-md">
        <Link href="/" aria-label="Recktube home" className="otp-in mx-auto mb-6 flex w-fit items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-sky-500 text-white">
            <BrandMark className="size-[18px]" />
          </span>
          <span className="font-semibold tracking-tight">Recktube</span>
        </Link>
        <div className="su-card otp-glass rounded-3xl border border-border bg-surface/80 p-6 text-center backdrop-blur-xl sm:p-8">
          <h1 className="su-from-right text-2xl font-bold tracking-tight" style={{ animationDelay: "250ms" }}>{title}</h1>
          <p className="su-from-right mt-1 text-sm text-muted-text" style={{ animationDelay: "320ms" }}>{subtitle}</p>
          <div className="mt-6 text-left">{children}</div>
        </div>
        {footer && <div className="otp-in mt-5 text-center text-sm text-muted-text" style={{ animationDelay: "400ms" }}>{footer}</div>}
      </div>
    </main>
  );
}
