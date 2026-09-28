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
  const [busy, setBusy] = useState<"welcome" | "offers" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Panel title="Welcome series & offers (automatic)" className="mb-6">
      <p className="text-sm text-muted-text">Sent once to each new creator who opted in to product email. Every email has one-click unsubscribe.</p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((s) => (
          <li key={s.day} className="flex gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 font-semibold text-primary">{s.day}</span>
            <span className="min-w-0"><span className="block font-medium">{s.title}</span><span className="block text-xs text-muted-text">{s.from}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-sm font-semibold">Personal offers (automatic)</p>
        <ul className="mt-1 space-y-1 text-xs text-muted-text">
          <li>• <strong className="text-foreground">Credits almost gone</strong> (made a video, ≤10 left): +50 credit code, max once a month</li>
          <li>• <strong className="text-foreground">Making Shorts</strong> (mostly Shorts projects): Shorts tips + 30 credit code, once</li>
          <li>• <strong className="text-foreground">No video after 10 days</strong>: +20 starter code, once</li>
        </ul>
        <p className="mt-1 text-xs text-muted-text">Each code works only for that person and expires in 72 hours. Track them in Money → Bonus codes.</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["welcome", "offers"] as const).map((set) => (
          <Button
            key={set}
            size="sm"
            variant="outline"
            loading={busy === set}
            onClick={async () => {
              setBusy(set);
              setMsg(null);
              try {
                const r = await api.post<{ sent: number }>(`/api/v1/admin/welcome-preview?set=${set}`);
                setMsg(`Sent ${r.sent} preview emails to your inbox.`);
              } catch (e) {
                setMsg(errorText(e));
              }
              setBusy(null);
            }}
          >
            {set === "welcome" ? "Preview welcome emails (5)" : "Preview offer emails (3)"}
          </Button>
        ))}
      </div>
      {msg && <p className="mt-2 text-sm text-muted-text">{msg}</p>}
    </Panel>
  );
}
