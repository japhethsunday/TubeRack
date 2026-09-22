import Link from "next/link";
import type { AccountState } from "@/src/lib/auth/types";
import { ACCOUNT_STATES } from "@/src/lib/auth/session";
import { Badge } from "@/src/components/ui/Badge";
import { cx } from "@/src/components/ui/cx";

const tones: Record<string, string> = {
  info: "border-info/30 bg-info/10",
  warn: "border-warning/30 bg-warning/10",
  bad: "border-destructive/30 bg-destructive/10",
  ok: "border-success/30 bg-success/10",
};

/** Account-state banner: new / verified / unverified / suspended / sessions. */
export function AccountStateBanner({
  state,
  actionHref,
  actionLabel,
}: {
  state: AccountState;
  actionHref?: string;
  actionLabel?: string;
}) {
  const meta = ACCOUNT_STATES[state];
  return (
    <div
      role={meta.tone === "bad" ? "alert" : "status"}
      className={cx("rounded-xl border p-4", tones[meta.tone])}
    >
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {meta.title}
        <Badge tone="preview">Account state</Badge>
      </p>
      <p className="mt-1 text-sm text-muted-text">{meta.body}</p>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="mt-3 inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium hover:bg-muted"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
