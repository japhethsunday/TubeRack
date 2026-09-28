"use client";

import { useEffect, useMemo, useState } from "react";
import { Send, ShieldCheck, LifeBuoy } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { AiWriter, Loading, PageTitle, Panel, errorText, useAdmin } from "@/src/components/admin/kit";

interface Field { key: string; label: string; multiline?: boolean; placeholder?: string; optional?: boolean; default?: string }
interface Template { id: string; name: string; mailbox: "support" | "security"; description: string; fields: Field[] }

export default function AdminEmail() {
  const { data, error, reload } = useAdmin<Template[]>("/api/v1/admin/email");
  const [id, setId] = useState("support-reply");
  const [to, setTo] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mailbox, setMailbox] = useState<"support" | "security" | null>(null);
  const [found, setFound] = useState<{ email: string; name: string } | null>(null);
  const t = useMemo(() => data?.find((x) => x.id === id) ?? null, [data, id]);

  /** Fill a template with its ready-to-send defaults (plus the recipient's name if we know it). */
  function fillFrom(tpl: Template, name = found?.name ?? "") {
    const d = new Date();
    const ref = `SEC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
    const next: Record<string, string> = {};
    for (const f of tpl.fields) next[f.key] = (f.default ?? "").replace("{{ref}}", ref);
    if (tpl.fields.some((f) => f.key === "name")) next.name = name.split(" ")[0] ?? "";
    if (tpl.fields.some((f) => f.key === "email") && /.+@.+\..+/.test(to)) next.email = to.trim();
    setFields(next);
  }

  // The first template gets its defaults as soon as the list loads.
  const [filledFor, setFilledFor] = useState<string | null>(null);
  useEffect(() => {
    if (!t || filledFor === t.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-fill once when the template list arrives.
    setFilledFor(t.id);
    fillFrom(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fillFrom reads current state on purpose.
  }, [t, filledFor]);

  // Look up the recipient: if they have an account, use their first name.
  useEffect(() => {
    const email = to.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    const timer = window.setTimeout(() => {
      api
        .get<{ found: boolean; name?: string }>(`/api/v1/admin/email?lookup=${encodeURIComponent(email)}`)
        .then((r) => {
          setFound(r.found ? { email, name: r.name ?? "" } : null);
          if (r.found && r.name) setFields((f) => ("name" in f && !f.name ? { ...f, name: r.name!.split(" ")[0] } : f));
        })
        .catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [to]);

  // Live preview, debounced.
  useEffect(() => {
    if (!t) return;
    const timer = window.setTimeout(() => {
      api.post<{ subject: string; html: string }>("/api/v1/admin/email", { template: t.id, fields, preview: true }).then(setPreview).catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [t, fields]);

  const box = mailbox ?? t?.mailbox ?? "support";
  const address = `${box}@recktube.xyz`;

  async function send() {
    if (!t || !window.confirm(`Send "${preview?.subject ?? t.name}" from ${address} to ${to}?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/v1/admin/email", { template: t.id, to: to.trim(), fields, mailbox: box });
      setMsg({ ok: true, text: `Sent from ${address} to ${to.trim()}. Replies go to ${address}.` });
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
              <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
                {data.map((x) => (
                  <li key={x.id}>
                    <button
                      onClick={() => { setId(x.id); setMsg(null); setMailbox(null); setFilledFor(x.id); fillFrom(x); }}
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
              <Panel title={`From: Recktube ${box === "security" ? "Security" : "Support"}`}>
                <div className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-text">Send from</span>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-1" role="radiogroup" aria-label="Send from">
                      {(["support", "security"] as const).map((m) => (
                        <button
                          key={m}
                          role="radio"
                          aria-checked={box === m}
                          onClick={() => setMailbox(m)}
                          className={cx("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium", box === m ? "bg-primary/15 text-primary" : "text-muted-text hover:bg-muted")}
                        >
                          {m === "security" ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <LifeBuoy className="size-3.5" aria-hidden="true" />}
                          {m}@recktube.xyz
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-text">To</span>
                    <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="creator@example.com" className="h-9 w-full rounded-lg border border-border bg-background px-2.5" />
                    {found && found.email === to.trim().toLowerCase() && (
                      <span className="block text-[11px] text-success">Recktube user{found.name ? `: ${found.name}` : ""} — name filled in.</span>
                    )}
                  </label>
                  <AiWriter
                    title="Write this email with AI"
                    hint={`Say what it should tell them — the AI fills in the “${t.name}” template using the recipient's account. Review before sending.`}
                    placeholder="e.g. “Tell Ada her voice-over bug is fixed, thank her for the report and add 300 credits”"
                    requireBrief
                    hasDraft={t.fields.some((f) => f.key !== "name" && (fields[f.key] ?? "") !== (f.default ?? "") && Boolean(fields[f.key]))}
                    onWrite={async (instruction) => {
                      const r = await api.post<{ fields: Record<string, string> }>("/api/v1/admin/email/draft", { template: t.id, instruction, to: /.+@.+\..+/.test(to) ? to.trim() : "", current: fields });
                      setFields((f) => ({ ...f, ...r.fields }));
                      setMsg(null);
                    }}
                  />
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
                  <button type="button" onClick={() => fillFrom(t)} className="text-xs text-muted-text underline-offset-4 hover:text-foreground hover:underline">Reset to the template&apos;s text</button>
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
