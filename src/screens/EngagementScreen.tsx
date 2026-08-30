import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import useMyDay from '../hooks/useMyDay';
import TodayTile from '../components/TodayTile';
import WrapSheet from '../components/WrapSheet';
import { FOLLOWUPS_DUE_HEADER } from '../services/visit-copy';
import {
  fetchEhrPushes,
  fetchFollowupsDue,
  type DayVisit,
  type EhrPush,
  type FollowupDue,
} from '../services/visits';
import EngagementCalendar from '../components/EngagementCalendar';
import { notifyEngagementsChanged } from '../utils/engagement-refresh';
import { ENGAGEMENT_KIND_LABEL, STATUS_LABEL, formatCents } from '../utils/format';
import { formatForDisplay, formatRelativeDay, parseUTCTimestamp, toDateKey } from '../datetime';
import type { Engagement } from '../types/engagement';

// EngagementScreen — the Engagement tab (Day 21 STOP 5): the entity's
// commitments as Upcoming/Past sections plus an in-tab calendar keyed on
// scheduled_for. "Engagement" is the product noun per the 2026-07-24 STOP-0
// amendment; MCP/protocol terms still never appear in user-facing strings.
//
// ACTIONS (Day 22 item 5, 2026-08-04 — supersedes the STOP 5 amendment's
// cancel exclusion): Done AND Cancel both ship, both roles, this row only.
// Cancel's exclusion was blocked on the charge.refunded finalizer; that
// handler is live and verified (2026-08-02), so the refund-due path finalizes
// and nothing strands. Confirm copy is chosen from LEDGER truth (settled, via
// the 0023 helper — never engagement.status, which lags the ledger in the
// webhook window; settled null means UNKNOWN and the confirm refuses to
// guess). The 14-day boundary here is ADVISORY — the server decides at call
// time (0022:140-142); post-call state renders from the RETURN's refund_due,
// never from the predicted case. A refund-due cancel makes NO server state
// change (refund is issued by hand; charge.refunded finalizes later): the row
// keeps reading Paid until then — announced in the alert, remembered only in
// transient refundPendingIds (residual is a DEFERRED entry).
//
// Upcoming/Past is STATUS-based (ruling 4): Upcoming = accepted|paid,
// Past = fulfilled|cancelled. A date-based split renders nothing today —
// scheduled_for has no writer yet — so scheduled_for only REFINES sort where
// present (dated rows first, soonest first; then undated, newest first).
// The date line never substitutes created_at: an accept date is not a due
// date, so undated rows read "No date set".

type ViewMode = 'list' | 'calendar';

// ADVISORY ONLY — picks confirm copy; the server re-evaluates at call time
// (0022:140-142, timestamptz vs timestamptz, UTC interim).
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

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
  cancelling,
  refundPending,
  onOpen,
  onDone,
  onCancel,
}: {
  engagement: MyEngagement;
  isSeller: boolean;
  completing: boolean;
  cancelling: boolean;
  refundPending: boolean;
  onOpen: (e: MyEngagement) => void;
  onDone: (e: MyEngagement) => void;
  onCancel: (e: MyEngagement) => void;
}) {
  const cancelled = engagement.status === 'cancelled';
  const active = engagement.status === 'accepted' || engagement.status === 'paid';
  const busy = completing || cancelling;
  const noun = ENGAGEMENT_KIND_LABEL[engagement.kind].toLowerCase();
  // CASE 4 (buyer + paid + undated): NO tap — guidance only, mirroring the
  // server's refusal (0022:184). settled is ledger truth; null (unknown)
  // does NOT land here — it gets the tap, and the confirm refuses honestly.
  const buyerUndatedPaid =
    !isSeller && active && engagement.settled === true && !engagement.scheduled_for;
  // A refund-pending row hides both controls: the cancel already happened
  // (re-tapping would re-request), and Done must not regress a cancelling row.
  const canComplete = isSeller && active && !refundPending;
  const canCancel = active && !refundPending && !buyerUndatedPaid;
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
      {refundPending ? (
        // RULING 6: transient marker only — the server made no state change,
        // so this is session memory, not data. Dies on restart (DEFERRED).
        <Text style={styles.refundPendingText}>
          Cancellation received — refund on the way. This will move to your Past list once it
          goes through.
        </Text>
      ) : null}
      {buyerUndatedPaid ? (
        <Text style={styles.noCancelText}>
          {`This ${noun} has no date, so it can’t be cancelled from your side. Ask ${
            engagement.peerName ?? 'the seller'
          } to cancel — a seller cancellation always refunds.`}
        </Text>
      ) : null}
      {canComplete || canCancel ? (
        <View style={styles.actionRow}>
          {canCancel ? (
            <Pressable
              style={[styles.cancelBtn, busy && styles.btnDisabled]}
              onPress={() => onCancel(engagement)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.cancelText}>{cancelling ? 'Cancelling…' : 'Cancel'}</Text>
            </Pressable>
          ) : null}
          {canComplete ? (
            <Pressable
              style={[styles.doneBtn, busy && styles.btnDisabled]}
              onPress={() => onDone(engagement)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.doneText}>{completing ? 'Marking done…' : 'Done'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function EngagementScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const { entity } = useEntity();
  const entityId = entity?.id ?? null;
  const { engagements, isLoading, error, refresh } = useMyEngagements();
  // TODAY LIVES HERE (ruling N-2). get_my_day is vertical-agnostic — it returns
  // booking|order for ANY card kind — so a plumber with three scheduled
  // bookings has a day too. Locking it behind a clinician stamp would withhold
  // a surface whose data the server already returns to them. The room row and
  // the wrap affordance are conditional on card_kind WITHIN this one surface;
  // a second clinician-only Today would be a second fold of the same read.
  //
  // The Upcoming/Past split below is UNTOUCHED (S7 A2) — this section sits
  // above it and shares nothing with it.
  const { visits: todayVisits, tz: dayTz, zoneUnset, refresh: refreshDay } = useMyDay();
  const [wrapping, setWrapping] = useState<DayVisit | null>(null);
  const [followups, setFollowups] = useState<FollowupDue[]>([]);
  // PLEXMED S10: ONE read for the whole strip. 0045:283 names this shape —
  // "p_engagement_id is OPTIONAL — null returns every push the caller owns,
  // which is what a Today strip needs" — so the screen fetches once and indexes
  // it, rather than one RPC per wrapped tile.
  const [pushes, setPushes] = useState<Map<string, EhrPush>>(new Map());

  const refreshPushes = useCallback(async () => {
    const result = await fetchEhrPushes();
    if (!result.ok) {
      // A failed read and an empty outbox must not look alike: the map is left
      // as it was rather than cleared, so a transient failure cannot silently
      // erase a status a clinician is reading.
      console.warn('[EngagementScreen] get_my_ehr_pushes failed', { reason: result.reason });
      return;
    }
    // Newest first (0045:323), so the FIRST row per engagement wins. There is
    // one row per (target, engagement) by dedupe_key today; this stays correct
    // if a second target is ever added.
    const next = new Map<string, EhrPush>();
    for (const row of result.value) {
      if (!next.has(row.engagement_id)) next.set(row.engagement_id, row);
    }
    setPushes(next);
  }, []);

  useEffect(() => {
    void refreshPushes();
  }, [refreshPushes]);

  const peerNameForThread = useCallback(
    (threadId: string) => engagements.find((e) => e.thread_id === threadId)?.peerName ?? null,
    [engagements],
  );

  useEffect(() => {
    let active = true;
    void fetchFollowupsDue().then((result) => {
      if (active && result.ok) setFollowups(result.value);
    });
    return () => {
      active = false;
    };
  }, []);
  const [mode, setMode] = useState<ViewMode>('list');
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  // RULING 6: the app's ONLY record of "cancel requested, refund pending" —
  // the server changes nothing on that path. Transient by ruling; the
  // restart residual is a DEFERRED entry, not a bug.
  const [refundPendingIds, setRefundPendingIds] = useState<Set<string>>(new Set());

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

  const cancelEngagement = useCallback(
    async (e: MyEngagement, isSeller: boolean, predictedRefund: boolean) => {
      setCancellingId(e.id);
      const { data, error: rpcErr } = await supabase.rpc('cancel_engagement', {
        p_engagement_id: e.id,
      });
      setCancellingId(null);
      if (rpcErr) {
        // Surface the RPC error — never swallow (Done pattern).
        console.warn('[EngagementScreen] cancel_engagement failed', {
          engagementId: e.id,
          error: rpcErr.message,
        });
        Alert.alert('Couldn’t cancel it', rpcErr.message);
        return;
      }
      // RULING 5 ENFORCED HERE: what happens next is decided by the RETURN's
      // refund_due, never by the case the confirm predicted — near the 14-day
      // line the server's call-time evaluation wins.
      const result = (data ?? {}) as { refund_due?: boolean; transaction_id?: string | null };
      const refundDue = result.refund_due === true;
      if (refundDue) {
        setRefundPendingIds((prev) => {
          const next = new Set(prev);
          next.add(e.id);
          return next;
        });
        const noun = ENGAGEMENT_KIND_LABEL[e.kind].toLowerCase();
        const amount =
          e.agreed_price_cents !== null ? formatCents(e.agreed_price_cents, e.currency) : null;
        // RULING 6: announce the discrepancy — the row will KEEP reading Paid
        // until the by-hand refund lands; say so before the user finds it.
        Alert.alert(
          'Cancellation received',
          isSeller
            ? `${e.peerName ?? 'The buyer'} will get ${
                amount !== null ? `their ${amount} back` : 'their money back'
              }. Refunds are processed manually, not instantly — this ${noun} will still show as Paid until the refund goes through, then it will move to your Past list.`
            : `${
                amount !== null ? `Your ${amount} refund` : 'Your refund'
              } is on its way. Refunds are processed manually, not instantly — this ${noun} will still show as Paid until the refund goes through, then it will move to your Past list.`,
        );
      } else if (predictedRefund && !isSeller && result.transaction_id) {
        // NEAR-BOUNDARY FLIP: the confirm promised case 2 (refund) but the
        // server's call-time boundary landed case 3 — the return carries a
        // standing transaction and refund_due false. The stale promise must
        // not be the last thing the buyer heard; render the return, plainly.
        // (No ask-the-seller advice here: the row is already cancelled, so a
        // seller cancel can no longer refund it.)
        const noun = ENGAGEMENT_KIND_LABEL[e.kind].toLowerCase();
        const amount =
          e.agreed_price_cents !== null ? formatCents(e.agreed_price_cents, e.currency) : null;
        Alert.alert(
          'Cancelled — without a refund',
          `By the time this went through, the date was less than 14 days away, so ${
            amount !== null ? `your ${amount}` : 'your payment'
          } wasn’t refunded. The ${noun} has moved to your Past list. If this seems wrong, message ${
            e.peerName ?? 'the seller'
          } about it.`,
        );
      }
      notifyEngagementsChanged();
      await refresh();
    },
    [refresh],
  );

  // The six confirm cases (Day 22 item 5, accepted draft, unchanged). Copy is
  // chosen from LEDGER truth (settled) — never engagement.status (RULING 3);
  // null settled refuses instead of guessing; unpriced rows are knowably
  // unpaid (nothing chargeable exists), helper or no helper.
  const confirmCancel = useCallback(
    (e: MyEngagement) => {
      const isSeller = entityId !== null && e.seller_entity_id === entityId;
      const noun = ENGAGEMENT_KIND_LABEL[e.kind].toLowerCase();
      const peer = e.peerName ?? (isSeller ? 'the buyer' : 'the seller');
      const peerStart = e.peerName ?? 'The buyer';
      const amount =
        e.agreed_price_cents !== null
          ? formatCents(e.agreed_price_cents, e.currency)
          : null;
      const paid = e.agreed_price_cents === null ? false : e.settled;
      // predictedRefund feeds ONLY the near-boundary mismatch alert — the
      // outcome itself always comes from the return (ruling 5).
      const run = (predictedRefund: boolean) => () =>
        void cancelEngagement(e, isSeller, predictedRefund);

      if (paid === null) {
        // UNKNOWN is not unpaid: refuse to guess rather than promise a free
        // cancel on a possibly-paid row.
        Alert.alert(
          'Can’t cancel right now',
          `Couldn’t check whether this ${noun} has been paid, so nothing was changed. Try again in a moment.`,
        );
        return;
      }
      if (!paid) {
        // Cases 1 (buyer) and 5 (seller) — free cancel.
        Alert.alert(
          `Cancel this ${noun}?`,
          isSeller
            ? `${peerStart} hasn’t paid, so nothing is refunded. It will move to your Past list.`
            : 'You haven’t paid for it, so there’s nothing to refund. It will move to your Past list.',
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Yes, cancel', onPress: run(false) },
          ],
        );
        return;
      }
      if (isSeller) {
        // Case 6 — seller cancel always refunds, any time, dated or not.
        Alert.alert(
          `Cancel and refund ${peer}?`,
          `${peerStart} paid ${amount ?? 'for this'}. Cancelling means their full payment is refunded — the 14-day rule doesn’t apply when you cancel. The ${noun} will show Paid until the refund goes through.`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Cancel and refund', onPress: run(true) },
          ],
        );
        return;
      }
      if (!e.scheduled_for) {
        // Case 4 — the row offers no tap for this state; defensive mirror of
        // the server's refusal in case it is ever reached.
        Alert.alert(
          `This ${noun} can’t be cancelled from your side`,
          `It has no date. Ask ${peer} to cancel — a seller cancellation always refunds.`,
        );
        return;
      }
      const outside14 =
        parseUTCTimestamp(e.scheduled_for).getTime() - Date.now() > FOURTEEN_DAYS_MS;
      if (outside14) {
        // Case 2 — buyer, paid, more than 14 days out: refund due.
        Alert.alert(
          'Cancel and get refunded?',
          `You’ll get your ${amount ?? 'payment'} back — the date is more than 14 days away. The refund is processed for you; this ${noun} will show Paid until it goes through, then move to your Past list.`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Yes, cancel', onPress: run(true) },
          ],
        );
      } else {
        // Case 3 — buyer, paid, inside 14 days: NO refund. Never generic —
        // the forfeit AND the ask-the-seller alternative, before the tap.
        const dateLabel = formatRelativeDay(toDateKey(e.scheduled_for));
        Alert.alert(
          'Cancel without a refund?',
          `${dateLabel} is less than 14 days away, so cancelling now means your ${
            amount ?? 'payment'
          } is NOT refunded. If you need your money back, ask ${peer} to cancel instead — when the seller cancels, you’re always refunded in full.`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: 'Cancel — no refund', style: 'destructive', onPress: run(false) },
          ],
        );
      }
    },
    [entityId, cancelEngagement],
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
        cancelling={cancellingId === e.id}
        refundPending={refundPendingIds.has(e.id)}
        onOpen={openThread}
        onDone={confirmDone}
        onCancel={confirmCancel}
      />
    ),
    [entityId, completingId, cancellingId, refundPendingIds, openThread, confirmDone, confirmCancel],
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
            {todayVisits.length > 0 ? (
              <View style={styles.todaySection}>
                <Text style={styles.sectionHeader}>Today</Text>
                {/* The one place a guessed zone would be wrong: S7 says fall
                    back to UTC WITH AN EXPLICIT UTC LABEL, never to a local
                    guess. This says so rather than showing times that look
                    local and are not. */}
                {zoneUnset ? (
                  <Text style={styles.todayZoneNote}>
                    Times shown in UTC — confirm your zone on your open times board.
                  </Text>
                ) : null}
                {todayVisits.map((v) => (
                  <TodayTile
                    key={v.engagement_id}
                    visit={v}
                    peerName={
                      engagements.find((e) => e.id === v.engagement_id)?.peerName ?? null
                    }
                    tz={dayTz}
                    push={pushes.get(v.engagement_id) ?? null}
                    onWrap={setWrapping}
                    onChanged={() => {
                      void refreshDay();
                      void refresh();
                      void refreshPushes();
                    }}
                  />
                ))}
              </View>
            ) : null}

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

      {/* C4's other half: the conversations whose cadence has elapsed. A
          PREDICATE evaluated when someone looks — nothing runs on a timer and
          nothing is drafted. Tapping one opens the conversation; sending is the
          ordinary post_message, and no copy here may imply otherwise. */}
      {followups.length > 0 ? (
        <View style={styles.followupBar}>
          <Text style={styles.sectionHeader}>{FOLLOWUPS_DUE_HEADER}</Text>
          {followups.map((f) => (
            <Pressable
              key={f.thread_id}
              style={styles.followupRow}
              onPress={() =>
                navigation.navigate('PlexChat', {
                  screen: 'Conversation',
                  params: { threadId: f.thread_id },
                })
              }
              accessibilityRole="button"
            >
              <Text style={styles.followupLabel}>
                {peerNameForThread(f.thread_id) ?? 'Conversation'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* THE WRAP IS A SHEET PUSHED FROM HERE (N-16, amending N-3). A
          ninety-second wrap immediately after a visit must not send anyone two
          taps away into the account sheet. */}
      <WrapSheet
        visit={wrapping}
        peerName={
          wrapping
            ? (engagements.find((e) => e.id === wrapping.engagement_id)?.peerName ?? null)
            : null
        }
        onClose={() => setWrapping(null)}
        onWrapped={() => {
          void refreshDay();
          void refresh();
        }}
      />
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
  todaySection: { marginBottom: theme.spacing.lg },
  followupBar: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.hairline,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  followupRow: { paddingVertical: theme.spacing.sm },
  followupLabel: { ...theme.typography.body, color: theme.colors.accent },
  todayZoneNote: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
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
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  doneBtn: {
    // Block shape (12px card radius) — the decision-control grammar from
    // ThreadDecisionBanner, never the message-bubble pill.
    flex: 1,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.onAccent,
  },
  cancelBtn: {
    // Outline block — ThreadDecisionBanner's decline grammar: bordered
    // surface, block shape, never the accent fill and never a pill.
    flex: 1,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.textMuted,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    ...theme.typography.body,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textSecondary,
  },
  refundPendingText: {
    ...theme.typography.caption,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.accent2Deep,
  },
  noCancelText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
