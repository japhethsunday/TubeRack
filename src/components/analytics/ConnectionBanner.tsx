import Link from "next/link";
import { Unplug } from "lucide-react";
import { Alert } from "@/src/components/ui/Alert";

/** Connection banner: states exactly what is (not) connected. */
export function ConnectionBanner({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-text">
        <Unplug className="size-3.5" aria-hidden="true" />
        YouTube not connected — platform metrics arrive in Phase 11.
      </p>
    );
  }
  return (
    <Alert tone="info" title="Platform analytics not connected">
      <span className="block">
        No YouTube, TikTok, or Instagram connection exists yet, so platform numbers below come only from
        entries you log by hand (labeled self-reported) or from local projects (labeled local). Nothing
        here is live, and nothing is invented.
      </span>
      <span className="mt-1 block">
        Connection, ingestion, and history arrive with the backend in Phase 11.{" "}
        <Link href="/settings" className="underline">Notification preferences</Link> already cover
        collection-failure alerts for when ingestion exists.
      </span>
    </Alert>
  );
}
