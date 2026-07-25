// datetime.ts — the ONLY sanctioned date/time display path (CLAUDE.md
// DATE/TIME DISPLAY RULE). Never call toLocaleDateString / toLocaleString or
// do inline timezone math at a display site — route through these helpers.
//
// Display-side default timezone is America/Los_Angeles as a FALLBACK, not a
// hardcoded global: hearth-pos is multi-timezone in reality, so every helper
// takes an optional tz for per-vendor overrides. Never resolve timezone from
// Intl.DateTimeFormat().resolvedOptions().timeZone at a display site.
//
// First consumer: the Engagement tab (Day 21 STOP 5) — schedule lines and the
// calendar grid key on engagements.scheduled_for.

const DEFAULT_TZ = 'America/Los_Angeles';

export type DisplayStyle = 'date' | 'time' | 'datetime';

/**
 * Parse a UTC/ISO timestamp string (Supabase timestamptz) into a Date.
 * Tolerates the Postgres space separator ("2026-07-24 19:21:27+00").
 */
export function parseUTCTimestamp(value: string): Date {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  return new Date(normalized);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : parseUTCTimestamp(value);
}

/** Format a timestamp for display in the given (or fallback) timezone. */
export function formatForDisplay(
  value: Date | string,
  style: DisplayStyle,
  tz: string = DEFAULT_TZ,
): string {
  const date = asDate(value);
  const opts: Intl.DateTimeFormatOptions =
    style === 'date'
      ? { month: 'long', day: 'numeric', year: 'numeric' }
      : style === 'time'
        ? { hour: 'numeric', minute: '2-digit' }
        : { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }).format(date);
}

/** The calendar-date key ("YYYY-MM-DD") a timestamp falls on in the timezone. */
export function toDateKey(value: Date | string, tz: string = DEFAULT_TZ): string {
  // en-CA renders YYYY-MM-DD directly.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  }).format(asDate(value));
}

/** Canonical weekday name ("Monday") of a timestamp in the timezone. */
export function getCanonicalWeekday(value: Date | string, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(asDate(value));
}

/** Day count from one YYYY-MM-DD key to another (keys are tz-local dates). */
function dayDiff(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Relative day for a YYYY-MM-DD key: "Today" / "Tomorrow" / a bare weekday
 * inside the next six days / "Weekday, Month D" beyond that.
 */
export function formatRelativeDay(dateKey: string, tz: string = DEFAULT_TZ): string {
  const todayKey = toDateKey(new Date(), tz);
  const diff = dayDiff(todayKey, dateKey);
  const [y, m, d] = dateKey.split('-').map(Number);
  // Noon UTC on the key's date — immune to timezone day-shift when formatting.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(anchor);
  }
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(anchor);
}

/** Month title for calendar headers ("July 2026") from a year + month index. */
export function formatMonthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, monthIndex, 1, 12)));
}
