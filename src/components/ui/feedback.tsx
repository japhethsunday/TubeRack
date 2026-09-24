import { cx } from "@/src/components/ui/cx";

/** Determinate progress with accessible value text. */
export function Progress({
  value,
  label,
}: {
  value: number; // 0–100
  label: string;
}) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs text-muted-text" aria-hidden="true">
          {clamped}%
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-sky-400 transition-[width] duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("ui-shimmer rounded-md", className ?? "h-4 w-full")}
    />
  );
}

/** Loading state: skeleton shape + polite announcement. */
export function LoadingState({ label, lines = 3 }: { label: string; lines?: number }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <p role="status" className="text-sm text-muted-text">
        {label}…
      </p>
      <div className="mt-3 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={i === 0 ? "h-6 w-2/3" : "h-4 w-full"} />
        ))}
      </div>
    </div>
  );
}
