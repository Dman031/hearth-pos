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
import AddTimesSheet from '../components/AddTimesSheet';
import { FOLLOWUPS_DUE_HEADER } from '../services/visit-copy';
import {
  fetchEhrPushes,
  fetchFollowupsDue,
  type DayVisit,
  type EhrPush,
  type FollowupDue,
} from '../services/visits';
import EngagementCalendar from '../components/EngagementCalendar';
import Toast from '../components/Toast';
import { notifyEngagementsChanged } from '../utils/engagement-refresh';
import { ENGAGEMENT_KIND_LABEL, STATUS_LABEL, formatCents } from '../utils/format';
import { formatForDisplay, formatRelativeDay, toDateKey } from '../datetime';
import type { Engagement } from '../types/engagement';
import type { CancellationTerms } from '../types/cancellation-terms';

// EngagementScreen — the Engagement tab (Day 21 STOP 5): the entity's
// commitments as Upcoming/Past sections plus an in-tab calendar keyed on
// scheduled_for. "Engagement" is the product noun per the 2026-07-24 STOP-0
// amendment; MCP/protocol terms still never appear in user-facing strings.
//
// ACTIONS (Day 22 item 5, 2026-08-04 — supersedes the STOP 5 amendment's
// cancel exclusion): Done AND Cancel both ship, both roles, this row only.
// Cancel's exclusion was blocked on the charge.refunded finalizer; that
// handler is live and verified (2026-08-02), so the refund-due path finalizes
// and nothing strands. A refund-due cancel makes NO server state change on the
// order path (refund is issued by hand; charge.refunded finalizes later): the
// row keeps reading Paid until then — announced in the alert, remembered only
// in transient refundPendingIds (residual is a DEFERRED entry).
//
// ── N-23: THIS SCREEN HOLDS NO CANCELLATION POLICY ──────────────────────────
// The confirm asks get_engagement_cancellation_terms and renders its answer.
// Nothing here knows a window, a boundary or which rule a card is under: the
// server answers, in hours, and the copy speaks the number it is given. That
// read is ADVISORY (N-23 item 5) — the boundary can cross between the read and
// the tap, so post-call state renders from the cancel RPC's own RETURN
// (refund_due, slot_id, window_hours), never from the shape the confirm chose.
// This replaces the card-kind derivation BUG-014 introduced: the embed it read
// resolved null for patients, who are the people the policy is about.
//
// Upcoming/Past is STATUS-based (ruling 4): Upcoming = accepted|paid,
// Past = fulfilled|cancelled. A date-based split renders nothing today —
// scheduled_for has no writer yet — so scheduled_for only REFINES sort where
// present (dated rows first, soonest first; then undated, newest first).
// The date line never substitutes created_at: an accept date is not a due
// date, so undated rows read "No date set".

type ViewMode = 'list' | 'calendar';

/** How a server-supplied window is spoken. A PURE FORMATTER OF window_hours —
 *  it holds no policy and no list of known windows: whatever integer the terms
 *  read or a cancel return carries is rendered, including one this app has
 *  never seen. A lookup keyed on the two windows this app used to hold would be
 *  those deleted literals wearing a switch statement. */
function formatWindowHours(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (hours >= 48 && hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

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
  checkingTerms,
  refundPending,
  onOpen,
  onDone,
  onCancel,
}: {
  engagement: MyEngagement;
  isSeller: boolean;
  completing: boolean;
  cancelling: boolean;
  /** The cancellation-terms read is in flight for THIS row (N-23). Disables
   *  both controls without relabelling either: nothing has been cancelled yet,
   *  so "Cancelling…" would be a false sentence, and the vendor's first tap
   *  must not be able to start a second read. */
  checkingTerms: boolean;
  refundPending: boolean;
  onOpen: (e: MyEngagement) => void;
  onDone: (e: MyEngagement) => void;
  onCancel: (e: MyEngagement) => void;
}) {
  const cancelled = engagement.status === 'cancelled';
  const active = engagement.status === 'accepted' || engagement.status === 'paid';
  const busy = completing || cancelling || checkingTerms;
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
  // ── THE MAP'S THIRD STATE, WHICH IT DID NOT HAVE ──────────────────────────
  //
  // An EMPTY map and a map that has never successfully loaded are the same
  // object, so `pushes.get(id) ?? null` answered "no row — nobody tapped" in
  // both cases. TodayTile's prop doc asserted exactly that and was wrong on a
  // cold failed read: refreshPushes deliberately leaves the map alone on
  // failure ("a failed read and an empty outbox must not look alike"), but on
  // the FIRST load "alone" is empty.
  //
  // NULL KEEPS ITS ONE MEANING — no row. The knownness rides beside it rather
  // than as a third value in the same variable, because a nullable that means
  // three things is how the first two got confused.
  const [pushesKnown, setPushesKnown] = useState(false);
  // C5's handoff target. Holds the practice CARD id, not the visit — the times
  // board posts against a card. Null means no board is open, which is the state
  // after every wrap where the clinician did not ask for one.
  const [offeringOnCardId, setOfferingOnCardId] = useState<string | null>(null);
  const [offerToast, setOfferToast] = useState<string | null>(null);

  const refreshPushes = useCallback(async () => {
    const result = await fetchEhrPushes();
    if (!result.ok) {
      // A failed read and an empty outbox must not look alike: the map is left
      // as it was rather than cleared, so a transient failure cannot silently
      // erase a status a clinician is reading. `pushesKnown` is likewise NOT
      // set — if a previous read succeeded the tiles keep both the rows and the
      // knownness; if none ever did, the tiles are told so.
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
    setPushesKnown(true);
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
  // N-23: the confirm now ASKS the server before it can word itself, so the
  // tap has an in-flight state of its own. Separate from cancellingId on
  // purpose — one means "deciding what to say", the other "already doing it".
  const [checkingTermsId, setCheckingTermsId] = useState<string | null>(null);
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
      // refund_due, never by the case the confirm predicted — near whichever
      // line applies, the server's call-time evaluation wins.
      // THE RETURN IS A SUPERSET ON THE SLOT PATH, AND THE EXTRA KEYS ARE HOW
      // WE KNOW WHICH PATH RAN. cancel_engagement returns engagement_id/status/
      // refund_due/idempotent; cancel_slot_booking returns those PLUS path,
      // slot_id, slot_disposition and the payment intent, and BOTH now carry
      // window_hours (N-23 item 4). So `slot_id` present == the dispatch fired,
      // read off the answer itself rather than re-derived from anything this
      // screen holds — which, after N-23, is nothing.
      const result = (data ?? {}) as {
        refund_due?: boolean;
        transaction_id?: string | null;
        slot_id?: string | null;
        path?: string | null;
        // N-23 item 4: the window this cancellation was actually judged
        // against, carried by BOTH writers' refund arms. Absent on the
        // idempotent-cancelled and free-cancel returns — neither of which can
        // be a near-boundary flip, but absence is handled, never assumed.
        window_hours?: number | null;
      };
      const refundDue = result.refund_due === true;
      const wasSlotPath = typeof result.slot_id === 'string';
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
        // ── WHAT THE ROW DOES NEXT IS NOT THE SAME ON BOTH PATHS ────────────
        // This alert said, on every path, that the row "will still show as Paid
        // until the refund goes through". That is TRUE of cancel_engagement's
        // refund-due arm, which deliberately makes no status change (:131-132:
        // "NO status change — plpgsql cannot call Stripe"), and FALSE of
        // cancel_slot_booking, which sets status='cancelled' unconditionally
        // (:112-114) and returns 'status','cancelled' even when refund_due is
        // true. On a practice slot the row is in Past before this alert paints,
        // so telling the clinician to expect Paid sends them looking in the
        // wrong list for a row that is already where it belongs.
        //
        // "PROCESSED MANUALLY" IS TRUE ON BOTH AND STAYS. Checked rather than
        // assumed: cancel_slot_booking's comment says the refund "is issued by
        // the Worker", but nothing in hearth-network/src issues one off that
        // imprint — stripe-webhook.ts's `handleChargeRefunded` only READS it as
        // a provenance flag on refund_finalized. A person issues it in the Stripe dashboard on
        // both paths. (The imprint's missing `event` key is BUG-012, network.)
        const settlingLine = wasSlotPath
          ? `Refunds are processed manually, not instantly, so it may take a few days to appear. This ${noun} has already moved to the Past list.`
          : `Refunds are processed manually, not instantly — this ${noun} will still show as Paid until the refund goes through, then it will move to your Past list.`;
        Alert.alert(
          'Cancellation received',
          isSeller
            ? `${e.peerName ?? 'The buyer'} will get ${
                amount !== null ? `their ${amount} back` : 'their money back'
              }. ${settlingLine}`
            : `${
                amount !== null ? `Your ${amount} refund` : 'Your refund'
              } is on its way. ${settlingLine}`,
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
        // NEAR-BOUNDARY FLIP — the window named here comes from the RETURN's
        // own window_hours (N-23 item 4), never from a literal and never from
        // the prediction that just proved wrong. Reading it off `path` is what
        // this used to do, and it could only ever name windows this app had
        // been told about; the number is now in the answer. If it is absent the
        // sentence omits the number rather than inventing one — a stale promise
        // must not be replaced by a fresh guess.
        const missedWindow =
          typeof result.window_hours === 'number'
            ? formatWindowHours(result.window_hours)
            : null;
        Alert.alert(
          'Cancelled — without a refund',
          `${
            missedWindow !== null
              ? `By the time this went through, the date was less than ${missedWindow} away, so `
              : 'By the time this went through there was too little notice left, so '
          }${
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

  // ── THREE RENDERED SHAPES, ONE SERVER ANSWER (N-23 items 1 and 5) ─────────
  //
  // Day 22 item 5's SIX cases are gone. They were six because the app was
  // deciding: paid-ness from the ledger helper, which window from the card's
  // kind, which side of it from a clock comparison — and a seventh arm for when
  // it could not find out. get_engagement_cancellation_terms decides all of it
  // and returns refund_if_cancelled_now, whose three values ARE these three
  // shapes: nothing to refund, full refund, no refund. Role decides WORDING
  // ONLY; it no longer decides outcome.
  //
  // 'nothing_paid' IS NOT 'none', and that is the server's distinction, not a
  // nicety of ours: a cancellation that refunds nothing because nothing was
  // ever paid must not be spoken as one that keeps the money.
  //
  // A FAILED READ REFUSES. It is not a fourth shape — it is the old settled-null
  // arm's posture, unchanged: say nothing was changed rather than guess at what
  // a cancellation would cost. The function RAISES for a non-participant, an
  // unbound caller or a missing engagement, so an error here is a real answer
  // about authorization, never an empty row to interpret.
  const confirmCancel = useCallback(
    async (e: MyEngagement) => {
      const noun = ENGAGEMENT_KIND_LABEL[e.kind].toLowerCase();
      // The tap is disabled while this is in flight — never relabelled
      // "Cancelling…", because nothing has been cancelled yet.
      setCheckingTermsId(e.id);
      const { data, error: termsErr } = await supabase.rpc(
        'get_engagement_cancellation_terms',
        { p_engagement_id: e.id },
      );
      setCheckingTermsId(null);
      // RETURNS TABLE — a set, so a row array. No .single(): a raise arrives as
      // termsErr, and an empty set (which this function cannot produce) is
      // handled as the same refusal rather than as a shape.
      const terms = ((data ?? []) as CancellationTerms[])[0] ?? null;
      if (termsErr || terms === null) {
        console.warn('[EngagementScreen] get_engagement_cancellation_terms failed', {
          engagementId: e.id,
          // Never a fallback that reads like the opposite of what happened:
          // this branch is reached with EITHER an error or no row, and says which.
          error: termsErr ? termsErr.message : 'no row returned',
        });
        Alert.alert(
          'Can’t cancel right now',
          `Couldn’t check what cancelling this ${noun} would refund, so nothing was changed. Try again in a moment.`,
        );
        return;
      }

      // THE ROLE COMES FROM THE ANSWER TOO. caller_is_seller is resolved from
      // the same actor the cancel itself will use, so the confirm and the RPC
      // cannot disagree about which side the tapper is on.
      const isSeller = terms.caller_is_seller;
      const peer = e.peerName ?? (isSeller ? 'the buyer' : 'the seller');
      const peerStart = e.peerName ?? 'The buyer';
      const amount =
        e.agreed_price_cents !== null
          ? formatCents(e.agreed_price_cents, e.currency)
          : null;
      // predictedRefund feeds ONLY the near-boundary mismatch alert — the
      // outcome itself always comes from the return (ruling 5 / N-23 item 5).
      const run = (predictedRefund: boolean) => () =>
        void cancelEngagement(e, isSeller, predictedRefund);
      // The window, spoken. Null only if the server ever answers a window this
      // formatter cannot render; the sentence then omits the number.
      const windowSaid = formatWindowHours(terms.window_hours);
      // WHAT THE ROW DOES NEXT IS PATH-SPECIFIC, AND is_slot_booking IS THE
      // SERVER'S OWN ANSWER TO WHICH PATH RUNS (BUG-014's finding, re-sourced):
      // cancel_slot_booking sets status='cancelled' unconditionally, even when a
      // refund is due, so a slot booking is in Past the moment it returns;
      // cancel_engagement's refund-due arm makes no status change at all.
      const settlingClause = terms.is_slot_booking
        ? 'moves to your Past list right away; the refund follows.'
        : 'will show Paid until the refund goes through, then move to your Past list.';

      // ── SHAPE 1 — NOTHING TO REFUND ────────────────────────────────────────
      if (terms.refund_if_cancelled_now === 'nothing_paid') {
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

      // ── SHAPE 2 — FULL REFUND ──────────────────────────────────────────────
      // The window is named only where it is load-bearing: it explains a
      // BUYER's refund. A seller cancel refunds whatever the notice, so naming
      // a rule there could only ever be a sentence saying it does not apply.
      if (terms.refund_if_cancelled_now === 'full') {
        Alert.alert(
          isSeller ? `Cancel and refund ${peer}?` : 'Cancel and get refunded?',
          isSeller
            ? `${peerStart} paid ${amount ?? 'for this'}. Cancelling means their full payment is refunded. The ${noun} ${settlingClause}`
            : `You’ll get your ${amount ?? 'payment'} back${
                windowSaid !== null ? ` — the date is more than ${windowSaid} away` : ''
              }. The refund is processed for you; this ${noun} ${settlingClause}`,
          [
            { text: 'Keep it', style: 'cancel' },
            { text: isSeller ? 'Cancel and refund' : 'Yes, cancel', onPress: run(true) },
          ],
        );
        return;
      }

      // ── SHAPE 3 — NO REFUND ────────────────────────────────────────────────
      // Never generic: the forfeit AND the unconditional alternative, before the
      // tap. The date phrase is null-safe — an undated engagement reads as
      // inside the window server-side (there is no instant to measure from), so
      // this shape can be reached with no date to name.
      const dateLabel = terms.scheduled_for
        ? formatRelativeDay(toDateKey(terms.scheduled_for))
        : null;
      Alert.alert(
        'Cancel without a refund?',
        `${
          dateLabel !== null && windowSaid !== null
            ? `${dateLabel} is less than ${windowSaid} away, so cancelling`
            : 'Cancelling'
        } now means your ${amount ?? 'payment'} is NOT refunded.${
          isSeller
            ? ''
            : ` If you need your money back, ask ${peer} to cancel instead — when the seller cancels, you’re always refunded in full.`
        }`,
        [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Cancel — no refund', style: 'destructive', onPress: run(false) },
        ],
      );
    },
    [cancelEngagement],
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
        checkingTerms={checkingTermsId === e.id}
        refundPending={refundPendingIds.has(e.id)}
        onOpen={openThread}
        onDone={confirmDone}
        onCancel={(row) => void confirmCancel(row)}
      />
    ),
    [
      entityId,
      completingId,
      cancellingId,
      checkingTermsId,
      refundPendingIds,
      openThread,
      confirmDone,
      confirmCancel,
    ],
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
                    pushKnown={pushesKnown}
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
          void refreshPushes();
        }}
        // C5. Opened HERE, on the screen, after WrapSheet has dismissed —
        // never from inside it (N-8: no stacked modals).
        onOfferTime={(visit) => {
          // THE NULL GUARD IS THE WHOLE CHECK. DayVisit.card_id is nullable, and
          // AddTimesSheet posts against a card: with no id there is nothing to
          // post to. Say so rather than opening a board that cannot save.
          if (!visit.card_id) {
            console.warn('[EngagementScreen] offer-time skipped: visit has no card', {
              engagementId: visit.engagement_id,
            });
            setOfferToast('This visit has no card, so there is no board to post a time on.');
            return;
          }
          setOfferingOnCardId(visit.card_id);
        }}
      />

      {/* C5's board. Mounted on the SCREEN so it opens after the wrap sheet is
          gone. `visible` is derived from the card id, so closing it clears the
          id and a second wrap opens a fresh sheet rather than a stale one. */}
      <AddTimesSheet
        visible={offeringOnCardId !== null}
        cardId={offeringOnCardId ?? ''}
        tz={dayTz}
        defaultModality="video"
        defaultMinutes={45}
        onClose={() => setOfferingOnCardId(null)}
        onPosted={(outcome) => {
          setOfferingOnCardId(null);
          // The board's own wording, so posting from here and posting from
          // Settings report the same thing in the same words.
          setOfferToast(
            outcome.skipped > 0
              ? `Posted ${outcome.posted} times. ${outcome.skipped} were already on your board.`
              : `Posted ${outcome.posted} times.`,
          );
        }}
      />
      <Toast message={offerToast} onDismiss={() => setOfferToast(null)} />
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
