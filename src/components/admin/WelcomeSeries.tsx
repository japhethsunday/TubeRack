"use client";

import { useState } from "react";
import { api } from "@/src/lib/api";
import { Button } from "@/src/components/ui/Button";
import { errorText, Panel } from "@/src/components/admin/kit";

const STEPS = [
  { day: "Day 0", title: "A personal welcome to Recktube", from: "Japheth (founder letter + 100 free credits)" },
  { day: "Day 1", title: "Your first video, in 3 steps", from: "Ada, your guide" },
  { day: "Day 2", title: "Your 100 credits are waiting", from: "Ada — skipped if they already made a video" },
  { day: "Day 4", title: "The niches that pay creators the most", from: "Ada" },
  { day: "Day 7", title: "How's it going?", from: "Japheth — replies land in your Inbox" },
];

/** The automatic welcome series: what's sent when, plus a preview to your own inbox. */
export function WelcomeSeries() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Panel title="Welcome series (automatic)" className="mb-6">
      <p className="text-sm text-muted-text">Sent once to each new creator who opted in to product email. Every email has one-click unsubscribe.</p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((s) => (
          <li key={s.day} className="flex gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 font-semibold text-primary">{s.day}</span>
            <span className="min-w-0"><span className="block font-medium">{s.title}</span><span className="block text-xs text-muted-text">{s.from}</span></span>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="outline"
        className="mt-3"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await api.post<{ sent: number }>("/api/v1/admin/welcome-preview");
            setMsg(`Sent ${r.sent} preview emails to your inbox.`);
          } catch (e) {
            setMsg(errorText(e));
          }
          setBusy(false);
        }}
      >
        Send me a preview of all 5
      </Button>
      {msg && <p className="mt-2 text-sm text-muted-text">{msg}</p>}
    </Panel>
  );
}
