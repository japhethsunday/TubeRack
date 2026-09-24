import Link from "next/link";
import { Container } from "@/src/components/ui/Container";
import { AppBackdrop } from "@/src/components/shell/AppBackdrop";

export default function NotFound() {
  return (
    <main id="main">
      <AppBackdrop />
      <Container className="ui-page py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-text">
          This route does not exist yet. Product studios arrive in later
          phases — try the dashboard or the design system.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-muted"
          >
            Back home
          </Link>
        </div>
      </Container>
    </main>
  );
}
