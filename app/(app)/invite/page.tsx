"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Mail, Share2, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";

interface Referral { code: string; link: string; invited: number; joined: number; creditsEarned: number; reward: number; remaining: number; verified: boolean }

export default function InvitePage() {
  const [data, setData] = useState<Referral | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Referral>("/api/v1/users/me/referrals").then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load your invite link."));
  }, []);

  const message = data ? `I'm making my YouTube videos with Recktube — ideas, scripts, voice-overs and thumbnails in one studio. Sign up with my link and we both get ${data.reward} free credits: ${data.link}` : "";

  async function copy() {
    if (!data) return;
    await navigator.clipboard.writeText(data.link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  async function share() {
    if (!data) return;
    if (navigator.share) {
      await navigator.share({ title: "Recktube", text: message, url: data.link }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-600 p-8 text-white">
        <div className="auth-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Gift className="size-3.5" /> Invite friends</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Give {data?.reward ?? 100} credits, get {data?.reward ?? 100} credits</h1>
          <p className="mt-2 max-w-xl text-white/85">Share your link. When a friend signs up and confirms their email, you both get {data?.reward ?? 100} bonus credits — on top of the monthly allowance.</p>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {data && (
        <>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-semibold">Your invite link</h2>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} className="h-11 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm" aria-label="Invite link" />
              <Button className="h-11" onClick={() => void copy()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : "Copy link"}</Button>
              <Button className="h-11" variant="outline" onClick={() => void share()}><Share2 className="size-4" /> Share</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a className="rounded-full border border-border px-3 py-1.5 hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(message)}`}>WhatsApp</a>
              <a className="rounded-full border border-border px-3 py-1.5 hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`}>X / Twitter</a>
              <a className="rounded-full border border-border px-3 py-1.5 hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.link)}`}>Facebook</a>
              <a className="rounded-full border border-border px-3 py-1.5 hover:bg-muted" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(data.link)}`}>LinkedIn</a>
              <a className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 hover:bg-muted" href={`mailto:?subject=${encodeURIComponent("Try Recktube with me")}&body=${encodeURIComponent(message)}`}><Mail className="size-3" /> Email</a>
            </div>
            {!data.verified && <p className="mt-3 text-xs text-warning">Confirm your email address to receive your referral credits.</p>}
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5"><UserPlus className="size-5 text-primary" /><div className="mt-2 text-2xl font-bold tabular-nums">{data.invited}</div><div className="text-xs text-muted-text">Signed up with your link</div></div>
            <div className="rounded-2xl border border-border bg-surface p-5"><Users className="size-5 text-primary" /><div className="mt-2 text-2xl font-bold tabular-nums">{data.joined}</div><div className="text-xs text-muted-text">Confirmed and rewarded</div></div>
            <div className="rounded-2xl border border-border bg-surface p-5"><Gift className="size-5 text-primary" /><div className="mt-2 text-2xl font-bold tabular-nums">{data.creditsEarned}</div><div className="text-xs text-muted-text">Credits you&apos;ve earned</div></div>
          </section>

          <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
            <h2 className="font-semibold">How it works</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-text">
              <li>Share your link with creators you know.</li>
              <li>They sign up (email or Google) and confirm their email.</li>
              <li>You both get {data.reward} credits instantly. Up to {data.remaining} more rewards available on your account.</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
