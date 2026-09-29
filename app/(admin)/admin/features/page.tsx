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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((f) => (
            <li key={f.id} className={cx("flex flex-col rounded-xl border bg-surface p-4", f.off ? "border-destructive/40" : "border-border")}>
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
              <p className={cx("mb-2 mt-2 text-xs font-semibold", f.off ? "text-destructive" : "text-success")}>{f.off ? "Paused" : "On"}</p>
              <input
                value={msgs[f.id] ?? f.message}
                onChange={(e) => setMsgs({ ...msgs, [f.id]: e.target.value })}
                maxLength={200}
                placeholder="Message users see while paused (optional)"
                className="mt-auto h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
              />
            </li>
          ))}
        </ul>
      )}
      <CloudflareModels />
    </>
  );
}

interface CfGroup { kind: "text" | "images" | "captions"; models: { id: string; name: string; author: string; description: string; on: boolean }[] }
const KIND_TAG = { text: "Text Generation", images: "Text-to-Image", captions: "Speech Recognition" } as const;
const KIND_LABEL = { text: "Text (scripts, titles, ideas, support)", images: "Pictures (scenes, thumbnails)", captions: "Captions (speech to text)" } as const;

/** One switch per free Cloudflare AI model; switched-off models are skipped everywhere. */
function CloudflareModels() {
  const { data, error, reload } = useAdmin<{ configured: boolean; groups: CfGroup[] }>("/api/v1/admin/features/cloudflare");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function flip(id: string, on: boolean) {
    setBusy(id);
    setErr(null);
    try {
      await api.put("/api/v1/admin/features/cloudflare", { id, on });
      await reload();
    } catch (e) {
      setErr(errorText(e));
    }
    setBusy(null);
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Cloudflare AI models</h2>
      <p className="mb-3 text-sm text-muted-text">Free backup models, tried in this order when the main AI is busy. Switch off any you don&apos;t want used. Changes apply within about 20 seconds.</p>
      {err && <p role="alert" className="mb-3 text-sm text-destructive">{err}</p>}
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : !data.configured ? (
        <p className="text-sm text-muted-text">Cloudflare AI isn&apos;t set up (CF_AI_TOKEN is missing).</p>
      ) : (
        <div className="space-y-5">
          {data.groups.map((g) => (
            <div key={g.kind}>
              <p className="mb-2 text-sm font-semibold">{KIND_LABEL[g.kind]} <span className="font-normal text-muted-text">· {g.models.filter((m) => m.on).length}/{g.models.length} on</span></p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.models.map((m) => (
                  <li key={m.id} className={cx("flex flex-col rounded-xl border bg-surface p-4", m.on ? "border-border" : "border-border opacity-60")}>
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 truncate font-semibold" title={m.id}>{m.name}</p>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={m.on}
                        aria-label={`${m.name}: ${m.on ? "on" : "off"}`}
                        disabled={busy === m.id}
                        onClick={() => void flip(m.id, !m.on)}
                        className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-50", m.on ? "bg-success" : "bg-muted")}
                      >
                        <span className={cx("absolute top-1 size-4 rounded-full bg-white shadow transition-all", m.on ? "left-5" : "left-1")} />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-medium">{m.author}</span>
                      <span className="rounded-full border border-border px-2 py-0.5">{KIND_TAG[g.kind]}</span>
                    </div>
                    {m.description && <p className="mt-2 line-clamp-2 text-xs text-muted-text">{m.description}</p>}
                    <p className={cx("mt-auto pt-3 text-xs font-semibold", m.on ? "text-success" : "text-muted-text")}>{m.on ? "On" : "Off"}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
