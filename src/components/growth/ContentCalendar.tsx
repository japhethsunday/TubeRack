"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Sparkles, CalendarArrowDown, Check, Trash2, Bell, BellOff } from "lucide-react";
import { growth } from "@/src/lib/growth-client";
import { KIND_LABELS, monthGrid, toIcs, type CalendarItem } from "@/src/lib/growth/calendar";
import { downloadText } from "@/src/lib/download";
import { Modal } from "@/src/components/ui/overlays";
import { Input, Select, Textarea } from "@/src/components/ui/fields";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

const KIND_COLOR: Record<CalendarItem["kind"], string> = {
  idea: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  script: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  record: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  edit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  thumbnail: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  publish: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  promote: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
  other: "bg-muted text-foreground",
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Draft = Omit<CalendarItem, "id" | "project_id"> & { id?: string };

function ItemDialog({ draft, onClose, onSaved, onDeleted }: { draft: Draft; onClose: () => void; onSaved: (i: CalendarItem) => void; onDeleted: (id: string) => void }) {
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.title.trim()) return setError("Add a title.");
    setBusy(true);
    const body = { title: d.title.trim(), kind: d.kind, date: d.date, time: d.time, status: d.status, notes: d.notes, remind: d.remind };
    const o = d.id ? await growth.updateItem(d.id, body) : await growth.addItem(body);
    setBusy(false);
    if (o.ok) onSaved(o.data);
    else setError(o.message);
  }
  return (
    <Modal title={d.id ? "Edit item" : "New calendar item"} onClose={onClose} wide>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <Input label="Title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Record: 5 budget meals under $10" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Type" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as CalendarItem["kind"] })}>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Input label="Date" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          <Input label="Time (optional)" type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
        </div>
        <Textarea label="Notes" rows={3} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.remind} onChange={(e) => setD({ ...d, remind: e.target.checked })} /> Email me a reminder the day before</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={d.status === "done"} onChange={(e) => setD({ ...d, status: e.target.checked ? "done" : "planned" })} /> Done</label>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-between gap-2">
          {d.id ? (
            <Button type="button" variant="outline" onClick={() => void growth.removeItem(d.id!).then((o) => (o.ok ? onDeleted(d.id!) : setError(o.message)))}>
              <Trash2 className="size-4" aria-hidden="true" /> Delete
            </Button>
          ) : <span />}
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function PlanDialog({ onClose, onPlanned }: { onClose: () => void; onPlanned: (n: number, start: string) => void }) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [weeks, setWeeks] = useState("4");
  const [perWeek, setPerWeek] = useState("2");
  const [days, setDays] = useState<string[]>(["Tuesday", "Friday"]);
  const [start, setStart] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function plan(e: React.FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 2) return setError("Enter your niche or topic.");
    setBusy(true);
    setError("");
    const o = await growth.planCalendar({ topic: topic.trim(), audience: audience.trim(), weeks: Number(weeks), perWeek: Number(perWeek), publishDays: days, startDate: start });
    setBusy(false);
    if (o.ok) onPlanned(o.data.created, start);
    else setError(o.message);
  }
  return (
    <Modal title="Plan a content schedule with Gemini" description="Creates script, record, edit, thumbnail, and publish steps for every video." onClose={onClose} wide>
      <form onSubmit={(e) => void plan(e)} className="space-y-3">
        <Input label="Niche or topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. budget meal prep for students" />
        <Input label="Audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)}>{[1, 2, 3, 4, 6, 8].map((w) => <option key={w} value={w}>{w}</option>)}</Select>
          <Select label="Videos per week" value={perWeek} onChange={(e) => setPerWeek(e.target.value)}>{[1, 2, 3, 4, 5, 7].map((w) => <option key={w} value={w}>{w}</option>)}</Select>
          <Input label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Publish days</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])} className={cx("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors", days.includes(d) ? "border-primary bg-primary/10" : "border-border hover:bg-muted")}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end"><Button type="submit" loading={busy}><Sparkles className="size-4" aria-hidden="true" /> Build schedule</Button></div>
      </form>
    </Modal>
  );
}

/** Content calendar: month grid, Gemini planning, reminders, and .ics export. */
export function ContentCalendar() {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [planning, setPlanning] = useState(false);
  const [notice, setNotice] = useState("");
  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const today = todayYmd();

  const load = useCallback(async () => {
    const o = await growth.calendar(grid[0], grid[41]);
    if (o.ok) setItems(o.data);
    else setError(o.message);
  }, [grid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload when the visible month changes.
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items ?? []) map.set(it.date, [...(map.get(it.date) ?? []), it]);
    return map;
  }, [items]);

  function shift(n: number) {
    const d = new Date(cursor.y, cursor.m + n, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  }

  async function toggleDone(it: CalendarItem) {
    const o = await growth.updateItem(it.id, { status: it.status === "done" ? "planned" : "done" });
    if (o.ok) setItems((xs) => (xs ?? []).map((x) => (x.id === it.id ? o.data : x)));
  }

  const upcoming = (items ?? []).filter((i) => i.date >= today && i.status === "planned").slice(0, 8);
  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const blank = (date: string): Draft => ({ title: "", kind: "publish", date, time: "", status: "planned", notes: "", remind: true });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft className="size-4" aria-hidden="true" /></Button>
        <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel}</h2>
        <Button size="sm" variant="outline" onClick={() => shift(1)} aria-label="Next month"><ChevronRight className="size-4" aria-hidden="true" /></Button>
        <Button size="sm" variant="outline" onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}>Today</Button>
        <span className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(blank(today))}><Plus className="size-4" aria-hidden="true" /> Add item</Button>
          <Button size="sm" onClick={() => setPlanning(true)}><Sparkles className="size-4" aria-hidden="true" /> Plan with Gemini</Button>
          <Button size="sm" variant="outline" disabled={!items?.length} onClick={() => downloadText(toIcs(items ?? []), `tuberack-${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}.ics`, "text/calendar")}>
            <CalendarArrowDown className="size-4" aria-hidden="true" /> Export .ics
          </Button>
        </span>
      </div>
      {notice && <p role="status" className="rounded-lg bg-success/10 p-3 text-sm text-success">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <div className="overflow-x-auto">
        <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-xl border border-border bg-surface">
          {DAYS.map((d) => <div key={d} className="border-b border-border px-2 py-1.5 text-xs font-medium text-muted-text">{d.slice(0, 3)}</div>)}
          {grid.map((day) => {
            const inMonth = Number(day.slice(5, 7)) - 1 === cursor.m;
            const list = byDay.get(day) ?? [];
            return (
              <div key={day} className={cx("group min-h-28 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-muted/30")}>
                <div className="flex items-center justify-between">
                  <span className={cx("flex size-6 items-center justify-center rounded-full text-xs", day === today ? "bg-primary font-semibold text-primary-foreground" : inMonth ? "" : "text-muted-text")}>{Number(day.slice(8))}</span>
                  <button type="button" aria-label={`Add item on ${day}`} onClick={() => setEditing(blank(day))} className="rounded p-0.5 text-muted-text opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 focus:opacity-100">
                    <Plus className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <ul className="mt-1 space-y-1">
                  {list.map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => setEditing({ ...it })} className={cx("w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80", KIND_COLOR[it.kind], it.status === "done" && "line-through opacity-60")} title={`${KIND_LABELS[it.kind]}: ${it.title}`}>
                        {it.time && <span className="tabular-nums">{it.time} </span>}{it.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold">Up next</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-muted-text">Nothing planned from today in this view. Add items or let Gemini plan a schedule.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {upcoming.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <button type="button" onClick={() => void toggleDone(it)} aria-label={`Mark “${it.title}” done`} className="flex size-5 shrink-0 items-center justify-center rounded border border-border transition-colors hover:bg-muted">
                  {it.status === "done" && <Check className="size-3" aria-hidden="true" />}
                </button>
                <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-medium", KIND_COLOR[it.kind])}>{KIND_LABELS[it.kind]}</span>
                <button type="button" onClick={() => setEditing({ ...it })} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">{it.title}</button>
                <span className="shrink-0 text-xs tabular-nums text-muted-text">{new Date(`${it.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{it.time && ` · ${it.time}`}</span>
                {it.remind ? <Bell className="size-3.5 text-muted-text" aria-label="Reminder on" /> : <BellOff className="size-3.5 text-muted-text" aria-label="Reminder off" />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <ItemDialog
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={(it) => {
            setItems((xs) => {
              const rest = (xs ?? []).filter((x) => x.id !== it.id);
              return [...rest, it].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
            });
            setEditing(null);
          }}
          onDeleted={(id) => {
            setItems((xs) => (xs ?? []).filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
      {planning && (
        <PlanDialog
          onClose={() => setPlanning(false)}
          onPlanned={(n, start) => {
            setPlanning(false);
            setNotice(`Gemini added ${n} items starting ${start}.`);
            const d = new Date(`${start}T00:00:00`);
            setCursor({ y: d.getFullYear(), m: d.getMonth() });
            void load();
          }}
        />
      )}
    </div>
  );
}

