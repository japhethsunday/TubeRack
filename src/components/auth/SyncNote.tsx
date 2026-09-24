"use client";

import Link from "next/link";
import { Cloud, HardDrive } from "lucide-react";
import { useSession } from "@/src/components/auth/useSession";

/**
 * Where this data lives, from the real session: synced to the account when
 * signed in, device-only (with a sign-in link) when signed out.
 */
export function SyncNote({ what, extra }: { what: string; extra?: string }) {
  const session = useSession();
  if (session.status === "loading") return null;
  const signedIn = session.status === "signed-in";
  const Icon = signedIn ? Cloud : HardDrive;
  return (
    <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-text">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {signedIn ? (
          <>{what} save to your account and sync across devices.</>
        ) : (
          <>
            {what} are saved on this device.{" "}
            <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
              Sign in
            </Link>{" "}
            to sync them to your account.
          </>
        )}
        {extra ? ` ${extra}` : ""}
      </span>
    </p>
  );
}
