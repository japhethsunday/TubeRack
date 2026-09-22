/** Relative timestamps for real local datetimes. Pure and tested. */
export function timeAgo(iso: string, ref?: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown time";
  const diff = Math.max(0, (ref ?? Date.now()) - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return d.toLocaleString();
}
