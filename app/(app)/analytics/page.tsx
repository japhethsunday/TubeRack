"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useAnalytics, AnalyticsStorageNote } from "@/src/components/analytics/AnalyticsProvider";
import { useProjects, LocalStorageNote } from "@/src/components/projects/ProjectsProvider";
import { useIntel } from "@/src/components/intelligence/IntelProvider";
import { useScripts } from "@/src/components/script/ScriptProvider";
import { useIntelQuery } from "@/src/components/intelligence/chrome";
import { MetricCard, TrendChart, BarList } from "@/src/components/analytics/charts";
import { ConnectionBanner } from "@/src/components/analytics/ConnectionBanner";
import { RangePicker, EntryForm, ContentTable, VideoDetail, RetentionPanel, EntryEditModal } from "@/src/components/analytics/panels";
import { InsightCard, SignalsPanel, AlertsPanel, ReportsPanel } from "@/src/components/analytics/intelligence-panels";
import { Breadcrumb } from "@/src/components/ui/data";
import { Tabs } from "@/src/components/ui/Tabs";
import { Button } from "@/src/components/ui/Button";
import { Select } from "@/src/components/ui/fields";
import { EmptyState } from "@/src/components/ui/states";
import { LoadingState } from "@/src/components/ui/feedback";
import { useToast } from "@/src/components/ui/Toast";
import {
  sum,
  engagementRate,
  growthRate,
  average,
  splitPeriod,
  formatDelta,
  formatCompact,
  groupBy,
} from "@/src/lib/analytics/metrics";
import { analyzeFormats, analyzeTopics, analyzePackaging, formatTable } from "@/src/lib/analytics/insights";
import { computeAlerts } from "@/src/lib/analytics/alerts";
import { entriesToCsv } from "@/src/lib/analytics/storage";
import { progressOf } from "@/src/lib/projects/store";
import type { PerformanceEntry } from "@/src/lib/analytics/types";

const TAB_IDS = ["overview", "content", "retention", "packaging", "intelligence", "alerts"] as const;
type TabId = (typeof TAB_IDS)[number];

function isTabId(v: string | null): v is TabId {
  return (TAB_IDS as readonly string[]).includes(v ?? "");
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Analytics" />}>
      <Workspace />
    </Suspense>
  );
}

function Workspace() {
  const params = useIntelQuery();
  const { ready: projectsReady, projects, channelName } = useProjects();
  const { ready: intelReady, intelFor, saveOpportunity } = useIntel();
  const { ready: scriptsReady, scriptFor } = useScripts();
  const { ready: analyticsReady, entries, retentionFor, saveSignal, signals, snapshots, saveSnapshot, removeSnapshot } = useAnalytics();
  const { push } = useToast();

  const [tab, setTab] = useState<TabId>("overview");
  const [range, setRange] = useState(28);
  const [channelId, setChannelId] = useState("all");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [sort, setSort] = useState<"views" | "recent">("views");
  const [videoId, setVideoId] = useState<string | null>(params.projectId);
  const [editing, setEditing] = useState<PerformanceEntry | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [savedInsights, setSavedInsights] = useState<string[]>([]);

  const ready = projectsReady && intelReady && scriptsReady && analyticsReady;
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Unknown project";
  const formatOf = (id: string) => projects.find((p) => p.id === id)?.contentType ?? "Unknown";
  const topicOf = (id: string) => projects.find((p) => p.id === id)?.topic ?? "";

  const scoped = useMemo(
    () => (channelId === "all" ? entries : entries.filter((e) => projects.find((p) => p.id === e.projectId)?.channelId === channelId)),
    [entries, channelId, projects],
  );
  const split = useMemo(() => splitPeriod(scoped, range), [scoped, range]);
  const channels = useMemo(() => {
    const ids = [...new Set(projects.map((p) => p.channelId))];
    return ids.map((id) => ({ id, name: channelName(id) }));
  }, [projects, channelName]);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <LoadingState label="Loading Analytics" />
      </div>
    );
  }

  const views = sum(split.current, (e) => e.views);
  const prevViews = sum(split.previous, (e) => e.views);
  const watch = sum(split.current, (e) => e.watchHours);
  const prevWatch = sum(split.previous, (e) => e.watchHours);
  const subs = sum(split.current, (e) => e.subsGained);
  const eng = engagementRate(split.current);
  const avgDur = average(split.current.map((e) => e.avgViewDurationSec ?? 0).filter((v) => v > 0));
  const impressions = sum(split.current, (e) => e.impressions);

  const viewsByDay = split.current.map((e) => ({ at: e.date, value: e.views }));
  const watchByDay = split.current
    .filter((e) => (e.watchHours ?? 0) > 0)
    .map((e) => ({ at: e.date, value: e.watchHours ?? 0 }));

  const activeProjects = projects.filter((p) => p.status !== "archived");
  const formatDist = [...groupBy(activeProjects, (p) => p.contentType).entries()].map(([label, list]) => ({
    label,
    value: `${list.length} project(s)`,
    numeric: list.length,
  }));
  const progressAvg = average(activeProjects.map((p) => progressOf(p)));

  const contentRows = activeProjects.map((p) => {
    const logs = scoped.filter((e) => e.projectId === p.id);
    return {
      projectId: p.id,
      projectName: p.name,
      platform: [...new Set(logs.map((e) => e.platform))].join(", ") || p.platform,
      topic: p.topic,
      format: p.contentType,
      views: sum(logs, (e) => e.views),
      entries: logs.length,
      latest: logs.length > 0 ? [...logs].sort((a, b) => b.date.localeCompare(a.date))[0].date : undefined,
    };
  });

  const video = videoId ? projects.find((p) => p.id === videoId) : undefined;
  const videoEntries = videoId ? scoped.filter((e) => e.projectId === videoId) : [];

  const formatInsights = analyzeFormats(scoped, formatOf);
  const topicInsights = analyzeTopics(scoped, topicOf);
  const packagingRows = activeProjects.map((p) => {
    const logs = scoped.filter((e) => e.projectId === p.id);
    const withCtr = logs.filter((e) => e.ctr != null && (e.impressions ?? 0) > 0);
    const avgCtr = average(withCtr.map((e) => e.ctr ?? 0).filter((v) => v > 0));
    return {
      projectId: p.id,
      projectName: p.name,
      title: undefined as string | undefined,
      views: sum(logs, (e) => e.views),
      impressions: sum(logs, (e) => e.impressions),
      ctr: avgCtr,
      entries: logs.length,
    };
  });
  const packagingInsights = analyzePackaging(packagingRows);
  const alerts = computeAlerts(scoped);

  function saveInsightAsSignal(insight: { observation: string; evidence: string; implication: string }, kind: Parameters<typeof saveSignal>[0]["kind"]) {
    saveSignal({ kind, title: insight.observation.slice(0, 90), evidence: insight.evidence, implication: insight.implication });
    setSavedInsights((s) => [...s, insight.observation]);
    push({ title: "Saved to Channel Intelligence", body: "The signal now feeds Idea Lab context." });
  }

  function insightToOpportunity(insight: { observation: string; evidence: string; implication: string }) {
    saveOpportunity({
      title: `Follow-up: ${insight.observation.slice(0, 70)}`,
      topic: insight.observation.slice(0, 140),
      angle: "Analytics follow-up",
      audience: "",
      reasoning: `${insight.observation} Evidence: ${insight.evidence} Implication: ${insight.implication}`,
      format: "Long-form video",
      hook: "",
      sourceTask: "analytics",
    });
    push({ title: "Opportunity drafted", body: "Find it in Content Intelligence → Opportunities." });
  }

  function downloadCsv() {
    const csv = entriesToCsv(scoped, projectName);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tuberack-analytics.csv";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    push({ title: "CSV downloaded", body: `${scoped.length} entr${scoped.length === 1 ? "y" : "ies"} exported.` });
  }

  const videoSections = video ? (scriptFor(video.id)?.sections.map((s) => ({ id: s.id, heading: s.heading })) ?? []) : [];

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      content: (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Views" value={formatCompact(views)} delta={formatDelta(growthRate(views, prevViews))} deltaLabel={`vs ${split.previousLabel}`} provenance="manual" note={`${split.current.length} log(s) in range`} />
            <MetricCard label="Watch time" value={formatCompact(watch)} unit="h" delta={formatDelta(growthRate(watch, prevWatch))} deltaLabel={`vs ${split.previousLabel}`} provenance="manual" />
            <MetricCard label="Subscribers gained" value={formatCompact(subs)} provenance="manual" note="Net where platforms report it" />
            <MetricCard label="Engagement rate" value={eng === null ? "—" : `${eng.toFixed(1)}%`} provenance="calculated" note="Likes + comments + shares ÷ views" />
            <MetricCard label="Avg view duration" value={avgDur === null ? "—" : `${Math.round(avgDur)}s`} provenance="manual" />
            <MetricCard label="Impressions" value={formatCompact(impressions)} provenance="manual" />
            <MetricCard label="Active projects" value={String(activeProjects.length)} provenance="local" note={progressAvg === null ? undefined : `${Math.round(progressAvg)}% avg pipeline progress`} />
            <MetricCard label="Channel signals" value={String(signals.filter((s) => s.status === "active").length)} provenance="local" note="Saved interpretations" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <TrendChart title={`Views — ${split.currentLabel}`} points={viewsByDay} provenance="manual" area />
            <TrendChart title="Watch hours" points={watchByDay} unit="h" provenance="manual" />
          </div>
          <BarList title="Projects by format (local)" items={formatDist} provenance="local" empty="Create projects to see the mix." />
        </div>
      ),
    },
    {
      id: "content",
      label: "Content",
      content: video ? (
        <div className="space-y-4">
          <Button size="sm" variant="ghost" onClick={() => setVideoId(null)}>
            ← All content
          </Button>
          <VideoDetail projectId={video.id} projectName={video.name} entries={videoEntries} onEditEntry={setEditing} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Log performance for {video.name}</h3>
            <EntryForm projectId={video.id} projectName={video.name} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <ContentTable rows={contentRows} query={query} onQuery={setQuery} platform={platform} onPlatform={setPlatform} sort={sort} onSort={setSort} />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Log performance</h3>
            <div className="flex flex-wrap gap-2">
              <Select
                label="Project to log"
                value=""
                onChange={(e) => e.target.value && setVideoId(e.target.value)}
              >
                <option value="">Choose a project…</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <p className="mt-1 text-xs text-muted-text">Selecting opens its detail with the log form.</p>
          </div>
        </div>
      ),
    },
    {
      id: "retention",
      label: "Retention",
      content: (
        <div className="space-y-4">
          <RetentionPanel
            projectId={video?.id ?? activeProjects[0]?.id ?? ""}
            sections={video ? videoSections : []}
          />
          <TrendChart
            title="Logged retention % over time"
            points={scoped.filter((e) => (e.retentionPct ?? 0) > 0).map((e) => ({ at: e.date, value: e.retentionPct ?? 0 }))}
            unit="%"
            provenance="manual"
          />
          <p className="text-xs text-muted-text">
            Curves are never synthesized. Timestamped observations attach to script sections above; averages chart
            only from logged retentionPct values. Section-level association (hook/intro/scene) rides the linked
            section on each note — causal language is disallowed by the insight contracts.
          </p>
        </div>
      ),
    },
    {
      id: "packaging",
      label: "Packaging",
      content: (
        <div className="space-y-4">
          <BarList
            title="Views by content (logged)"
            items={contentRows.filter((r) => r.views > 0).slice(0, 8).map((r) => ({ label: r.projectName, value: r.views.toLocaleString(), numeric: r.views }))}
            provenance="manual"
            empty="Log views per project to compare packaging outcomes."
          />
          <div className="grid gap-3 lg:grid-cols-2">
            {packagingInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                saved={savedInsights.includes(insight.observation)}
                onSave={() => saveInsightAsSignal(insight, "packaging")}
                onOpportunity={() => insightToOpportunity(insight)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-text">
            Observed data → correlation → possible interpretation. Open any project in{" "}
            <Link href="/studio/package" className="underline">Packaging</Link> to act on these reads.
          </p>
        </div>
      ),
    },
    {
      id: "intelligence",
      label: "Intelligence",
      content: (
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Format patterns</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {formatInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  saved={savedInsights.includes(insight.observation)}
                  onSave={() => saveInsightAsSignal(insight, "format")}
                  onOpportunity={() => insightToOpportunity(insight)}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Topic patterns</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {topicInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  saved={savedInsights.includes(insight.observation)}
                  onSave={() => saveInsightAsSignal(insight, "topic-strength")}
                  onOpportunity={() => insightToOpportunity(insight)}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Format table (logged)</h3>
            <FormatTableView />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Channel Intelligence signals</h3>
            <SignalsPanel compact />
          </div>
        </div>
      ),
    },
    {
      id: "alerts",
      label: "Alerts & Reports",
      content: (
        <div className="space-y-4">
          <AlertsPanel alerts={alerts} />
          <ReportsPanel
            onCsv={downloadCsv}
            snapshots={snapshots}
            onSnapshot={(name) =>
              saveSnapshot(name, range, { views, watchHours: watch, subsGained: subs }, split.current.length)
            }
            onRemoveSnapshot={removeSnapshot}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-text">Learn from every publish</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Analytics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Channel" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
            <option value="all">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <RangePicker range={range} onChange={setRange} />
        </div>
      </div>
      <ConnectionBanner />
      <Tabs defaultId={tab} tabs={tabs} />
      <div className="flex flex-col gap-2">
        <LocalStorageNote />
        <AnalyticsStorageNote />
      </div>
      {editing && <EntryEditModal entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );

  function FormatTableView() {
    const rows = formatTable(scoped, formatOf);
    if (rows.length === 0) {
      return <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-text">No logged entries yet — format comparison needs manual logs.</p>;
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <caption className="sr-only">Performance by format</caption>
          <thead>
            <tr className="border-b border-border bg-muted/60">
              {["Format", "Entries", "Views", "Avg views"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-xs font-medium text-muted-text">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.format} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{r.format}</td>
                <td className="px-3 py-2 tabular-nums">{r.entries}</td>
                <td className="px-3 py-2 tabular-nums">{r.views.toLocaleString()}</td>
                <td className="px-3 py-2 tabular-nums">{Math.round(r.avgViews).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}
