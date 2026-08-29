import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';
import {
  addDaysToKey,
  dayOfMonth,
  formatWallClock,
  formatZoneLabel,
  shortWeekday,
  toDateKey,
  wallClockToInstant,
} from '../datetime';
import { postCardSlots, type PostSlotsOutcome, type SlotDraft, type SlotModality } from '../services/slots';
import { MODALITY_LABEL, SESSION_LENGTHS } from '../services/practice';

// AddTimesSheet — PLEXMED S5's S3.
//
// EVERY TIME LEAVES HERE AS AN INSTANT. The clinician picks a wall clock; this
// converts it through the STORED practice zone (datetime.wallClockToInstant) and
// sends an ISO instant. It never sends a naive datetime — the server would
// refuse it rather than reinterpret it, and that refusal is correct.
//
// THE DAY CHOOSER IS BESPOKE (ruling N-12). A day chooser is not a calendar, and
// EngagementCalendar already established that this app builds its own rather
// than take a dependency for a surface whose styling is bespoke anyway.
//
// THE GRID IS A FULL 24 HOURS, AND THERE IS NO WINDOW (ruling N-14).
// An earlier draft offered 07:00–21:00. That is a working-day assumption, and
// it quietly tells a night-shift doctor, a clinician serving another timezone,
// and anyone doing early mornings that this product is not for them. The grid
// offers every hour; which of them a clinician works is their business.
//
// A SLOT MAY CROSS MIDNIGHT. Starts run to 23:xx and the end is simply
// start + length, so a 23:30 start ends at 00:15 the next day. Cutting the last
// starts off at midnight would be the same working-day assumption in a smaller
// disguise.
//
// THE ONLY CONSTRAINTS ARE THE RULED ONES, both enforced server-side and both
// mirrored here for fast feedback, never as the guarantee: at least 60 minutes
// out (VL-2), and no overlap with a time already on the board.
//
// SHAPE: a flat wrapping grid inside the existing scroll. Going from 14 hours
// to 24 adds ten to nineteen chips depending on length — 24 at 60 min, 32 at
// 45, 48 at 30. That is a longer scroll, not a different component, so no new
// layout was invented for it.

const MINUTES_IN_DAY = 24 * 60;
/** How many days forward the chooser offers. Today plus three weeks. */
const CHOOSER_DAYS = 22;
/** Nothing inside this window can be posted (VL-2, enforced server-side too). */
const LEAD_MS = 60 * 60 * 1000;

interface AddTimesSheetProps {
  visible: boolean;
  cardId: string;
  /** The practice's stored zone — never the device's. */
  tz: string;
  defaultModality: SlotModality;
  defaultMinutes: number;
  onClose: () => void;
  onPosted: (outcome: PostSlotsOutcome) => void;
}

export default function AddTimesSheet({
  visible,
  cardId,
  tz,
  defaultModality,
  defaultMinutes,
  onClose,
  onPosted,
}: AddTimesSheetProps) {
  const todayKey = toDateKey(new Date(), tz);
  const [dayKey, setDayKey] = useState<string>(todayKey);
  const [minutes, setMinutes] = useState<number>(defaultMinutes);
  const [modality, setModality] = useState<SlotModality>(defaultModality);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [repeat, setRepeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDayKey(todayKey);
    setMinutes(defaultMinutes);
    setModality(defaultModality);
    setSelected(new Set());
    setRepeat(false);
    setError(null);
    setBusy(false);
    // todayKey is derived from `visible`-time now(); intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultMinutes, defaultModality]);

  const dayKeys = useMemo(
    () => Array.from({ length: CHOOSER_DAYS }, (_, i) => addDaysToKey(todayKey, i)),
    [todayKey],
  );

  /** The day's chip grid, in the chosen length. `hh:mm` keys. */
  const gridTimes = useMemo(() => {
    const out: { key: string; hour: number; minute: number; label: string }[] = [];
    for (let m = 0; m < MINUTES_IN_DAY; m += minutes) {
      const hour = Math.floor(m / 60);
      const minute = m % 60;
      out.push({
        key: `${hour}:${minute}`,
        hour,
        minute,
        label: formatWallClock(hour, minute),
      });
    }
    return out;
  }, [minutes]);

  // Changing the length changes what the chips MEAN, so a stale selection would
  // post times the clinician never saw. Cleared rather than remapped.
  const setLength = useCallback((n: number) => {
    setMinutes(n);
    setSelected(new Set());
  }, []);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const drafts = useMemo((): SlotDraft[] => {
    const out: SlotDraft[] = [];
    const dayKeys2 = repeat ? [dayKey, addDaysToKey(dayKey, 7)] : [dayKey];
    for (const key of dayKeys2) {
      for (const t of gridTimes) {
        if (!selected.has(t.key)) continue;
        const start = wallClockToInstant(key, t.hour, t.minute, tz);
        const end = new Date(start.getTime() + minutes * 60_000);
        out.push({
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          modality,
        });
      }
    }
    return out;
  }, [repeat, dayKey, gridTimes, selected, tz, minutes, modality]);

  const post = useCallback(async () => {
    if (busy || drafts.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await postCardSlots(cardId, drafts);
    if (!result.ok) {
      setBusy(false);
      setError(
        result.reason === 'licence_not_verified'
          ? 'While your Verified Clinician stamp is off, times can’t go up.'
          : 'Couldn’t post those just now. Try again.',
      );
      return;
    }
    setBusy(false);
    onPosted(result.value);
    onClose();
  }, [busy, drafts, cardId, onPosted, onClose]);

  const zoneName = formatZoneLabel(new Date(), tz, 'long');

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <Pressable onPress={onClose} hitSlop={8} disabled={busy}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Add open times</Text>
          <View style={styles.headerRight} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Date — the bespoke chooser (N-12). Today forward, never backward. */}
          <Text style={styles.label}>Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.row}>
              {dayKeys.map((k) => {
                const on = k === dayKey;
                return (
                  <Pressable
                    key={k}
                    style={[styles.day, on && styles.dayOn]}
                    onPress={() => setDayKey(k)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.dayWeekday, on && styles.dayOnText]}>
                      {shortWeekday(k)}
                    </Text>
                    <Text style={[styles.dayNumber, on && styles.dayOnText]}>
                      {dayOfMonth(k)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Length — per-sheet override of the card's default. */}
          <Text style={styles.label}>Length</Text>
          <View style={styles.row}>
            {SESSION_LENGTHS.map((n) => {
              const on = n === minutes;
              return (
                <Pressable
                  key={n}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setLength(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{`${n} min`}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* How you meet */}
          <Text style={styles.label}>How you meet</Text>
          <View style={styles.row}>
            {(['video', 'in_person'] as const).map((m) => {
              const on = m === modality;
              return (
                <Pressable
                  key={m}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setModality(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                    {MODALITY_LABEL[m]}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Times */}
          <Text style={styles.label}>Times</Text>
          <View style={styles.row}>
            {gridTimes.map((t) => {
              const instant = wallClockToInstant(dayKey, t.hour, t.minute, tz);
              // Disabled, never hidden: a clinician looking for 5:40 should see
              // it and learn the rule, not wonder where it went.
              const tooSoon = instant.getTime() - Date.now() < LEAD_MS;
              const on = selected.has(t.key);
              return (
                <Pressable
                  key={t.key}
                  style={[styles.chip, on && styles.chipOn, tooSoon && styles.chipOff]}
                  disabled={tooSoon}
                  onPress={() => toggle(t.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled: tooSoon }}
                >
                  <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.helper}>Times need at least an hour’s notice.</Text>

          {/* Repeat — one week only, per the spec. */}
          <Pressable
            style={[styles.chip, repeat && styles.chipOn, styles.selfStart]}
            onPress={() => setRepeat((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: repeat }}
          >
            <Text style={[styles.chipLabel, repeat && styles.chipLabelOn]}>
              Same times next week
            </Text>
          </Pressable>

          <Text style={styles.helper}>
            {`Times are in ${zoneName}. People see them in their own time.`}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primary, (drafts.length === 0 || busy) && styles.primaryOff]}
            disabled={drafts.length === 0 || busy}
            onPress={() => void post()}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator size="small" color={theme.colors.onAccent} />
            ) : (
              <Text style={styles.primaryLabel}>{`Post ${drafts.length} times`}</Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  headerTitle: { ...theme.typography.body, fontFamily: theme.fonts.semiBold, color: theme.colors.textPrimary },
  headerRight: { width: 56 },
  cancel: { ...theme.typography.body, color: theme.colors.accent, width: 56 },
  content: { padding: theme.spacing.lg, gap: theme.spacing.md },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: theme.spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  selfStart: { alignSelf: 'flex-start' },
  day: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    backgroundColor: theme.colors.surface,
    minWidth: 52,
  },
  dayOn: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  dayWeekday: { ...theme.typography.caption, color: theme.colors.textMuted },
  dayNumber: { ...theme.typography.body, color: theme.colors.textPrimary },
  dayOnText: { color: theme.colors.accent },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
  },
  chipOn: { borderColor: theme.colors.accentBorder, backgroundColor: theme.colors.accentFill },
  chipOff: { opacity: 0.4 },
  chipLabel: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  chipLabelOn: { color: theme.colors.accent, fontFamily: theme.fonts.semiBold },
  helper: { ...theme.typography.caption, color: theme.colors.textMuted },
  error: { ...theme.typography.bodyMuted, color: theme.colors.danger },
  primary: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  primaryOff: { opacity: 0.4 },
  primaryLabel: { color: theme.colors.onAccent, fontFamily: theme.fonts.semiBold, fontSize: 16 },
});
