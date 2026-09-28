"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, ShieldCheck, LifeBuoy } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { Loading, PageTitle, Panel, errorText, useAdmin } from "@/src/components/admin/kit";

interface Field { key: string; label: string; multiline?: boolean; placeholder?: string; optional?: boolean }
interface Template { id: string; name: string; mailbox: "support" | "security"; description: string; fields: Field[] }

export default function AdminEmail() {
  const { data, error, reload } = useAdmin<Template[]>("/api/v1/admin/email");
  const [id, setId] = useState("support-reply");
  const [to, setTo] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = useMemo(() => data?.find((x) => x.id === id) ?? null, [data, id]);

  // Live preview, debounced.
  useEffect(() => {
    if (!t) return;
    const timer = window.setTimeout(() => {
      api.post<{ subject: string; html: string }>("/api/v1/admin/email", { template: t.id, fields, preview: true }).then(setPreview).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [t, fields]);

  async function send() {
    if (!t || !window.confirm(`Send "${preview?.subject ?? t.name}" to ${to}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/v1/admin/email", { template: t.id, to: to.trim(), fields });
      setMsg({ ok: true, text: `Sent to ${to.trim()}. Replies go to ${t.mailbox}@recktube.xyz.` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="Email" sub="Send branded emails as Recktube Support or Recktube Security. Replies come back to your support@ and security@ addresses." />
      {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
        <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Panel title="Template">
              <ul className="space-y-1">
                {data.map((x) => (
                  <li key={x.id}>
                    <button
                      onClick={() => { setId(x.id); setMsg(null); }}
                      className={cx("flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left", id === x.id ? "bg-primary/15" : "hover:bg-muted")}
                    >
                      {x.mailbox === "security" ? <ShieldCheck className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" /> : <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
                      <span>
                        <span className={cx("block text-sm font-medium", id === x.id && "text-primary")}>{x.name}</span>
                        <span className="block text-xs text-muted-text">{x.description}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>
            {t && (
              <Panel title={`From: Recktube ${t.mailbox === "security" ? "Security" : "Support"}`}>
                <div className="space-y-3 text-sm">
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-text">To</span>
                    <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="creator@example.com" className="h-9 w-full rounded-lg border border-border bg-background px-2.5" />
                  </label>
                  {t.fields.map((f) => (
                    <label key={f.key} className="block space-y-1">
                      <span className="text-xs text-muted-text">{f.label}{f.optional ? "" : " *"}</span>
                      {f.multiline ? (
                        <textarea rows={5} value={fields[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} className="w-full rounded-lg border border-border bg-background px-2.5 py-2" />
                      ) : (
                        <input value={fields[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} className="h-9 w-full rounded-lg border border-border bg-background px-2.5" />
                      )}
                    </label>
                  ))}
                  <Button className="w-full" disabled={!/.+@.+\..+/.test(to)} loading={busy} onClick={() => void send()}><Send className="size-4" aria-hidden="true" /> Send email</Button>
                  {msg && <p className={cx("text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
                </div>
              </Panel>
            )}
          </div>
          <Panel title="Preview" right={preview && <span className="max-w-[60%] truncate text-xs text-muted-text">Subject: {preview.subject}</span>}>
            {preview ? (
              <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[760px] w-full rounded-lg bg-white" />
            ) : (
              <p className="text-sm text-muted-text">Loading preview…</p>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
