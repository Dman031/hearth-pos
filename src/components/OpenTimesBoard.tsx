import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../styles/theme';
import {
  addDaysToKey,
  dayOfMonth,
  formatForDisplay,
  formatZoneLabel,
  shortWeekday,
  toDateKey,
  wallClockToInstant,
  weekKeysFor,
} from '../datetime';
import useEntity from '../hooks/useEntity';
import useMyVerifications from '../hooks/useMyVerifications';
import useCardSlots from '../hooks/useCardSlots';
import Toast from './Toast';
import AddTimesSheet from './AddTimesSheet';
import { setEntityTimezone, withdrawCardSlot, type CardSlot, type SlotModality } from '../services/slots';
import { MODALITY_LABEL } from '../services/practice';
import { getDeviceTimeZone } from '../datetime';
import type { Card } from '../types/card';

// OpenTimesBoard — PLEXMED S5's S1/S2/S4/S5. Lives in the module behind
// Settings (N-3): the board is meaningless without a practice card, and
// cards_practice_requires_licence refuses the card at the database anyway.
//
// THE BOARD READS, THE NETWORK WRITES THE STATES (S5 note 4). held and booked
// arrive from get_my_card_slots; nothing here sets them.
//
// NEVER DELETE A TIME (S5 note 2). Withdraw sets a released stamp; held and
// booked times are refused by the RPC, not merely hidden by this UI.
//
// A TIME INSIDE THE LEAD HOUR RENDERS GREYED WITH NO LABEL (ruling N-10). The
// server calls that state 'past' and is right — it is unbookable — but a 5:40
// slot labelled "Past" at 5:05 reads as a bug. Greyed says nothing false.
//
// ROW-TAP, NOT SWIPE (ruled 2026-08-28). No gesture exists in this codebase and
// device testing is deferred to the App Store pass, so a swipe bug would not
// surface for weeks. Row-tap loses nothing the approved copy promises.
//
// THE HELD AND BOOKED ROWS NAVIGATE. useNavigation throws only when BOTH
// NavigationContext and NavigationContainerRefContext are undefined
// (@react-navigation/core, useNavigation.tsx); NavigationContainer wraps the
// shell (App.tsx:79), so the container ref is always defined and the throw is
// unreachable. A header-rendered component gets the container ref, which
// supports navigate() to a root route. Two sessions of caution here were wrong.
//
// THE SHEET STILL NEVER NAMES THE PERSON. That request lives in Incoming, and
// this row's job is to take the clinician there — not to answer it in place.
//
// N-19 (2026-09-01) — THIS NO LONGER RENDERS INSIDE THE ACCOUNT SHEET. It is a
// view of the PUSHED PlexMed screen, so there is no modal to close before a tab
// change and `onDismiss` is gone. Navigation targets the tabs through their
// parent: navigate('Shell', { screen: ... }) selects the tab and pops PlexMed in
// one call. The old note read "close before navigating; a modal left open would
// cover the tab it just moved to" — true of the sheet-nested board, false now,
// and left here as the reason the prop disappeared rather than deleted silently.

/** The zones the first-run confirm can offer as an alternative. */
const ZONE_CHOICES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
];

interface OpenTimesBoardProps {
  card: Card;
  onBack: () => void;
  /**
   * Opens AddTimesSheet as soon as the board mounts. N-19 state 3's "Post times"
   * is ONE action; without this the clinician would land on an empty board and
   * have to find "Add times" themselves, which is the extra step N-19 exists to
   * remove. Latched on mount only — dismissing the sheet does not reopen it.
   */
  openAddOnMount?: boolean;
}

export default function OpenTimesBoard({ card, onBack, openAddOnMount = false }: OpenTimesBoardProps) {
  const navigation = useNavigation<{ navigate: (screen: string, params?: object) => void }>();
  const { entity, refresh: refreshEntity } = useEntity();
  const { verifications } = useMyVerifications();

  // The practice's stored zone. Until it is confirmed the board still has to
  // place times somewhere, so it falls back to the device — and the confirm
  // (S4) is exactly what stops that fallback from becoming a silent assumption.
  const storedTz = entity?.timezone ?? null;
  const tz = storedTz ?? getDeviceTimeZone();

  const [anchorKey, setAnchorKey] = useState<string>(() => toDateKey(new Date(), tz));
  const [selectedKey, setSelectedKey] = useState<string>(() => toDateKey(new Date(), tz));
  const [adding, setAdding] = useState(openAddOnMount);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'default' | 'danger'>('default');
  const [pickingZone, setPickingZone] = useState(false);
  const [savingTz, setSavingTz] = useState(false);

  const weekKeys = useMemo(() => weekKeysFor(anchorKey), [anchorKey]);
  const from = useMemo(() => wallClockToInstant(weekKeys[0], 0, 0, tz), [weekKeys, tz]);
  const to = useMemo(
    () => wallClockToInstant(addDaysToKey(weekKeys[6], 1), 0, 0, tz),
    [weekKeys, tz],
  );
  const { slots, isLoading, failed, refresh } = useCardSlots(card.id, from, to);

  const licenceLive = verifications.some(
    (v) => v.type === 'license' && v.status === 'verified' && v.voided_at === null,
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CardSlot[]>();
    for (const s of slots) {
      const key = toDateKey(s.starts_at, tz);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    for (const list of map.values()) list.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return map;
  }, [slots, tz]);

  const daySlots = byDay.get(selectedKey) ?? [];

  const showToast = useCallback((message: string, tone: 'default' | 'danger' = 'default') => {
    setToastTone(tone);
    setToast(message);
  }, []);

  const confirmZone = useCallback(
    async (zone: string) => {
      setSavingTz(true);
      const result = await setEntityTimezone(zone);
      setSavingTz(false);
      if (!result.ok) {
        showToast('Couldn’t save that just now. Try again.', 'danger');
        return;
      }
      setPickingZone(false);
      await refreshEntity();
    },
    [refreshEntity, showToast],
  );

  const onRowPress = useCallback(
    (slot: CardSlot) => {
      if (slot.state === 'past') return;

      if (slot.state === 'held') {
        // The sheet NEVER names the person. That request lives in Incoming,
        // where it is answered.
        Alert.alert(
          'Someone has asked for this time',
          'It is held for them until you answer. Answer in Incoming.',
          [
            { text: 'Close', style: 'cancel' },
            {
              text: 'Go to Incoming',
              onPress: () => {
                // N-19: the board is a view of the PUSHED PlexMed screen, so the
                // tabs are a child of 'Shell'. This selects the tab AND pops
                // PlexMed — which is what the old onDismiss() did by hand back
                // when this rendered inside the account sheet's Modal.
                navigation.navigate('Shell', { screen: 'Incoming' });
              },
            },
          ],
        );
        return;
      }

      // Booked-row tap opens the visit in Engagement (S5:120). The tab is as
      // deep as this can go — Engagement has no per-visit route to target.
      if (slot.state === 'booked') {
        navigation.navigate('Shell', { screen: 'Engagement' });
        return;
      }

      Alert.alert(
        'Withdraw this time?',
        'It comes off your card. Nobody has asked for it.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Withdraw',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                const result = await withdrawCardSlot(slot.id);
                if (!result.ok) {
                  // The race: open when it rendered, asked-for by the time it
                  // was tapped. The server is the guarantee; this is the toast
                  // the spec writes for exactly that.
                  if (result.reason === 'slot_held' || result.reason === 'slot_booked') {
                    showToast('Someone has asked for this time — answer the request first.', 'danger');
                  } else {
                    showToast('Couldn’t withdraw that just now. Try again.', 'danger');
                  }
                }
                await refresh();
              })();
            },
          },
        ],
      );
    },
    [refresh, showToast, navigation],
  );

  const defaultModality: SlotModality = 'video';

  // ─── S4 · first-run zone confirm ─────────────────────────────────────────
  // Derived from timezone being null — set_entity_timezone normalises empty to
  // null, so "never confirmed" has exactly one representation and there is no
  // local flag to drift out of step with it.
  if (storedTz === null) {
    return (
      <View style={styles.block}>
        <Text style={styles.title}>{`You’re in ${formatZoneLabel(new Date(), tz, 'long')}?`}</Text>
        <Text style={styles.body}>
          We use this to place the times you post. Change it any time in Settings.
        </Text>
        {pickingZone ? (
          <View style={styles.zoneList}>
            {ZONE_CHOICES.map((z) => (
              <Pressable
                key={z}
                style={styles.zoneRow}
                onPress={() => void confirmZone(z)}
                disabled={savingTz}
                accessibilityRole="button"
              >
                <Text style={styles.zoneLabel}>{formatZoneLabel(new Date(), z, 'long')}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            <Pressable
              style={styles.primary}
              onPress={() => void confirmZone(tz)}
              disabled={savingTz}
              accessibilityRole="button"
            >
              {savingTz ? (
                <ActivityIndicator size="small" color={theme.colors.onAccent} />
              ) : (
                <Text style={styles.primaryLabel}>Yes, that’s right</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setPickingZone(true)} accessibilityRole="button">
              <Text style={styles.secondaryLabel}>Pick a different one</Text>
            </Pressable>
          </>
        )}
        <Toast message={toast} tone={toastTone} onDismiss={() => setToast(null)} />
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button">
        <Text style={styles.back}>‹ PlexMed</Text>
      </Pressable>
      <Text style={styles.title}>Open times</Text>
      <Text style={styles.sub}>{`Times shown in ${formatZoneLabel(new Date(), tz, 'long')}`}</Text>

      {/* S5 · the stamp came off. The card is paused and no time can be added
          while it is. Points at the licence flow rather than opening it (N-8). */}
      {!licenceLive ? (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedTitle}>Your card is paused</Text>
          <Text style={styles.body}>
            While the Verified Clinician stamp is off, your open times are not shown and nobody
            can request a visit. Your times are still here.
          </Text>
          <Text style={styles.helper}>
            Re-run verification from your account menu, under My ID.
          </Text>
        </View>
      ) : null}

      {/* Week strip — a paging row, not a gesture. */}
      <View style={styles.weekNav}>
        <Pressable onPress={() => setAnchorKey(addDaysToKey(anchorKey, -7))} hitSlop={8}>
          <Text style={styles.weekArrow}>‹</Text>
        </Pressable>
        <View style={styles.weekStrip}>
          {weekKeys.map((k) => {
            const on = k === selectedKey;
            const count = (byDay.get(k) ?? []).length;
            return (
              <Pressable
                key={k}
                style={[styles.day, on && styles.dayOn]}
                onPress={() => setSelectedKey(k)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.dayWeekday, on && styles.dayOnText]}>{shortWeekday(k)}</Text>
                <Text style={[styles.dayNumber, on && styles.dayOnText]}>{dayOfMonth(k)}</Text>
                {count > 0 ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setAnchorKey(addDaysToKey(anchorKey, 7))} hitSlop={8}>
          <Text style={styles.weekArrow}>›</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.rows} contentContainerStyle={styles.rowsContent}>
        {isLoading && slots.length === 0 ? (
          <ActivityIndicator color={theme.colors.accent} />
        ) : failed ? (
          // An empty board and a failed read must not look alike.
          <Text style={styles.empty}>Couldn’t load your times right now.</Text>
        ) : slots.length === 0 ? (
          <Text style={styles.empty}>No open times. Your card is paused until you post some.</Text>
        ) : daySlots.length === 0 ? (
          <Text style={styles.empty}>Nothing on this day.</Text>
        ) : (
          daySlots.map((s) => {
            const past = s.state === 'past';
            const held = s.state === 'held';
            const booked = s.state === 'booked';
            return (
              <Pressable
                key={s.id}
                style={[
                  styles.slotRow,
                  held && styles.slotHeld,
                  booked && styles.slotBooked,
                  past && styles.slotPast,
                ]}
                onPress={() => onRowPress(s)}
                disabled={past}
                accessibilityRole="button"
              >
                <Text style={[styles.slotTime, past && styles.slotPastText]}>
                  {`${formatForDisplay(s.starts_at, 'time', tz)} · ${MODALITY_LABEL[s.modality]}`}
                </Text>
                {/* N-10: 'past' carries NO label. Only held and booked do. */}
                {held ? <Text style={styles.chipRequested}>Requested</Text> : null}
                {booked ? <Text style={styles.chipBooked}>Booked</Text> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Toast message={toast} tone={toastTone} onDismiss={() => setToast(null)} />

      <Pressable
        style={[styles.primary, !licenceLive && styles.primaryOff]}
        disabled={!licenceLive}
        onPress={() => setAdding(true)}
        accessibilityRole="button"
      >
        <Text style={styles.primaryLabel}>Add times</Text>
      </Pressable>
      {!licenceLive ? (
        <Text style={styles.helper}>
          While the Verified Clinician stamp is off, your open times are not shown and nobody
          can request a visit. Your times are still here.
        </Text>
      ) : null}

      <AddTimesSheet
        visible={adding}
        cardId={card.id}
        tz={tz}
        defaultModality={defaultModality}
        defaultMinutes={45}
        onClose={() => setAdding(false)}
        onPosted={(outcome) => {
          showToast(
            outcome.skipped > 0
              ? `Posted ${outcome.posted} times. ${outcome.skipped} were already on your board.`
              : `Posted ${outcome.posted} times.`,
          );
          void refresh();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.spacing.md, paddingBottom: theme.spacing.sm },
  back: { ...theme.typography.body, color: theme.colors.accent },
  title: { ...theme.typography.h2, color: theme.colors.textPrimary },
  sub: { ...theme.typography.caption, color: theme.colors.textMuted },
  body: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  empty: { ...theme.typography.body, color: theme.colors.textSecondary },
  pausedBanner: {
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.surfaceInset,
    gap: theme.spacing.sm,
  },
  pausedTitle: { ...theme.typography.body, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  weekArrow: { ...theme.typography.h2, color: theme.colors.accent },
  weekStrip: { flexDirection: 'row', flex: 1, justifyContent: 'space-between' },
  day: { alignItems: 'center', paddingVertical: theme.spacing.sm, paddingHorizontal: 6, borderRadius: theme.borderRadius.card },
  dayOn: { backgroundColor: theme.colors.accentFill },
  dayWeekday: { ...theme.typography.caption, color: theme.colors.textMuted },
  dayNumber: { ...theme.typography.body, color: theme.colors.textPrimary },
  dayOnText: { color: theme.colors.accent },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: theme.colors.accent, marginTop: 3 },
  dotSpacer: { width: 4, height: 4, marginTop: 3 },
  rows: { maxHeight: 260 },
  rowsContent: { gap: theme.spacing.sm },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  slotHeld: { backgroundColor: theme.colors.surfaceInset },
  slotBooked: { borderLeftWidth: 3, borderLeftColor: theme.colors.accent },
  slotPast: { opacity: 0.55 },
  slotTime: { ...theme.typography.body, color: theme.colors.textPrimary },
  slotPastText: { color: theme.colors.textSecondary },
  chipRequested: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chipBooked: { ...theme.typography.caption, color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  zoneList: { gap: theme.spacing.sm },
  zoneRow: {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
  },
  zoneLabel: { ...theme.typography.body, color: theme.colors.textPrimary },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryOff: { opacity: 0.4 },
  primaryLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
  secondaryLabel: { ...theme.typography.body, color: theme.colors.textSecondary, textAlign: 'center' },
});
