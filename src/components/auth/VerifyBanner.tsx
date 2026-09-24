"use client";

import { AccountStateBanner } from "@/src/components/auth/AccountStateBanner";
import { useSession } from "@/src/components/auth/useSession";

/** Shown only when the signed-in account has not verified its email. */
export function VerifyBanner() {
  const session = useSession();
  if (session.status !== "signed-in" || session.user.email_verified_at) return null;
  return <AccountStateBanner state="unverified" actionHref="/verify-email" actionLabel="Verify email" />;
}
