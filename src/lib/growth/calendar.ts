/** Calendar helpers shared by the page, the ICS export, and tests. */

export interface CalendarItem {
  id: string;
  project_id: string | null;
  title: string;
  kind: "idea" | "script" | "record" | "edit" | "thumbnail" | "publish" | "promote" | "other";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM or ""
  status: "planned" | "done" | "skipped";
  notes: string;
  remind: boolean;
}

export const KIND_LABELS: Record<CalendarItem["kind"], string> = {
  idea: "Idea",
  script: "Script",
  record: "Record",
  edit: "Edit",
  thumbnail: "Thumbnail",
  publish: "Publish",
  promote: "Promote",
  other: "Other",
};

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday-first 6×7 grid of YYYY-MM-DD covering the month. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = first.toISOString().slice(0, 10);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i - offset));
}

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

export function toIcs(items: CalendarItem[], stamp = new Date()): string {
  const dt = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TubeRack//Content Calendar//EN", "CALSCALE:GREGORIAN"];
  for (const it of items) {
    const day = it.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${it.id}@tuberack`, `DTSTAMP:${dt}`);
    if (/^\d{2}:\d{2}$/.test(it.time)) {
      const t = it.time.replace(":", "");
      lines.push(`DTSTART:${day}T${t}00`, `DURATION:PT1H`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${addDays(it.date, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${icsEscape(`[${KIND_LABELS[it.kind]}] ${it.title}`)}`);
    if (it.notes) lines.push(`DESCRIPTION:${icsEscape(it.notes)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
