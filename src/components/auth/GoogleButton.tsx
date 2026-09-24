/** "Continue with Google" — full-page redirect through the server sign-in route. */
export function GoogleButton({ returnTo = "/dashboard", label = "Continue with Google" }: { returnTo?: string; label?: string }) {
  return (
    <div className="space-y-4">
      <a
        href={`/api/v1/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`}
        className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.56-5.17 3.56-8.81z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.1z" />
          <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
        </svg>
        {label}
      </a>
      <div className="flex items-center gap-3 text-xs text-muted-text">
        <span className="h-px flex-1 bg-border" />
        or with email
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
