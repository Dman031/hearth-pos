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

export type DisplayStyle =
  | 'date'
  | 'shortDate'
  | 'time'
  // Time WITH its zone abbreviation ("4:40 PM PDT"). Every clinical surface
  // renders times this way — PLEXMED S5/S6/S7 all rule that a time with no
  // zone label is a bug (VL-4), because the server emits UTC instants and the
  // reader is not necessarily in the practice's zone.
  | 'timeWithZone'
  // Month and year only ("Aug 2026") — the granularity a credential is stated
  // at. A licence is verified in a month and renews in a month; printing a day
  // would claim a precision the record does not carry.
  | 'monthYear'
  | 'datetime';

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
      : style === 'shortDate' // chip-scale surfaces ("Aug 3" — Day 22 decision-slot ruling 2)
        ? { month: 'short', day: 'numeric' }
        : style === 'time'
          ? { hour: 'numeric', minute: '2-digit' }
          : style === 'timeWithZone'
            ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
            : style === 'monthYear'
              ? { month: 'short', year: 'numeric' }
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

/**
 * The zone's own label at a given instant — "PDT" (short) or "Pacific Daylight
 * Time" (long). Takes an instant because the label is date-dependent: the same
 * zone is PDT in August and PST in January, so a hardcoded abbreviation would
 * be wrong for half the year.
 *
 * Feeds the standing-zone lines ("Times shown in {zone name}") that sit above a
 * board or a day, where the zone is stated once instead of on every row.
 * Returns the IANA name unchanged if the runtime declines to name the zone —
 * an honest fallback, never a guess at an abbreviation.
 */
export function formatZoneLabel(
  value: Date | string,
  tz: string = DEFAULT_TZ,
  width: 'short' | 'long' = 'long',
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: width,
  }).formatToParts(asDate(value));
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

// ─── Zone + week helpers (PLEXMED S5, the open-times board) ─────────────────

/**
 * The device's IANA zone. THE ONLY PLACE this app resolves it.
 *
 * The DATE/TIME rule bars resolving a zone at a display site, and this is not
 * one: it is the value the first-run confirm PROPOSES, which the clinician then
 * accepts or corrects into entities.timezone. Every render afterwards uses the
 * STORED zone, not this — a clinician on a trip still sees their board in their
 * practice's zone (S5 note 3).
 */
export function getDeviceTimeZone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved && resolved.length > 0 ? resolved : DEFAULT_TZ;
}

/** How far `tz` is from UTC at a given instant, in ms. DST-correct by construction. */
function zoneOffsetMs(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asIfUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asIfUTC - instant.getTime();
}

/**
 * A wall-clock time in a zone → the INSTANT it names.
 *
 * This is what makes "9:00 on the 30th" unambiguous before it is sent: the
 * board posts instants, never naive datetimes, and the server refuses a naive
 * one rather than silently reinterpreting it (0038b, post_card_slots).
 *
 * TWO PASSES, DELIBERATELY. The first guess uses the offset at the naive
 * instant, which is wrong across a DST boundary — 2:30 AM on a spring-forward
 * day sits on the far side of the shift. The second pass re-reads the offset at
 * the corrected instant and settles it. A single pass is right 363 days a year,
 * which is the kind of wrong that surfaces twice a year and is never reproduced.
 */
export function wallClockToInstant(
  dateKey: string,
  hour: number,
  minute: number,
  tz: string = DEFAULT_TZ,
): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  const firstPass = naive - zoneOffsetMs(new Date(naive), tz);
  return new Date(naive - zoneOffsetMs(new Date(firstPass), tz));
}

/** Shift a YYYY-MM-DD key by whole days. Key arithmetic, never instant math. */
export function addDaysToKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days, 12));
  return shifted.toISOString().slice(0, 10);
}

/** The seven keys of the Sunday-start calendar week containing `dateKey`. */
export function weekKeysFor(dateKey: string): string[] {
  const [y, m, d] = dateKey.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 = Sunday
  const sunday = addDaysToKey(dateKey, -weekday);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(sunday, i));
}

/** "Tue" — the column header. Noon-UTC anchored so no zone can shift the day. */
export function shortWeekday(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "25" — the day number under the column header. */
export function dayOfMonth(dateKey: string): string {
  return String(Number(dateKey.split('-')[2]));
}

/**
 * A bare wall clock ("9:45 AM") from an hour and minute — no date, no zone.
 *
 * Lives here because the DATE/TIME rule admits no inline Intl at a display
 * site, and a chip grid of a day's times is a display site even though the
 * value it renders is not an instant. The zone is stated ONCE above such a grid
 * (formatZoneLabel), not repeated on every chip.
 */
export function formatWallClock(hour: number, minute: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
}
