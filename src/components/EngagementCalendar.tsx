import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import { formatMonthTitle, toDateKey } from '../datetime';
import type { Engagement } from '../types/engagement';

// EngagementCalendar — the Engagement tab's in-house month grid (Day 21 STOP 5
// ruling 6: minimal, no new dependency; the data is scheduled_for-sparse and
// the Field styling is bespoke anyway). Keys on engagements.scheduled_for,
// bucketed into display-timezone calendar days via datetime.toDateKey — never
// inline timezone math (CLAUDE.md DATE/TIME rule).
//
// EMPTY STATE (ruling 6, honest — no placeholder data): scheduled_for has no
// writer anywhere yet, so every live row is unscheduled and the grid renders
// unmarked with the empty-state line below. The grid exists so the first
// scheduled engagement lands in a working surface, not so today looks busy.

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Generic over the row type so the screen can pass enriched rows (MyEngagement)
// and get them back typed in renderRow — the grid itself only reads Engagement
// fields (scheduled_for).
interface EngagementCalendarProps<T extends Engagement> {
  engagements: T[];
  /** Renders one engagement row in the selected-day list (shared with the list view). */
  renderRow: (engagement: T) => React.ReactElement;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export default function EngagementCalendar<T extends Engagement>({
  engagements,
  renderRow,
}: EngagementCalendarProps<T>) {
  const todayKey = toDateKey(new Date());
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);

  const [year, setYear] = useState<number>(todayYear);
  const [monthIndex, setMonthIndex] = useState<number>(todayMonth - 1); // 0-based
  const [selectedKey, setSelectedKey] = useState<string>(todayKey);

  // scheduled_for → display-day buckets. Unscheduled rows never appear here —
  // the LIST view carries them; the calendar only ever shows dated commitments.
  const byDay = useMemo(() => {
    const map = new Map<string, T[]>();
    for (const e of engagements) {
      if (!e.scheduled_for) continue;
      const key = toDateKey(e.scheduled_for);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [engagements]);

  const hasAnySchedule = byDay.size > 0;

  const goMonth = (delta: number) => {
    const next = monthIndex + delta;
    if (next < 0) {
      setMonthIndex(11);
      setYear((y) => y - 1);
    } else if (next > 11) {
      setMonthIndex(0);
      setYear((y) => y + 1);
    } else {
      setMonthIndex(next);
    }
  };

  // Grid structure (not display formatting): leading offset + day count.
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<{ key: string; day: number } | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      key: `${year}-${pad2(monthIndex + 1)}-${pad2(i + 1)}`,
      day: i + 1,
    })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedRows = byDay.get(selectedKey) ?? [];

  return (
    <View>
      <View style={styles.monthHeader}>
        <Pressable onPress={() => goMonth(-1)} hitSlop={12} accessibilityRole="button">
          <Text style={styles.chevron}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{formatMonthTitle(year, monthIndex)}</Text>
        <Pressable onPress={() => goMonth(1)} hitSlop={12} accessibilityRole="button">
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_HEADERS.map((w, i) => (
          <Text key={`${w}-${i}`} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) =>
          cell === null ? (
            <View key={`blank-${i}`} style={styles.cell} />
          ) : (
            <Pressable
              key={cell.key}
              style={[
                styles.cell,
                cell.key === todayKey && styles.cellToday,
                cell.key === selectedKey && styles.cellSelected,
              ]}
              onPress={() => setSelectedKey(cell.key)}
              accessibilityRole="button"
            >
              <Text
                style={[styles.cellDay, cell.key === selectedKey && styles.cellDaySelected]}
              >
                {cell.day}
              </Text>
              {byDay.has(cell.key) ? <View style={styles.dot} /> : null}
            </Pressable>
          ),
        )}
      </View>

      {!hasAnySchedule ? (
        <Text style={styles.emptyLine}>
          Nothing scheduled yet. Orders and bookings with a date will show up here.
        </Text>
      ) : selectedRows.length === 0 ? (
        <Text style={styles.emptyLine}>Nothing on this day.</Text>
      ) : (
        <View style={styles.dayList}>{selectedRows.map((e) => renderRow(e))}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  monthTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  chevron: {
    ...theme.typography.h2,
    color: theme.colors.accent,
    paddingHorizontal: theme.spacing.md,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.semiBold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    // 7 columns; fixed height keeps rows even with/without dots.
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.card,
  },
  cellToday: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
  },
  cellSelected: {
    backgroundColor: theme.colors.accentWash,
  },
  cellDay: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  cellDaySelected: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  dot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent,
  },
  emptyLine: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  dayList: {
    marginTop: theme.spacing.lg,
  },
});
