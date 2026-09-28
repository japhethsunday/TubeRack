"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { cx } from "@/src/components/ui/cx";
import { errorText, Loading, PageTitle, useAdmin } from "@/src/components/admin/kit";

interface Feature { id: string; label: string; blurb: string; off: boolean; message: string }

export default function AdminFeatures() {
  const { data, error, reload } = useAdmin<Feature[]>("/api/v1/admin/features");
  const [busy, setBusy] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function toggle(f: Feature) {
    if (!f.off && !window.confirm(`Pause "${f.label}" for all users?`)) return;
    setBusy(f.id);
    setErr(null);
    try {
      await api.put("/api/v1/admin/features", { id: f.id, off: !f.off, message: msgs[f.id] ?? f.message });
      await reload();
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(null);
  }

  return (
    <>
      <PageTitle title="Feature switches" sub="Pause a tool for everyone when a provider breaks — no redeploy. Changes apply within about 20 seconds. Owners can still use paused tools to test." />
      {err && <p role="alert" className="mb-3 text-sm text-destructive">{err}</p>}
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <ul className="space-y-3">
          {data.map((f) => (
            <li key={f.id} className={cx("rounded-xl border bg-surface p-4", f.off ? "border-destructive/40" : "border-border")}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{f.label}</p>
                  <p className="text-xs text-muted-text">{f.blurb}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!f.off}
                  aria-label={`${f.label}: ${f.off ? "paused" : "on"}`}
                  disabled={busy === f.id}
                  onClick={() => void toggle(f)}
                  className={cx("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", f.off ? "bg-muted" : "bg-success")}
                >
                  <span className={cx("absolute top-1 size-5 rounded-full bg-white shadow transition-all", f.off ? "left-1" : "left-6")} />
                </button>
              </div>
              <p className={cx("mt-2 text-xs font-semibold", f.off ? "text-destructive" : "text-success")}>{f.off ? "Paused" : "On"}</p>
              <input
                value={msgs[f.id] ?? f.message}
                onChange={(e) => setMsgs({ ...msgs, [f.id]: e.target.value })}
                maxLength={200}
                placeholder="Message users see while paused (optional)"
                className="mt-2 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
