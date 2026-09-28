// Local-time date helpers. Avoid UTC drift by working with local components.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function isValidISODate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00"));
}

// "24 September 2026"
export function formatDateLong(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

// "Sunday, 27 September"
export function formatTodayHeader(d = new Date()): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Indian digit grouping so lakh/crore totals read naturally:
// 100000 -> "1,00,000", 42600 -> "42,600", 10000000 -> "1,00,00,000".
const countFormatter = new Intl.NumberFormat("en-IN");
export function formatCount(n: number): string {
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  return countFormatter.format(v < 0 ? 0 : v);
}
