import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme, tileSurface } from '../styles/theme';
import useMyEngagements from '../hooks/useMyEngagements';
import useCards from '../hooks/useCards';
import EngagementCalendar from '../components/EngagementCalendar';
import { ENGAGEMENT_KIND_LABEL, STATUS_LABEL, formatCents } from '../utils/format';
import { formatForDisplay, formatRelativeDay, toDateKey } from '../datetime';
import type { Engagement } from '../types/engagement';

// EngagementScreen — the Engagement tab (Day 21 STOP 5): the entity's
// commitments as Upcoming/Past sections plus an in-tab calendar keyed on
// scheduled_for. "Engagement" is the product noun per the 2026-07-24 STOP-0
// amendment; MCP/protocol terms still never appear in user-facing strings.
//
// READS ONLY (STOP 5 ruling 7): complete_engagement and cancel_engagement
// exist (0018, applied) but no Done/Cancel buttons ship in this stop — cancel
// can return refund_due, and the webhook's charge.refunded finalizer does not
// exist yet, so a cancel could strand a paid engagement with no finalizer.
// Actions ship when the webhook side is whole.
//
// Upcoming/Past is STATUS-based (ruling 4): Upcoming = accepted|paid,
// Past = fulfilled|cancelled. A date-based split renders nothing today —
// scheduled_for has no writer yet — so scheduled_for only REFINES sort where
// present (dated rows first, soonest first; then undated, newest first).

type ViewMode = 'list' | 'calendar';

function sortUpcoming(a: Engagement, b: Engagement): number {
  if (a.scheduled_for && b.scheduled_for) return a.scheduled_for.localeCompare(b.scheduled_for);
  if (a.scheduled_for) return -1;
  if (b.scheduled_for) return 1;
  return b.created_at.localeCompare(a.created_at);
}

function sortPast(a: Engagement, b: Engagement): number {
  const aEnd = a.fulfilled_at ?? a.cancelled_at ?? a.created_at;
  const bEnd = b.fulfilled_at ?? b.cancelled_at ?? b.created_at;
  return bEnd.localeCompare(aEnd);
}

function EngagementRow({ engagement, cardTitle }: { engagement: Engagement; cardTitle: string | null }) {
  const cancelled = engagement.status === 'cancelled';
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.kindText}>{ENGAGEMENT_KIND_LABEL[engagement.kind]}</Text>
        <View style={[styles.chip, cancelled && styles.chipCancelled]}>
          <Text style={[styles.chipText, cancelled && styles.chipTextCancelled]}>
            {STATUS_LABEL[engagement.status]}
          </Text>
        </View>
      </View>
      {cardTitle ? <Text style={styles.titleText}>{cardTitle}</Text> : null}
      <Text style={styles.amountText}>
        {engagement.agreed_price_cents !== null
          ? formatCents(engagement.agreed_price_cents, engagement.currency)
          : 'No charge'}
      </Text>
      {engagement.scheduled_for ? (
        <Text style={styles.scheduleText}>
          {formatRelativeDay(toDateKey(engagement.scheduled_for))} ·{' '}
          {formatForDisplay(engagement.scheduled_for, 'time')}
        </Text>
      ) : null}
    </View>
  );
}

export default function EngagementScreen() {
  const { engagements, isLoading, error } = useMyEngagements();
  const { cards } = useCards();
  const [mode, setMode] = useState<ViewMode>('list');

  // Own-card titles resolve for seller-side rows (the common case in a vendor
  // app); buyer-side rows just omit the title line. Never a placeholder.
  const titleFor = (e: Engagement): string | null =>
    e.card_id ? (cards.find((c) => c.id === e.card_id)?.title ?? null) : null;

  const { upcoming, past } = useMemo(() => {
    const up = engagements
      .filter((e) => e.status === 'accepted' || e.status === 'paid')
      .sort(sortUpcoming);
    const done = engagements
      .filter((e) => e.status === 'fulfilled' || e.status === 'cancelled')
      .sort(sortPast);
    return { upcoming: up, past: done };
  }, [engagements]);

  if (isLoading && engagements.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && engagements.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Engagement</Text>
        <Text style={styles.subtitle}>Couldn’t load right now.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        {(['list', 'calendar'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.toggle, mode === m && styles.toggleActive]}
            onPress={() => setMode(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[styles.toggleText, mode === m && styles.toggleTextActive]}>
              {m === 'list' ? 'List' : 'Calendar'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {mode === 'calendar' ? (
          <EngagementCalendar
            engagements={engagements}
            renderRow={(e) => <EngagementRow key={e.id} engagement={e} cardTitle={titleFor(e)} />}
          />
        ) : engagements.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.title}>No engagements yet</Text>
            <Text style={styles.subtitle}>
              When you accept an order or booking, it shows up here.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionHeader}>Upcoming</Text>
            {upcoming.length === 0 ? (
              <Text style={styles.sectionEmpty}>Nothing upcoming.</Text>
            ) : (
              upcoming.map((e) => (
                <EngagementRow key={e.id} engagement={e} cardTitle={titleFor(e)} />
              ))
            )}
            <Text style={styles.sectionHeader}>Past</Text>
            {past.length === 0 ? (
              <Text style={styles.sectionEmpty}>Nothing here yet.</Text>
            ) : (
              past.map((e) => <EngagementRow key={e.id} engagement={e} cardTitle={titleFor(e)} />)
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingVertical: theme.spacing.xxl,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
  },
  toggle: {
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
  },
  toggleActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  toggleText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.semiBold,
  },
  toggleTextActive: {
    color: theme.colors.onAccent,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    flexGrow: 1,
  },
  sectionHeader: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  sectionEmpty: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.md,
  },
  row: {
    ...tileSurface,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kindText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  chip: {
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accentWash,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  chipCancelled: {
    backgroundColor: theme.colors.surfaceInset,
  },
  chipText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.accent,
  },
  chipTextCancelled: {
    color: theme.colors.textMuted,
  },
  titleText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
  amountText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  scheduleText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
});
