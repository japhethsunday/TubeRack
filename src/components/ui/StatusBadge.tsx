import type { ReactNode } from "react";

const tones: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  blocked: "border-zinc-200 bg-zinc-100 text-zinc-700",
};

export function StatusBadge({
  tone = "blocked",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
