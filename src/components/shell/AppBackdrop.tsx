/**
 * Brand backdrop shared by the whole app — the home page's treatment:
 * slow-drifting colour blobs and a fading grid. Fixed, non-interactive,
 * GPU-composited (transform-only animation). Dark mode uses the home page's
 * exact night palette; light mode uses the same shapes, softened.
 */
export function AppBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 size-[34rem] rounded-full bg-fuchsia-400/15 blur-3xl dark:bg-fuchsia-600/25" />
      <div
        className="absolute -right-32 top-24 size-[32rem] rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-500/20"
        style={{ animationDelay: "-7s" }}
      />
      <div
        className="absolute bottom-[-12rem] left-1/3 size-[36rem] rounded-full bg-violet-400/15 blur-3xl dark:bg-violet-600/20"
        style={{ animationDelay: "-11s" }}
      />
      <div className="app-grid absolute inset-x-0 top-0 h-[48rem]" />
    </div>
  );
}
