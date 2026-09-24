"use client";

import { useState } from "react";
import { MonitorPlay, Download } from "lucide-react";
import { fetchYouTubeVideo } from "@/src/lib/ai-client";
import { useProjects } from "@/src/components/projects/ProjectsProvider";
import { useAnalytics } from "@/src/components/analytics/AnalyticsProvider";
import { Input, Select } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/**
 * Import live public stats for a published YouTube video into a project's
 * performance log (Data API via /api/v1/youtube/video). Only numbers the
 * API returns are logged; nothing is estimated.
 */
export function ConnectionBanner({ compact: small }: { compact?: boolean }) {
  const { projects } = useProjects();
  const { logEntry } = useAnalytics();
  const active = projects.filter((p) => p.status !== "archived");
  const [projectId, setProjectId] = useState(active[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (small) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-text">
        <MonitorPlay className="size-3.5" aria-hidden="true" />
        Import live YouTube stats from the Analytics page.
      </p>
    );
  }

  async function importStats(e: React.FormEvent) {
    e.preventDefault();
    const pid = projectId || active[0]?.id;
    if (!pid || !url.trim()) return;
    setBusy(true);
    setMessage(null);
    const outcome = await fetchYouTubeVideo(url.trim());
    setBusy(false);
    if (!outcome.ok) {
      setMessage({ ok: false, text: outcome.message });
      return;
    }
    const m = outcome.data.metrics ?? {};
    if (typeof m.views !== "number") {
      setMessage({ ok: false, text: `Found “${outcome.data.title}”, but YouTube returned no public view count for it.` });
      return;
    }
    logEntry({
      projectId: pid,
      platform: "youtube",
      date: new Date().toISOString().slice(0, 10),
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      notes: `Imported from YouTube (${outcome.data.metricsProvenance ?? "api"}): ${outcome.data.title}`,
    });
    setUrl("");
    setMessage({
      ok: true,
      text: `Logged “${outcome.data.title}”: ${compact.format(m.views)} views${typeof m.likes === "number" ? `, ${compact.format(m.likes)} likes` : ""}${typeof m.comments === "number" ? `, ${compact.format(m.comments)} comments` : ""}.`,
    });
  }

  return (
    <section aria-label="Import from YouTube" className="rounded-xl border border-border bg-surface p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MonitorPlay className="size-4 text-red-500" aria-hidden="true" />
        Import live stats from YouTube
      </h2>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-muted-text">Create a project first, then import the stats of its published video.</p>
      ) : (
        <form onSubmit={importStats} className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
          <Select label="Project" value={projectId || active[0]?.id} onChange={(e) => setProjectId(e.target.value)}>
            {active.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Input label="Published video link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtu.be/…" />
          <Button type="submit" loading={busy} disabled={!url.trim()}>
            <Download className="size-4" aria-hidden="true" />
            Import
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${message.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          {message.text}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-text">Requires sign-in. Each import is a dated snapshot — import again later to track growth.</p>
    </section>
  );
}
