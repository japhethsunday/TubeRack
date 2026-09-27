"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/src/components/ui/Button";
import { Loading, PageTitle, th, td, useAdmin, when } from "@/src/components/admin/kit";

interface Row { id: string; name: string; status: string; email: string; assets: number; updatedAt: string; createdAt: string }

export default function AdminProjects() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, error, reload } = useAdmin<Row[]>(`/api/v1/admin/projects?${new URLSearchParams({ q: query })}`);
  return (
    <>
      <PageTitle title="Projects" sub="What creators are working on right now (latest 100)." />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-text" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search project name or owner email" aria-label="Search projects" className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
        <Button type="submit">Search</Button>
      </form>
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr><th className={th}>Project</th><th className={th}>Owner</th><th className={th}>Stage</th><th className={`${th} text-right`}>Files</th><th className={th}>Updated</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className={`${td} font-medium`}>{p.name}</td>
                  <td className={`${td} text-xs`}>{p.email || "—"}</td>
                  <td className={`${td} text-xs capitalize text-muted-text`}>{p.status}</td>
                  <td className={`${td} text-right tabular-nums`}>{p.assets}</td>
                  <td className={`${td} whitespace-nowrap text-xs text-muted-text`}>{when(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
