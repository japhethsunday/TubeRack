import Link from "next/link";

/** "By continuing…" line shown on sign-in and sign-up, covering Google sign-in too. */
export function TermsNotice({ action = "continuing" }: { action?: string }) {
  return (
    <p className="mt-2 text-center text-xs leading-relaxed text-muted-text">
      By {action}, you agree to Recktube&apos;s{" "}
      <Link href="/terms" target="_blank" className="font-medium underline underline-offset-2 hover:text-foreground">Terms of Service</Link> and{" "}
      <Link href="/privacy" target="_blank" className="font-medium underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
    </p>
  );
}
