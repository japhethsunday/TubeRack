"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CalendarClock, Megaphone, Plus, Save, Send, TestTube2, Trash2 } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";
import { AiWriter, Kpi, Loading, PageTitle, Panel, errorText, when } from "@/src/components/admin/kit";

interface Stats { recipients: number; sent: number; failed: number; skipped: number; queued: number; opened: number; clicked: number; unsubscribed: number }
interface Audience { key: string; label: string; hint: string }
interface Row { id: string; name: string; subject: string; audience: string; status: string; scheduledAt: string | null; sentAt: string | null; createdAt: string; stats: Stats }
interface ListData { campaigns: Row[]; audiences: Audience[]; counts: Record<string, number> }
interface Content { preheader: string; heading: string; body: string; ctaLabel: string; ctaUrl: string; videoUrl: string; videoThumb: string; videoTitle: string }
interface Detail { id: string; name: string; subject: string; audience: string; status: string; content: Content; scheduledAt: string | null; sentAt: string | null; stats: Stats; previewHtml: string }

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const STATUS: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", sending: "Sending…", sent: "Sent", failed: "Failed" };
const input = "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm";

export default function AdminCampaigns() {
  const [list, setList] = useState<ListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [at, setAt] = useState("");

  const loadList = useCallback(async () => {
    try {
      setList(await api.get<ListData>("/api/v1/admin/campaigns"));
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  const loadOne = useCallback(async (id: string) => {
    try {
      setD(await api.get<Detail>(`/api/v1/admin/campaigns/${id}`));
      setDirty(false);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load from the backend on first view.
    void loadList();
  }, [loadList]);

  function open(id: string) {
    setOpenId(id);
    setD(null);
    setMsg(null);
    void loadOne(id);
  }

  async function create() {
    if (!newName.trim()) return;
    setBusy("create");
    try {
      const r = await api.post<{ id: string }>("/api/v1/admin/campaigns", { name: newName.trim(), audience: "opted_in" });
      setNewName("");
      await loadList();
      open(r.id);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(null);
  }

  const editable = d && (d.status === "draft" || d.status === "scheduled");
  const set = (patch: Partial<Detail>) => {
    if (!d) return;
    setD({ ...d, ...patch });
    setDirty(true);
  };
  const setC = (patch: Partial<Content>) => d && set({ content: { ...d.content, ...patch } });

  async function save(quiet = false) {
    if (!d) return false;
    setBusy("save");
    try {
      await api.patch(`/api/v1/admin/campaigns/${d.id}`, { name: d.name, subject: d.subject, audience: d.audience, content: d.content });
      await loadOne(d.id);
      if (!quiet) setMsg({ ok: true, text: "Saved." });
      void loadList();
      setBusy(null);
      return true;
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
      setBusy(null);
      return false;
    }
  }

  async function act(action: "test" | "send" | "schedule" | "unschedule") {
    if (!d || !list) return;
    if (dirty && !(await save(true))) return;
    const count = list.counts[d.audience] ?? 0;
    if (action === "send" && !window.confirm(`Send “${d.subject}” to ${count} opted-in ${count === 1 ? "person" : "people"} now? This can't be undone.`)) return;
    setBusy(action);
    setMsg(null);
    try {
      if (action === "test") {
        const r = await api.post<{ to: string }>(`/api/v1/admin/campaigns/${d.id}`, { action });
        setMsg({ ok: true, text: `Test sent to ${r.to}.` });
      } else if (action === "send") {
        const r = await api.post<{ sent: number; failed: number; remaining: number }>(`/api/v1/admin/campaigns/${d.id}`, { action });
        setMsg({ ok: r.failed === 0, text: `Sent ${r.sent}${r.failed ? `, ${r.failed} failed` : ""}${r.remaining ? ` — ${r.remaining} still queued; press Send again to continue (the daily run also finishes it).` : "."}` });
      } else if (action === "schedule") {
        if (!at) throw new Error("Pick a date and time.");
        await api.post(`/api/v1/admin/campaigns/${d.id}`, { action, at: new Date(at).toISOString() });
        setMsg({ ok: true, text: "Scheduled. It goes out on the first daily run (07:00 UTC) after that time." });
      } else {
        await api.post(`/api/v1/admin/campaigns/${d.id}`, { action });
      }
      await Promise.all([loadOne(d.id), loadList()]);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error && !("status" in e) ? e.message : errorText(e) });
    }
    setBusy(null);
  }

  async function remove() {
    if (!d || !window.confirm(`Delete the draft “${d.name}”?`)) return;
    try {
      await api.remove(`/api/v1/admin/campaigns/${d.id}`);
      setOpenId(null);
      setD(null);
      await loadList();
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
  }

  return (
    <>
      <PageTitle title="Campaigns" sub="Email your own users about new features and tips. Only people who opted in are ever emailed; every email has one-click unsubscribe." />
      {!list ? <Loading error={error} onRetry={() => void loadList()} /> : (
        <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className={cx("space-y-3", openId && "hidden xl:block")}>
            <Panel title="New campaign">
              <div className="flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void create()} maxLength={120} placeholder="e.g. Channel Creator launch" className={input} />
                <Button size="sm" loading={busy === "create"} disabled={!newName.trim()} onClick={() => void create()}><Plus className="size-4" /> Create</Button>
              </div>
            </Panel>
            <Panel>
              {list.campaigns.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-text"><Megaphone className="mx-auto mb-2 size-8 opacity-50" />No campaigns yet.</p>
              ) : (
                <ul className="-m-4 divide-y divide-border">
                  {list.campaigns.map((c) => (
                    <li key={c.id}>
                      <button onClick={() => open(c.id)} className={cx("w-full px-4 py-3 text-left", openId === c.id ? "bg-primary/10" : "hover:bg-muted")}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{c.name}</span>
                          <span className={cx("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", c.status === "sent" ? "bg-success/15 text-success" : c.status === "scheduled" ? "bg-warning/15 text-warning" : "bg-muted text-muted-text")}>{STATUS[c.status] ?? c.status}</span>
                        </span>
                        <span className="block truncate text-xs text-muted-text">{c.subject || "No subject yet"}</span>
                        {c.stats.sent > 0 && (
                          <span className="mt-1 block text-[11px] text-muted-text">{c.stats.sent} sent · {pct(c.stats.opened, c.stats.sent)} opened · {pct(c.stats.clicked, c.stats.sent)} clicked</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className={cx(!openId && "hidden xl:block")}>
            {!openId ? (
              <Panel><p className="py-16 text-center text-sm text-muted-text">Create or choose a campaign.</p></Panel>
            ) : !d ? (
              <Loading error={msg && !msg.ok ? msg.text : null} onRetry={() => open(openId)} />
            ) : (
              <div className="space-y-4">
                <button onClick={() => setOpenId(null)} className="inline-flex items-center gap-1 text-sm text-muted-text hover:text-foreground xl:hidden"><ArrowLeft className="size-4" /> Back</button>
                {d.stats.recipients > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <Kpi label="Recipients" value={d.stats.recipients} />
                    <Kpi label="Delivered" value={d.stats.sent} hint={d.stats.queued ? `${d.stats.queued} queued` : d.stats.failed ? `${d.stats.failed} failed` : undefined} />
                    <Kpi label="Opened" value={pct(d.stats.opened, d.stats.sent)} hint={`${d.stats.opened} people`} tone="good" />
                    <Kpi label="Clicked" value={pct(d.stats.clicked, d.stats.sent)} hint={`${d.stats.clicked} people`} tone="good" />
                    <Kpi label="Unsubscribed" value={d.stats.unsubscribed} tone={d.stats.unsubscribed ? "bad" : undefined} />
                  </div>
                )}
                <div className="grid gap-4 2xl:grid-cols-2">
                  <Panel
                    title={editable ? "Compose" : `${STATUS[d.status]} ${d.sentAt ? when(d.sentAt) : ""}`}
                    right={d.status === "draft" ? <Button size="sm" variant="ghost" onClick={() => void remove()}><Trash2 className="size-4" /></Button> : undefined}
                  >
                    <fieldset disabled={!editable} className="space-y-3 text-sm">
                      <label className="block space-y-1"><span className="text-xs text-muted-text">Campaign name (internal)</span><input className={input} value={d.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} /></label>
                      <label className="block space-y-1">
                        <span className="text-xs text-muted-text">Audience</span>
                        <select className={input} value={d.audience} onChange={(e) => set({ audience: e.target.value })}>
                          {list.audiences.map((a) => <option key={a.key} value={a.key}>{a.label} ({list.counts[a.key] ?? 0})</option>)}
                        </select>
                        <span className="block text-[11px] text-muted-text">{list.audiences.find((a) => a.key === d.audience)?.hint} Only opted-in, verified accounts.</span>
                      </label>
                      {editable && (
                        <AiWriter
                          title="Write with AI"
                          hint="Describe the email; the AI writes the subject, headline, body and button using real Recktube features."
                          placeholder="e.g. “Announce Channel Creator: it plans a whole channel in a minute — invite people to try it”"
                          requireBrief
                          hasDraft={Boolean(d.subject || d.content.body)}
                          onWrite={async (brief) => {
                            if (dirty) await save(true);
                            const r = await api.post<{ subject: string; content: Content }>(`/api/v1/admin/campaigns/${d.id}`, { action: "write", brief });
                            setD((cur) => (cur ? { ...cur, subject: r.subject, content: r.content } : cur));
                            setDirty(true);
                          }}
                        />
                      )}
                      <label className="block space-y-1"><span className="text-xs text-muted-text">Subject line *</span><input className={input} value={d.subject} onChange={(e) => set({ subject: e.target.value })} maxLength={120} /></label>
                      <label className="block space-y-1"><span className="text-xs text-muted-text">Preview text (shown after the subject in inboxes)</span><input className={input} value={d.content.preheader} onChange={(e) => setC({ preheader: e.target.value })} maxLength={160} /></label>
                      <label className="block space-y-1"><span className="text-xs text-muted-text">Headline</span><input className={input} value={d.content.heading} onChange={(e) => setC({ heading: e.target.value })} maxLength={120} /></label>
                      <label className="block space-y-1"><span className="text-xs text-muted-text">Message (blank line between paragraphs)</span><textarea rows={7} className="w-full rounded-lg border border-border bg-background px-2.5 py-2" value={d.content.body} onChange={(e) => setC({ body: e.target.value })} maxLength={6000} /></label>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block space-y-1"><span className="text-xs text-muted-text">Button label</span><input className={input} value={d.content.ctaLabel} onChange={(e) => setC({ ctaLabel: e.target.value })} maxLength={40} /></label>
                        <label className="block space-y-1"><span className="text-xs text-muted-text">Button link (/path or https://)</span><input className={input} value={d.content.ctaUrl} onChange={(e) => setC({ ctaUrl: e.target.value })} maxLength={500} /></label>
                      </div>
                      <details className="rounded-lg border border-border p-3">
                        <summary className="cursor-pointer text-xs font-semibold">Feature a video (optional)</summary>
                        <div className="mt-3 space-y-2">
                          <label className="block space-y-1"><span className="text-xs text-muted-text">Video link (YouTube/TikTok, https://)</span><input className={input} value={d.content.videoUrl} onChange={(e) => setC({ videoUrl: e.target.value })} maxLength={500} /></label>
                          <label className="block space-y-1"><span className="text-xs text-muted-text">Thumbnail image link (https://)</span><input className={input} value={d.content.videoThumb} onChange={(e) => setC({ videoThumb: e.target.value })} maxLength={500} /></label>
                          <label className="block space-y-1"><span className="text-xs text-muted-text">Video title</span><input className={input} value={d.content.videoTitle} onChange={(e) => setC({ videoTitle: e.target.value })} maxLength={160} /></label>
                          <p className="text-[11px] text-muted-text">Tip: make one in Admin → Promo videos, publish it, then paste the link and its thumbnail here.</p>
                        </div>
                      </details>
                    </fieldset>
                    {editable && (
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" disabled={!dirty} loading={busy === "save"} onClick={() => void save()}><Save className="size-4" /> Save</Button>
                          <Button size="sm" variant="outline" loading={busy === "test"} onClick={() => void act("test")}><TestTube2 className="size-4" /> Send test to me</Button>
                          <Button size="sm" loading={busy === "send"} onClick={() => void act("send")}><Send className="size-4" /> Send now to {list.counts[d.audience] ?? 0}</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label="Schedule for" />
                          {d.status === "scheduled" ? (
                            <Button size="sm" variant="ghost" loading={busy === "unschedule"} onClick={() => void act("unschedule")}>Cancel schedule ({d.scheduledAt ? when(d.scheduledAt) : ""})</Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled={!at} loading={busy === "schedule"} onClick={() => void act("schedule")}><CalendarClock className="size-4" /> Schedule</Button>
                          )}
                        </div>
                      </div>
                    )}
                    {d.status === "sending" && (
                      <div className="mt-4 border-t border-border pt-4">
                        <Button size="sm" loading={busy === "send"} onClick={() => void act("send")}><Send className="size-4" /> Continue sending ({d.stats.queued} left)</Button>
                      </div>
                    )}
                    {msg && <p className={cx("mt-3 text-xs", msg.ok ? "text-success" : "text-destructive")}>{msg.text}</p>}
                  </Panel>
                  <Panel title="Preview" right={dirty ? <span className="text-[11px] text-warning">Save to refresh</span> : undefined}>
                    <iframe title="Campaign preview" srcDoc={d.previewHtml} sandbox="" className="h-[760px] w-full rounded-lg bg-white" />
                  </Panel>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
