import type { ReactNode } from "react";

export function Card({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
    >
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-zinc-600">{body}</p>
      {children}
    </section>
  );
}
