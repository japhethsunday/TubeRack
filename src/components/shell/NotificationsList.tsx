"use client";

import { useCallback, useEffect, useState } from "react";
import { Flame, TrendingUp, CalendarDays, FlaskConical, Bell } from "lucide-react";
import { api } from "@/src/lib/api";
import { EmptyState } from "@/src/components/ui/states";
import { Button } from "@/src/components/ui/Button";
import { cx } from "@/src/components/ui/cx";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const ICONS: Record<string, typeof Bell> = { "competitor.outlier": Flame, "trend.rising": TrendingUp, "calendar.reminder": CalendarDays, "abtest.completed": FlaskConical };
const LINKS: Record<string, string> = { "competitor.outlier": "/intelligence/competitors", "trend.rising": "/intelligence/trends", "calendar.reminder": "/calendar", "abtest.completed": "/studio/abtest" };

export async function fetchNotifications(): Promise<AppNotification[]> {
  return api.get<AppNotification[]>("/api/v1/notifications?limit=30&sort=created_at&order=desc");
}

/** Unread count for the header bell; refreshes every 2 minutes while the tab is open. */
export function useUnreadCount(enabled: boolean): [number, () => void] {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    if (!enabled) return;
    fetchNotifications()
      .then((list) => setCount(list.filter((n) => !n.read_at).length))
      .catch(() => undefined);
  }, [enabled]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 120_000);
    return () => clearInterval(t);
  }, [refresh]);
  return [count, refresh];
}

/** Notification drawer body: real alerts from competitors, trends, calendar, and A/B tests. */
export function NotificationsList({ onNavigate, onRead }: { onNavigate: () => void; onRead: () => void }) {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchNotifications()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load notifications."));
  }, []);

  async function markAll() {
    await api.post("/api/v1/notifications/read-all").catch(() => undefined);
    setItems((xs) => (xs ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    onRead();
  }

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!items) return <p className="text-sm text-muted-text">Loading…</p>;
  if (items.length === 0) {
    return <EmptyState title="No notifications yet" body="Competitor breakouts, rising trends, calendar reminders, and finished thumbnail tests will appear here." />;
  }
  const unread = items.some((n) => !n.read_at);
  return (
    <div className="space-y-3">
      {unread && <Button size="sm" variant="outline" onClick={() => void markAll()}>Mark all read</Button>}
      <ul className="space-y-2">
        {items.map((n) => {
          const Icon = ICONS[n.type] ?? Bell;
          const href = LINKS[n.type];
          const inner = (
            <>
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{n.title}</span>
                <span className="block whitespace-pre-line text-xs text-muted-text">{n.body}</span>
                <span className="mt-0.5 block text-[11px] text-muted-text">{new Date(n.created_at).toLocaleString()}</span>
              </span>
              {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
            </>
          );
          const cls = cx("flex gap-2.5 rounded-lg border border-border p-3 transition-colors", href && "hover:bg-muted", !n.read_at && "bg-primary/5");
          return <li key={n.id}>{href ? <a href={href} onClick={onNavigate} className={cls}>{inner}</a> : <div className={cls}>{inner}</div>}</li>;
        })}
      </ul>
    </div>
  );
}
