import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import useCards from '../hooks/useCards';
import useMyVerifications from '../hooks/useMyVerifications';
import useCardSlots from '../hooks/useCardSlots';
import useMyDay from '../hooks/useMyDay';
import CredentialPanel from '../components/CredentialPanel';
import PracticeCardSheet from '../components/PracticeCardSheet';
import OpenTimesBoard from '../components/OpenTimesBoard';
import { MODULE_CATALOGUE } from '../services/entitlements';
import { PAUSED_HORIZON_DAYS } from '../services/practice';
import { theme } from '../styles/theme';
import type { Card } from '../types/card';

// PlexMedScreen — THE module, as ONE screen with four states (ruling N-19,
// 2026-09-01).
//
// WHAT THIS REPLACES. PlexMed was scattered across three surfaces by four
// sessions that each built correctly to a distributed ruling: the ceremony
// behind My ID, practice authoring behind Profile's ＋ Add → Practice chip, and
// the board behind Settings' arm 4. A clinician setting up a practice had to
// leave the module to do every step of it, and the device pass found the end of
// that road — arm 3 pointing at Profile from the Profile tab, so the tap looked
// like nothing. Nothing was broken. The SHAPE was wrong, and this is the shape.
//
// EXACTLY ONE NEXT ACTION PER STATE. That is the whole design rule, and it is
// what makes the four states worth naming rather than deriving on the fly:
//   1 NOT VERIFIED      → Start (the ceremony, in place)
//   2 VERIFIED, NO CARD → Create (PracticeCardSheet, in place)
//   3 CARD, NO TIMES    → Post times (the board, with AddTimesSheet ready)
//   4 RUNNING           → rows with counts, and where requests arrive
//
// NOTHING HERE IS A NEW FEATURE. CredentialPanel, PracticeCardSheet,
// OpenTimesBoard and AddTimesSheet all pre-date this file unchanged in
// substance; this is composition and navigation. The only component change is
// OpenTimesBoard's `openAddOnMount`, which state 3 needs to open the board with
// its add sheet already up — one prop, so "Post times" is one tap and not two.
//
// TRI-STATE, NEVER A GUESSED STATE. `licenceLive` is undefined while the read is
// in flight or failed, and the screen renders a spinner rather than state 1 —
// telling a verified clinician to go and verify is the expensive wrong answer,
// and it is exactly the race the pre-N-19 Practice chip carried (ProfileScreen's
// `practiceAvailable` had no loading guard, so a fast tap refused a clinician
// who was verified). The times count gets the same treatment: unknown is a
// spinner, never "nobody can book you".
//
// THE CEREMONY AND THE BOARD ARE VIEW SWAPS; the two authoring sheets are
// Modals. Both work here because this is a PUSHED SCREEN and the account sheet
// is already dismissed on the way in — no modal is ever inside another (N-8).

/** Which of the four states the module is in, or null while it is unknowable. */
type ModuleState = 1 | 2 | 3 | 4 | null;

export default function PlexMedScreen() {
  const navigation = useNavigation<{
    goBack: () => void;
    navigate: (screen: string, params?: object) => void;
  }>();
  const { cards } = useCards();
  const {
    verifications,
    isLoading: verLoading,
    error: verError,
    refresh: refreshVerifications,
  } = useMyVerifications();

  // The interior views. Only one is ever up.
  const [showCeremony, setShowCeremony] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  // True when the board should come up with AddTimesSheet already open — state
  // 3's "Post times" is one action, and making it two would be a worse answer
  // to the very problem N-19 fixes.
  const [boardOpensAdd, setBoardOpensAdd] = useState(false);
  const [practiceMode, setPracticeMode] = useState<'create' | 'edit' | null>(null);

  const practiceCard: Card | null = cards.find((c) => c.kind === 'practice') ?? null;

  // UNDEFINED WHILE IN FLIGHT OR FAILED, never while merely empty. An empty list
  // is a real answer — no stamp — and state 1 is the right screen for it.
  const licenceLive: boolean | undefined =
    verLoading || verError !== null
      ? undefined
      : verifications.some(
          (v) => v.type === 'license' && v.status === 'verified' && v.voided_at === null,
        );

  // The times window. The board paginates by week; this read only ever answers
  // "are there open times ahead", so it takes the same 90-day horizon the paused
  // banner used before N-19 retired it. NO ZONE MATH HERE ON PURPOSE: the
  // question is a COUNT over an absolute window, and the board owns zone-aware
  // day bucketing for the rendering that actually needs it.
  const { from, to } = useMemo(() => {
    const now = new Date();
    return { from: now, to: new Date(now.getTime() + PAUSED_HORIZON_DAYS * 86_400_000) };
  }, []);
  const {
    slots,
    isLoading: slotsLoading,
    failed: slotsFailed,
    refresh: refreshSlots,
  } = useCardSlots(practiceCard?.id ?? null, from, to);
  const openCount = slots.filter((s) => s.state === 'open').length;
  const timesKnown = practiceCard !== null && !slotsLoading && !slotsFailed;

  // N-2 SURVIVES: Today is generic and lives on Engagement. This is a COUNT AND
  // A DESTINATION off the same service — never a second fold of get_my_day.
  const { visits } = useMyDay();

  const state: ModuleState =
    licenceLive === undefined
      ? null
      : !licenceLive
        ? 1
        : practiceCard === null
          ? 2
          : !timesKnown
            ? null
            : openCount === 0
              ? 3
              : 4;

  const openBoard = useCallback((withAdd: boolean) => {
    setBoardOpensAdd(withAdd);
    setShowBoard(true);
  }, []);

  // STATE 1 → 2 DEPENDS ON THIS, so it is not a tidy-up. useMyVerifications
  // fetches on FOCUS, and the ceremony is a VIEW SWAP inside this same screen —
  // closing it fires no focus event, so nothing would re-read. A clinician who
  // finished verifying and tapped back would land on state 1 again, being told
  // to verify a licence they had just verified: the exact wrong answer the
  // tri-state guard exists to prevent, on the screen whose whole point is moving
  // between these four states. The hook's pending-poll does not cover it either
  // — this screen's pump ran at mount, found nothing pending and stopped; the
  // pending row is minted afterwards by CredentialPanel's own hook instance.
  const closeCeremony = useCallback(() => {
    setShowCeremony(false);
    void refreshVerifications();
  }, [refreshVerifications]);

  // ── interior views ────────────────────────────────────────────────────────
  if (showCeremony) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header title="Verify my license" onBack={closeCeremony} />
        <ScrollView contentContainerStyle={styles.content}>
          <CredentialPanel onClose={closeCeremony} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (showBoard && practiceCard) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <OpenTimesBoard
          card={practiceCard}
          openAddOnMount={boardOpensAdd}
          onBack={() => {
            setShowBoard(false);
            setBoardOpensAdd(false);
            void refreshSlots();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title={MODULE_CATALOGUE.plexmed.label} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {state === null ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
          </View>
        ) : null}

        {/* ── STATE 1 · NOT VERIFIED ─────────────────────────────────────── */}
        {state === 1 ? (
          <>
            <Text style={styles.blurb}>{MODULE_CATALOGUE.plexmed.blurb}</Text>
            <View style={styles.action}>
              <Text style={styles.actionTitle}>Verify your license</Text>
              <Pressable
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
                onPress={() => setShowCeremony(true)}
                accessibilityRole="button"
              >
                <Text style={styles.primaryLabel}>Start</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* ── STATES 2-4 all open with the stamp ─────────────────────────── */}
        {state === 2 || state === 3 || state === 4 ? <Stamp /> : null}

        {/* ── STATE 2 · VERIFIED, NO CARD ────────────────────────────────── */}
        {state === 2 ? (
          <View style={styles.action}>
            <Text style={styles.actionTitle}>Set up your practice</Text>
            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={() => setPracticeMode('create')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>Create</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── STATES 3-4 · the practice row ──────────────────────────────── */}
        {(state === 3 || state === 4) && practiceCard ? (
          <Row
            label="My practice"
            detail={practiceCard.title}
            actionLabel="Edit"
            onPress={() => setPracticeMode('edit')}
          />
        ) : null}

        {/* ── STATE 3 · CARD, NO TIMES ───────────────────────────────────── */}
        {state === 3 ? (
          <View style={styles.action}>
            <Text style={styles.actionTitle}>Open times</Text>
            <Text style={styles.actionBody}>Nobody can book you until you post some.</Text>
            <Pressable
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              onPress={() => openBoard(true)}
              accessibilityRole="button"
            >
              <Text style={styles.primaryLabel}>Post times</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── STATE 4 · RUNNING ──────────────────────────────────────────── */}
        {state === 4 ? (
          <>
            <Row
              label="Open times"
              detail={`${openCount}`}
              onPress={() => openBoard(false)}
            />
            <Row
              label="Today"
              detail={`${visits.length}`}
              // N-2: Today is generic and lives on Engagement. From a pushed
              // screen the tabs are a child of 'Shell', so this both selects the
              // tab and pops PlexMed — one call, the right two effects.
              onPress={() => navigation.navigate('Shell', { screen: 'Engagement' })}
            />
            <Text style={styles.footnote}>Requests arrive in Incoming.</Text>
          </>
        ) : null}
      </ScrollView>

      <PracticeCardSheet
        mode={practiceMode}
        card={practiceMode === 'edit' ? practiceCard : null}
        onClose={() => {
          setPracticeMode(null);
          void refreshSlots();
        }}
      />
    </SafeAreaView>
  );
}

/** The screen's own back-and-title bar. The root stack renders no header. */
function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button">
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

/** The Verified Clinician stamp, as states 2-4 all open with it. */
function Stamp() {
  return (
    <View style={styles.stamp}>
      <Text style={styles.stampCheck}>✓</Text>
      <Text style={styles.stampLabel}>Verified Clinician</Text>
    </View>
  );
}

function Row({
  label,
  detail,
  actionLabel,
  onPress,
}: {
  label: string;
  detail?: string;
  actionLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={styles.chevron}>{actionLabel ?? '›'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: 22,
    paddingVertical: theme.spacing.md,
  },
  back: { ...theme.typography.body, color: theme.colors.accent },
  headerTitle: { ...theme.typography.body, color: theme.colors.textPrimary, fontFamily: theme.fonts.semiBold },
  content: { paddingHorizontal: 22, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  loading: { paddingVertical: theme.spacing.xl, alignItems: 'center' },
  blurb: { ...theme.typography.bodyMuted, color: theme.colors.textSecondary },
  action: { gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionTitle: { ...theme.typography.body, color: theme.colors.textPrimary, fontFamily: theme.fonts.semiBold },
  actionBody: { ...theme.typography.bodyMuted, color: theme.colors.textMuted },
  primary: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent,
  },
  primaryLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.onAccent,
    fontFamily: theme.fonts.semiBold,
  },
  pressed: { opacity: 0.6 },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  stampCheck: { ...theme.typography.body, color: theme.colors.accent },
  stampLabel: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  rowText: { flex: 1, gap: 2, paddingRight: theme.spacing.md },
  rowLabel: { ...theme.typography.body, color: theme.colors.textPrimary },
  rowDetail: { ...theme.typography.caption, color: theme.colors.textMuted },
  chevron: { ...theme.typography.body, color: theme.colors.textMuted },
  footnote: { ...theme.typography.bodyMuted, color: theme.colors.textMuted, marginTop: theme.spacing.md },
});
