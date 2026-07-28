import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme, tileSurface } from '../styles/theme';
import { supabase } from '../services/supabase';
import useEntity from '../hooks/useEntity';
import useMyEngagements, { type MyEngagement } from '../hooks/useMyEngagements';
import EngagementCalendar from '../components/EngagementCalendar';
import { notifyEngagementsChanged } from '../utils/engagement-refresh';
import { ENGAGEMENT_KIND_LABEL, STATUS_LABEL, formatCents } from '../utils/format';
import { formatForDisplay, formatRelativeDay, toDateKey } from '../datetime';
import type { Engagement } from '../types/engagement';

// EngagementScreen — the Engagement tab (Day 21 STOP 5): the entity's
// commitments as Upcoming/Past sections plus an in-tab calendar keyed on
// scheduled_for. "Engagement" is the product noun per the 2026-07-24 STOP-0
// amendment; MCP/protocol terms still never appear in user-facing strings.
//
// ACTIONS (STOP 5 amendment, 2026-07-27 — supersedes the reads-only ruling):
// Done SHIPS. complete_engagement (0018, applied) is seller-only, moves
// accepted|paid → fulfilled, and touches no Stripe path — nothing can strand.
// cancel_engagement STAYS OUT: its refund-due path makes NO state change and
// returns refund_due, and the webhook's charge.refunded finalizer does not
// exist yet, so a client cancel could strand a paid engagement with no
// finalizer. The earlier reads-only ruling over-applied cancel's refund risk
// to both RPCs — recorded here so it is not re-litigated. No Cancel button
// ships anywhere until charge.refunded lands.
//
// Upcoming/Past is STATUS-based (ruling 4): Upcoming = accepted|paid,
// Past = fulfilled|cancelled. A date-based split renders nothing today —
// scheduled_for has no writer yet — so scheduled_for only REFINES sort where
// present (dated rows first, soonest first; then undated, newest first).
// The date line never substitutes created_at: an accept date is not a due
// date, so undated rows read "No date set".

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

function EngagementRow({
  engagement,
  isSeller,
  completing,
  onOpen,
  onDone,
}: {
  engagement: MyEngagement;
  isSeller: boolean;
  completing: boolean;
  onOpen: (e: MyEngagement) => void;
  onDone: (e: MyEngagement) => void;
}) {
  const cancelled = engagement.status === 'cancelled';
  // Done: seller-side rows still in the needs-action set (badge ruling 5).
  const canComplete =
    isSeller && (engagement.status === 'accepted' || engagement.status === 'paid');
  return (
    <Pressable
      style={styles.row}
      onPress={() => onOpen(engagement)}
      disabled={!engagement.thread_id}
      accessibilityRole="button"
    >
      <View style={styles.rowHeader}>
        <Text style={styles.peerText} numberOfLines={1}>
          {engagement.peerName ?? ENGAGEMENT_KIND_LABEL[engagement.kind]}
        </Text>
        <View style={[styles.chip, cancelled && styles.chipCancelled]}>
          <Text style={[styles.chipText, cancelled && styles.chipTextCancelled]}>
            {STATUS_LABEL[engagement.status]}
          </Text>
        </View>
      </View>
      {engagement.peerName ? (
        <Text style={styles.kindText}>{ENGAGEMENT_KIND_LABEL[engagement.kind]}</Text>
      ) : null}
      {engagement.excerpt ? (
        <Text style={styles.excerptText} numberOfLines={1}>
          {engagement.excerpt}
        </Text>
      ) : null}
      <Text style={styles.amountText}>
        {engagement.agreed_price_cents !== null
          ? formatCents(engagement.agreed_price_cents, engagement.currency)
          : 'No charge'}
      </Text>
      <Text style={styles.scheduleText}>
        {engagement.scheduled_for
          ? `${formatRelativeDay(toDateKey(engagement.scheduled_for))} · ${formatForDisplay(
              engagement.scheduled_for,
              'time',
            )}`
          : 'No date set'}
      </Text>
      {canComplete ? (
        <Pressable
          style={[styles.doneBtn, completing && styles.btnDisabled]}
          onPress={() => onDone(engagement)}
          disabled={completing}
          accessibilityRole="button"
          accessibilityState={{ disabled: completing }}
        >
          <Text style={styles.doneText}>{completing ? 'Marking done…' : 'Done'}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function EngagementScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const { engagements, isLoading, error, refresh } = useMyEngagements();
  const [mode, setMode] = useState<ViewMode>('list');
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Tap-through: the row opens its conversation — the same nested-Stack target
  // IncomingScreen's accept lands on (PlexChat tab → Conversation screen).
  const openThread = useCallback(
    (e: MyEngagement) => {
      if (!e.thread_id) return;
      navigation.navigate('PlexChat', { screen: 'Conversation', params: { threadId: e.thread_id } });
    },
    [navigation],
  );

  const completeEngagement = useCallback(
    async (e: MyEngagement) => {
      setCompletingId(e.id);
      const { error: rpcErr } = await supabase.rpc('complete_engagement', {
        p_engagement_id: e.id,
      });
      setCompletingId(null);
      if (rpcErr) {
        // Surface the RPC error — never swallow.
        console.warn('[EngagementScreen] complete_engagement failed', {
          engagementId: e.id,
          error: rpcErr.message,
        });
        Alert.alert('Couldn’t mark it done', rpcErr.message);
        return;
      }
      // The realtime channel is dormant (BUG-009), so drive both surfaces
      // explicitly: the badge via the in-app signal, the list via refresh.
      notifyEngagementsChanged();
      await refresh();
    },
    [refresh],
  );

  const confirmDone = useCallback(
    (e: MyEngagement) => {
      const noun = ENGAGEMENT_KIND_LABEL[e.kind].toLowerCase();
      // Marking an unpaid priced row done is the vendor's call, but an
      // informed one: say plainly that no payment has been recorded.
      const unpaid = e.status === 'accepted' && e.agreed_price_cents !== null;
      Alert.alert(
        `Mark this ${noun} done?`,
        unpaid
          ? `No payment has been recorded for this ${noun}. Marking it done closes it without a payment.`
          : 'It will move to your Past list.',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark done', onPress: () => void completeEngagement(e) },
        ],
      );
    },
    [completeEngagement],
  );

  const renderRow = useCallback(
    (e: MyEngagement) => (
      <EngagementRow
        key={e.id}
        engagement={e}
        isSeller={entityId !== null && e.seller_entity_id === entityId}
        completing={completingId === e.id}
        onOpen={openThread}
        onDone={confirmDone}
      />
    ),
    [entityId, completingId, openThread, confirmDone],
  );

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
          <EngagementCalendar engagements={engagements} renderRow={renderRow} />
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
              upcoming.map(renderRow)
            )}
            <Text style={styles.sectionHeader}>Past</Text>
            {past.length === 0 ? (
              <Text style={styles.sectionEmpty}>Nothing here yet.</Text>
            ) : (
              past.map(renderRow)
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
    gap: theme.spacing.sm,
  },
  peerText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
    flexShrink: 1,
  },
  kindText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  excerptText: {
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
  doneBtn: {
    // Block shape (12px card radius) — the decision-control grammar from
    // ThreadDecisionBanner, never the message-bubble pill.
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  doneText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.onAccent,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
