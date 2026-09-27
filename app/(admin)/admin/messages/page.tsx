"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { PageTitle, Panel, errorText } from "@/src/components/admin/kit";

export default function AdminMessages() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!window.confirm(`Send "${title}" to every active user?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ sent: number }>("/api/v1/admin/broadcast", { title, body });
      setMsg({ ok: true, text: `Sent to ${res.sent} user${res.sent === 1 ? "" : "s"}. They'll see it under the bell icon.` });
      setTitle("");
      setBody("");
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle title="Announcements" sub="Post a message to every user's in-app notifications — new features, maintenance, tips." />
      <Panel title="New announcement" className="max-w-2xl">
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-text">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="New: AI thumbnails in the video generator" className="h-10 w-full rounded-lg border border-border bg-background px-3" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs text-muted-text">Message</span>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={5} placeholder="Tell creators what's new and why it helps them." className="w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-text">{body.length}/1000</span>
            <Button disabled={title.trim().length < 3} loading={busy} onClick={() => void send()}><Send className="size-4" aria-hidden="true" /> Send to everyone</Button>
          </div>
          {msg && <p className={msg.ok ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
        </div>
      </Panel>
    </>
  );
}
