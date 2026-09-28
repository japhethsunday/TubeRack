"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Gift, PartyPopper } from "lucide-react";
import { api, ApiError } from "@/src/lib/api";
import { useSession } from "@/src/components/auth/useSession";
import { Button } from "@/src/components/ui/Button";

/** Redeem a bonus credit code. Links from emails (/redeem?code=X) fill and redeem it in one tap. */
export default function RedeemPage() {
  const session = useSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ credits: number; balance: number | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const auto = useRef(false);

  const redeem = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setDone(await api.post<{ credits: number; balance: number | null }>("/api/v1/credits/redeem", { code: value }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  };

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.search).get("code") ?? "";
    if (!fromLink) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fill the code from the email link once.
    setCode(fromLink.toUpperCase());
    if (session.status === "signed-in" && !auto.current) {
      auto.current = true;
      void redeem(fromLink);
    }
  }, [session.status]);

  if (session.status === "signed-out") {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <Gift className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-bold">Sign in to redeem your code</h1>
        <Link href={`/login?returnTo=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/redeem")}`} className="mt-5 inline-flex h-11 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-8">
      {done ? (
        <div className="rounded-3xl bg-gradient-to-br from-fuchsia-600 via-violet-700 to-sky-700 p-8 text-center text-white shadow-xl">
          <PartyPopper className="mx-auto size-12" aria-hidden="true" />
          <h1 className="mt-3 text-3xl font-black">+{done.credits.toLocaleString()} credits</h1>
          <p className="mt-2 text-white/85">{done.balance === null ? "Added to your account." : `Your balance is now ${done.balance.toLocaleString()} credits.`}</p>
          <Link href="/studio/video" className="mt-6 inline-flex h-12 items-center rounded-full bg-white px-7 font-bold text-violet-700">Make a video now</Link>
        </div>
      ) : (
        <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <Gift className="size-10 text-primary" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold">Redeem a code</h1>
          <p className="mt-1 text-sm text-muted-text">Enter your bonus code to add free credits to your account.</p>
          <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); void redeem(code); }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CREATOR50"
              autoCapitalize="characters"
              className="h-12 w-full rounded-xl border border-border bg-background px-4 text-center font-mono text-lg font-bold tracking-widest"
            />
            <Button type="submit" className="h-12 w-full justify-center text-base" loading={busy} disabled={!code.trim()}>Redeem</Button>
          </form>
          {err && <p role="alert" className="mt-3 text-center text-sm text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}
