import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/src/components/ui/cx";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

/**
 * Responsive data table: horizontal scroll on small screens, sticky header.
 * For card-style mobile, callers use the same data with AssetGrid-style cards.
 */
export function Table<T extends { id: string }>({
  columns,
  rows,
  caption,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  caption: string;
  empty?: React.ReactNode;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[560px] border-collapse bg-surface text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-muted/60">
            {columns.map((c) => (
              <th key={c.key} scope="col" className="px-4 py-2.5 text-xs font-medium text-muted-text">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-3 align-top">
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="flex items-center gap-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <p aria-live="polite" className="text-sm text-muted-text">
        Page {page} of {totalPages}
      </p>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
        className="inline-flex size-9 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

export function Breadcrumb({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm">
        {trail.map((t, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={t.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden="true" className="text-disabled-text">
                  /
                </span>
              )}
              {t.href && !last ? (
                <a href={t.href} className="text-muted-text hover:text-foreground">
                  {t.label}
                </a>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cx(last ? "font-medium text-foreground" : "text-muted-text")}>
                  {t.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
