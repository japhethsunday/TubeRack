"use client";

import { useState } from "react";
import { Mail, Play } from "lucide-react";
import { api } from "@/src/lib/api";
import { Badge } from "@/src/components/ui/Badge";
import { Button } from "@/src/components/ui/Button";
import { Loading, PageTitle, Panel, errorText, useAdmin } from "@/src/components/admin/kit";

export default function AdminSystem() {
  const { data, error, reload } = useAdmin<{ services: { name: string; ok: boolean }[] }>("/api/v1/admin/overview");
  const [busy, setBusy] = useState<string | null>(null);
  const [out, setOut] = useState<string | null>(null);

  async function run(action: "run-daily" | "test-email", confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(action);
    setOut(null);
    try {
      const res = await api.post<unknown>("/api/v1/admin/system", { action });
      setOut(JSON.stringify(res, null, 2));
    } catch (e) {
      setOut(errorText(e));
    }
    setBusy(null);
  }

  return (
    <>
      <PageTitle title="System" sub="Service health and maintenance tools." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Services">
          {!data ? <Loading error={error} onRetry={() => void reload()} /> : (
            <ul className="space-y-1.5 text-sm">
              {data.services.map((s) => <li key={s.name} className="flex items-center justify-between"><span>{s.name}</span><Badge tone={s.ok ? "ok" : "bad"}>{s.ok ? "Connected" : "Missing"}</Badge></li>)}
            </ul>
          )}
        </Panel>
        <Panel title="Maintenance">
          <div className="space-y-4 text-sm">
            <div>
              <div className="font-medium">Run the daily job now</div>
              <p className="mb-2 text-xs text-muted-text">Sends niche briefs, breakout alerts, competitor alerts and reminders, rotates A/B tests and cleans up. Normally runs at 07:00 UTC.</p>
              <Button size="sm" variant="outline" loading={busy === "run-daily"} onClick={() => void run("run-daily", "Run the daily job now? Users may receive emails.")}><Play className="size-4" aria-hidden="true" /> Run now</Button>
            </div>
            <div>
              <div className="font-medium">Send a test email</div>
              <p className="mb-2 text-xs text-muted-text">Sends a branded test email to your admin address to confirm email delivery works.</p>
              <Button size="sm" variant="outline" loading={busy === "test-email"} onClick={() => void run("test-email", "Send a test email to yourself?")}><Mail className="size-4" aria-hidden="true" /> Send test email</Button>
            </div>
            {out && <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs">{out}</pre>}
          </div>
        </Panel>
      </div>
    </>
  );
}
