import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme, tileSurface } from '../styles/theme';
import { formatDayMonth, formatForDisplay, shortWeekday, toDateKey } from '../datetime';
import { formatCents } from '../utils/format';
import HonestyChips from './HonestyChips';
import Toast from './Toast';
import { deriveVisitState, startVisit, type DayVisit } from '../services/visits';
import {
  CHIP_FIRST_VISIT,
  VISIT_ROOM_PENDING,
  VISIT_ROOM_PENDING_BODY,
  VISIT_ROOM_READY,
  VISIT_ROOM_READY_BODY,
  VISIT_STATE_LABELS,
  planProgress,
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
  onWrap: (visit: DayVisit) => void;
  onChanged: () => void;
}

export default function TodayTile({ visit, peerName, tz, onWrap, onChanged }: TodayTileProps) {
  const [busy, setBusy] = useState(false);
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
