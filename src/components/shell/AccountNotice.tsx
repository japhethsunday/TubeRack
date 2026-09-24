"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { api } from "@/src/lib/api";
import { useSession } from "@/src/components/auth/useSession";

const DISMISS_KEY = "tuberack.split-notice.dismissed";

/**
 * Warns when this login's YouTube channel is also connected to another
 * TubeRack account. Projects belong to the account (email) you sign in
 * with, so two logins for one channel look like "missing" projects.
 */
export function AccountNotice() {
  const session = useSession();
  const [split, setSplit] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (session.status !== "signed-in") return;
    let alive = true;
    api
      .get<{ splitAccount?: boolean }>("/api/v1/youtube/connection")
      .then((d) => alive && setSplit(Boolean(d.splitAccount)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session.status]);

  if (session.status !== "signed-in" || !split || dismissed) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
      <Users className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Your YouTube channel is linked to another TubeRack account too</p>
        <p className="mt-0.5 text-muted-text">
          Projects belong to the email you sign in with. You&apos;re signed in as <strong className="break-all text-foreground">{session.user.email}</strong>. If projects seem missing, sign out and sign in with the email you used on your other device.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // ignore
          }
        }}
        className="rounded p-1 text-muted-text hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
