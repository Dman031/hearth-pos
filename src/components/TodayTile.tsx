import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme, tileSurface } from '../styles/theme';
import { formatDayMonth, formatForDisplay, shortWeekday, toDateKey } from '../datetime';
import { formatCents } from '../utils/format';
import HonestyChips from './HonestyChips';
import Toast from './Toast';
import {
  deriveVisitState,
  queueEhrPush,
  startVisit,
  type DayVisit,
  type EhrPush,
} from '../services/visits';
import { issueSuperbill, signedSuperbillUrl } from '../services/superbill';
import {
  CHIP_FIRST_VISIT,
  PUSH_ACTION,
  PUSH_ACTION_RETRY,
  PUSH_ACTION_SENT,
  PUSH_QUEUED,
  SUPERBILL_ACTION,
  SUPERBILL_ALREADY,
  SUPERBILL_BODY,
  SUPERBILL_LINK_FAILED,
  SUPERBILL_OPEN,
  SUPERBILL_OPEN_FAILED,
  SUPERBILL_READY,
  VISIT_ROOM_PENDING,
  VISIT_ROOM_PENDING_BODY,
  VISIT_ROOM_READY,
  VISIT_ROOM_READY_BODY,
  VISIT_STATE_LABELS,
  planProgress,
  pushStatusCopy,
} from '../services/visit-copy';
import { MODALITY_LABEL } from '../services/practice';

// TodayTile — PLEXMED S7 PART A.
//
// NO IDENTITY CHIP (ruling N-17). get_my_day returns no verification flag and
// neither does get_my_thread_peers, so it has no source — and it should not:
// the chip earns its place on Incoming because the clinician is deciding
// whether to see a stranger. By Today they have accepted, been paid, and are
// about to join a room. A chip that cannot change a decision is decoration on a
// clinical surface. Do not add it back.
//
// "NEW PATIENT" APPEARS NOWHERE HERE. It is a billing distinction and it lives
// in exactly one place: the clinician's own pick at wrap.
//
// THE ROOM ROW RENDERS IN BOTH STATES. An absent row and an absent room must not
// look alike. "No room yet" is equally true before T-60 and when the vendor is
// unprovisioned — from this side those are the same fact, and the copy does not
// leak which.

interface TodayTileProps {
  visit: DayVisit;
  /** From get_my_thread_peers — the one name source, gated on an established
   *  thread. Null renders the kind noun rather than a placeholder. */
  peerName: string | null;
  tz: string;
  /** This visit's push row, from the screen's single get_my_ehr_pushes read.
   *  Null means NO ROW — nobody has tapped — never "we could not tell". */
  push: EhrPush | null;
  onWrap: (visit: DayVisit) => void;
  onChanged: () => void;
}

export default function TodayTile({
  visit,
  peerName,
  tz,
  push,
  onWrap,
  onChanged,
}: TodayTileProps) {
  const [busy, setBusy] = useState(false);
  const [superbillBusy, setSuperbillBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const state = deriveVisitState(visit);
  const roomReady = visit.room_url !== null;
  const isPractice = visit.card_kind === 'practice';

  const start = useCallback(async () => {
    setBusy(true);
    const result = await startVisit(visit.engagement_id);
    setBusy(false);
    if (!result.ok) {
      setToast(
        result.reason === 'already_wrapped'
          ? 'This visit is already wrapped.'
          : 'Couldn’t start that just now. Try again.',
      );
      return;
    }
    onChanged();
  }, [visit.engagement_id, onChanged]);

  const openRoom = useCallback(async () => {
    if (!visit.room_url) return;
    // Tap-out; nothing is embedded.
    const can = await Linking.canOpenURL(visit.room_url);
    if (!can) {
      setToast('Couldn’t open the room from here.');
      return;
    }
    await Linking.openURL(visit.room_url);
  }, [visit.room_url]);

  // TAP-OUT, the room row's own pattern (above). The OS renders the PDF, and
  // ITS share sheet and "Save to Files" are the platform's — this app ships no
  // viewer, no download and no share intent of its own, none of which the two
  // taps imply.
  const openDocument = async (url: string): Promise<void> => {
    const can = await Linking.canOpenURL(url);
    if (!can) {
      setToast(SUPERBILL_OPEN_FAILED);
      return;
    }
    await Linking.openURL(url);
  };

  /**
   * A plain function rather than a useCallback because the `file_missing`
   * branch calls it again with recover=true, and a memoized closure cannot
   * name itself in its own dependency list.
   *
   * RECOVER IS NEVER PASSED SPECULATIVELY. The function names the missing file
   * first and the clinician chooses the re-print; re-printing behind their back
   * would change bytes they may already have handed to a patient.
   */
  const runSuperbill = async (recover: boolean): Promise<void> => {
    if (superbillBusy) return;
    setSuperbillBusy(true);
    const result = await issueSuperbill(visit.engagement_id, { recover });
    setSuperbillBusy(false);

    if (!result.ok) {
      if (result.reason === 'file_missing') {
        Alert.alert('That file is no longer there', result.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Print it again', onPress: () => void runSuperbill(true) },
        ]);
        return;
      }
      // BY MESSAGE, NEVER BY STATUS CODE. notSeller / notWrapped / notPaid /
      // unrecoverable all arrive here carrying their own approved sentence, and
      // the sentence is the whole point — a generic "couldn't do that" would
      // tell a clinician nothing about which of four things went wrong.
      if (result.reason === 'refused') {
        Alert.alert('No superbill was issued', result.message);
        return;
      }
      setToast(
        result.reason === 'unauthenticated'
          ? 'Sign in again to do that.'
          : 'Couldn’t make that just now. Nothing was changed — try again.',
      );
      return;
    }

    // issue_superbill posted the message that carries the document (0042:139-146),
    // so the conversation changed even when the receipt did not.
    onChanged();
    const { storagePath, alreadyIssued } = result.value;
    Alert.alert(alreadyIssued ? SUPERBILL_ALREADY : SUPERBILL_READY, SUPERBILL_BODY, [
      { text: 'Close', style: 'cancel' as const },
      // MINTED WHEN THE FINGER LANDS, not when the alert opened. The call's own
      // `signed_url` is already a few seconds old and an alert can sit on screen
      // far longer than the 600 s it lives — tapping a captured link would open
      // an expired signature, which is the dead-link failure BUG-016 is about,
      // arriving through the one path that looked too short to matter. This is
      // also what superbill.ts's own "never store a link" rule requires.
      { text: SUPERBILL_OPEN, onPress: () => void openIssuedSuperbill(storagePath) },
    ]);
  };

  /** Fresh link, then tap-out. Used by the alert above and nothing else. */
  const openIssuedSuperbill = async (storagePath: string): Promise<void> => {
    const url = await signedSuperbillUrl(storagePath);
    if (!url) {
      setToast(SUPERBILL_LINK_FAILED);
      return;
    }
    await openDocument(url);
  };

  /**
   * The tap that authorises a PHI disclosure to a third party (S10-5). It is
   * the ONLY way a push is ever enqueued — no trigger, no auto-send on wrap.
   *
   * The RETURNED status decides what is said, never the status that was on
   * screen when the finger landed: a `sent` row is a deliberate no-op
   * (0045:254-259) and must not be reported as a fresh send.
   */
  const sendToRecord = async (): Promise<void> => {
    if (pushBusy) return;
    setPushBusy(true);
    const result = await queueEhrPush(visit.engagement_id);
    setPushBusy(false);

    if (!result.ok) {
      setToast(
        result.reason === 'not_wrapped'
          ? 'Wrap the visit first — there is nothing to send yet.'
          : result.reason === 'cancelled'
            ? 'This visit was cancelled, so nothing can be sent.'
            : result.reason === 'not_seller'
              ? 'Only the clinician who provided the visit can send it.'
              : result.reason === 'unauthenticated'
                ? 'Sign in again to do that.'
                : 'Couldn’t send that just now. Nothing was changed — try again.',
      );
      return;
    }
    setToast(
      result.value.status === 'sent' && !result.value.requeued
        ? 'This visit is already in your record.'
        : PUSH_QUEUED,
    );
    onChanged();
  };

  // The push row, as a clinician reads it. pushed_at is formatted HERE, through
  // src/datetime.ts and in the practice's own zone — the copy module holds no
  // timezone, and the DATE/TIME rule forbids formatting at a display site.
  //
  // NOTE the spec's rendered example (§4) shows "29 Aug 2026, 17:34 UTC". This
  // renders the same instant in the zone the rest of the tile already uses,
  // labelled, because VL-4 makes an unlabelled or foreign-zone time a bug on a
  // clinical surface. Same fact, the tile's own zone discipline.
  const pushLine = push
    ? pushStatusCopy(push.status, {
        attempts: push.attempts,
        skippedReason: push.skipped_reason,
        omissions: push.omissions,
        lastError: push.last_error,
        pushedAtLabel: push.pushed_at
          ? `${formatDayMonth(push.pushed_at, tz)} · ${formatForDisplay(push.pushed_at, 'timeWithZone', tz)}`
          : null,
      })
    : null;

  return (
    <View style={styles.tile}>
      <View style={styles.headerRow}>
        <Text style={styles.peer}>{peerName ?? 'Visit'}</Text>
        <Text style={styles.state}>{VISIT_STATE_LABELS[state]}</Text>
      </View>

      {/* History only — idVerified is NOT PASSED, so the component cannot
          render an identity chip here (N-17). That is structural, not a
          convention: passing `false` would render "Identity not verified",
          which on Today would be a claim nobody made. */}
      {visit.first_visit_on_network ? (
        <HonestyChips
          firstContact
          historyLabels={{ first: CHIP_FIRST_VISIT.label, established: '' }}
        />
      ) : null}

      {/* The time, with an explicit zone (VL-4). modality IS returned by
          get_my_day, unlike on Incoming, so it renders here. */}
      {visit.scheduled_for ? (
        <Text style={styles.timeRow}>
          {[
            visit.modality ? MODALITY_LABEL[visit.modality as 'video' | 'in_person'] : null,
            `${shortWeekday(toDateKey(visit.scheduled_for, tz))} ${formatDayMonth(visit.scheduled_for, tz)}`,
            formatForDisplay(visit.scheduled_for, 'timeWithZone', tz),
          ]
            .filter((p): p is string => p !== null)
            .join(' · ')}
        </Text>
      ) : null}

      {visit.agreed_price_cents !== null ? (
        <Text style={styles.amount}>
          {formatCents(visit.agreed_price_cents, visit.currency ?? 'usd')}
        </Text>
      ) : null}

      {/* The room row — both states. */}
      <Pressable
        style={[styles.roomRow, roomReady ? styles.roomReady : styles.roomPending]}
        onPress={() =>
          Alert.alert(
            roomReady ? VISIT_ROOM_READY : VISIT_ROOM_PENDING,
            roomReady ? VISIT_ROOM_READY_BODY : VISIT_ROOM_PENDING_BODY,
            [{ text: 'Close', style: 'cancel' }],
          )
        }
        accessibilityRole="button"
      >
        <Text style={[styles.roomLabel, roomReady && styles.roomLabelReady]}>
          {roomReady ? VISIT_ROOM_READY : VISIT_ROOM_PENDING}
        </Text>
      </Pressable>

      {/* The plan line. The fold comes from get_my_day, which uses the same
          latest-per-index rule the conversation does — a tile and an open
          conversation cannot disagree. */}
      {visit.plan_message_id && visit.plan_items_total ? (
        <Text style={styles.plan}>
          {planProgress(visit.plan_items_done ?? 0, visit.plan_items_total)}
        </Text>
      ) : null}

      {/* Practice gets the visit + wrap affordances; anything else does not. */}
      {isPractice && state !== 'cancelled' && state !== 'wrapped' ? (
        <View style={styles.actions}>
          {state === 'scheduled' ? (
            <Pressable
              style={[styles.primary, busy && styles.off]}
              disabled={busy}
              onPress={() => void start()}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={theme.colors.onAccent} />
              ) : (
                <Text style={styles.primaryLabel}>Start the visit</Text>
              )}
            </Pressable>
          ) : null}
          <View style={styles.actionRow}>
            {roomReady ? (
              <Pressable style={styles.outline} onPress={() => void openRoom()}>
                <Text style={styles.outlineLabel}>Open the room</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.outline} onPress={() => onWrap(visit)}>
              <Text style={styles.outlineLabel}>Wrap</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* WRAPPED — the two taps (PLEXMED S8 + S10). This block is the answer to
          a tile that, until now, rendered NO actions at all the moment the wrap
          succeeded: `state !== 'wrapped'` above gated off the affordances at
          exactly the point both features become relevant.

          THE SUPERBILL LABEL IS NEUTRAL because the app cannot know whether one
          exists — public.superbills is RLS-on with zero policies and no client
          can read it (0042:137-138). Issue-once (S8-3) is what makes that
          honest: a second tap returns the SAME receipt, and the alert says
          which of the two just happened.

          THE PUSH IS A SEPARATE TAP AND MUST STAY ONE. Making the superbill
          does not send it, and sending does not make it. Folding them into one
          button would make a PHI disclosure to a third party a side effect of
          printing a page — the exact thing S10-5's "tapped, never triggered"
          exists to prevent. */}
      {isPractice && state === 'wrapped' ? (
        <View style={styles.actions}>
          {pushLine ? (
            <View>
              <Text style={styles.pushLine}>{pushLine.line}</Text>
              {pushLine.hint ? <Text style={styles.pushHint}>{pushLine.hint}</Text> : null}
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.outline, superbillBusy && styles.off]}
              disabled={superbillBusy}
              onPress={() => void runSuperbill(false)}
              accessibilityRole="button"
              accessibilityState={{ disabled: superbillBusy }}
            >
              {superbillBusy ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Text style={styles.outlineLabel}>{SUPERBILL_ACTION}</Text>
              )}
            </Pressable>
            {/* A settled row's tap is a no-op in the database, so the button
                says so and does not offer one. Announcing "sent" for a call
                that changes nothing is the claim-without-an-action this
                codebase blocks everywhere else. */}
            <Pressable
              style={[styles.outline, (pushBusy || pushLine?.settled === true) && styles.off]}
              disabled={pushBusy || pushLine?.settled === true}
              onPress={() => void sendToRecord()}
              accessibilityRole="button"
              accessibilityState={{ disabled: pushBusy || pushLine?.settled === true }}
            >
              {pushBusy ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Text style={styles.outlineLabel}>
                  {pushLine?.settled
                    ? PUSH_ACTION_SENT
                    : pushLine?.retryable
                      ? PUSH_ACTION_RETRY
                      : PUSH_ACTION}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <Toast message={toast} onDismiss={() => setToast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { ...tileSurface, padding: theme.spacing.lg, gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  peer: { ...theme.typography.body, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  state: { ...theme.typography.caption, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  timeRow: { ...theme.typography.body, color: theme.colors.textSecondary },
  amount: { ...theme.typography.body, color: theme.colors.textPrimary },
  plan: { ...theme.typography.caption, color: theme.colors.textMuted },
  // The push status row. Deliberately NOT colour-coded by outcome: a skip is a
  // decision, not an error (0045 / S10-9), and painting it red would tell a
  // clinician something went wrong when the system refused on purpose. The
  // words carry the difference; the colour does not pretend to.
  pushLine: { ...theme.typography.caption, color: theme.colors.textSecondary },
  pushHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  roomRow: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
  },
  roomReady: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  roomPending: { borderColor: theme.colors.hairline, backgroundColor: theme.colors.surfaceInset },
  roomLabel: { ...theme.typography.caption, color: theme.colors.textSecondary },
  roomLabelReady: { color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  actions: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  actionRow: { flexDirection: 'row', gap: theme.spacing.sm },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  primaryLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
  outline: {
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  outlineLabel: { ...theme.typography.bodyMuted, color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  off: { opacity: 0.4 },
});
