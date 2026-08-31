import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../styles/theme';
import { formatCents } from '../utils/format';
import useEntity from '../hooks/useEntity';
import useCards from '../hooks/useCards';
import { setEmailPreference } from '../services/settings';
import {
  MODULE_CATALOGUE,
  getModuleAccess,
  startModulePurchase,
  type ModuleAccess,
} from '../services/entitlements';
import {
  MODULE_NO_CARD_BODY,
  MODULE_ROW_TITLE,
  MODULE_UNAVAILABLE,
  MODULE_UNVERIFIED_BODY,
  MODULE_UNVERIFIED_POINTER,
} from '../services/practice';
import OpenTimesBoard from './OpenTimesBoard';
import type { Card } from '../types/card';

// SettingsPanel — the account's own settings, as an embedded sheet panel
// (ContactsPanel / MoneyPanel pattern: navigation-free, lives inside
// AccountChip's sheet). Ruling N-1 makes this the home for owned modules too;
// there is NO modules section yet, on purpose — nothing is ownable until the
// board ships, and an empty "Modules" heading is exactly the placeholder N-4
// forbids. It appears when there is something in it.
//
// THE MODULE ROW IS ALWAYS VISIBLE; THE BOARD IS WHAT HIDES (N-4-AMENDED,
// 2026-08-30). This section previously rendered ONLY when the module was
// unlocked, on N-4's "hidden when ungated" reading — and that reading was
// OVER-APPLIED. N-4 is right about INERT CONTROLS and was never about catalogue
// entries. DERRICK, RECORDED AS GIVEN: "A price is not an inert control, it is
// an offer, and hiding it means the product cannot be discovered or bought."
// The result was a storefront with no door: a clinician who had not verified
// saw no evidence PlexMed existed at all, and Settings offered no pointer
// toward the board under ANY condition. That is what the device pass found.
//
// THE GATE IS UNCHANGED (N-1): owned AND licensed, two conditions, never
// collapsed. Only the RENDERING changed — which is the strongest evidence this
// is the shape N-1 always implied. isModuleOwned() is still the TODO(PAYWALL)
// seam returning true, so today the licence stamp is what decides.
//
// FOUR ARMS, EVERY ONE OF THEM TAPPABLE:
//   unowned                     → the price + a tap that buys. NOT REACHABLE
//                                 today (the seam returns true); built anyway
//                                 so the paywall drops in rather than becoming
//                                 a refactor.
//   owned, unverified           → jumps INTO the ceremony. The pointer text
//                                 stays: where the licence lives is worth
//                                 knowing even when the tap takes you there.
//   owned, verified, no card    → the fourth arm, found by tracing the gap
//                                 rather than inferred from the ruling. The
//                                 board attaches to a CARD, so this state falls
//                                 between N-1's conditions — and hiding the
//                                 module here would repeat N-4's error one
//                                 condition later. Points at Profile.
//   owned, verified, with card  → the board. One row per practice card.
//
// WHY THE JUMP IS NOT AN N-8 VIOLATION: AccountChip owns Settings and the
// ceremony as two views of ONE sheet, so this is a view switch, not a stacked
// modal — and the stacked modal is what N-8 targets. CardEditorSheet's P0 gate
// keeps its pointer-ONLY form because it sits inside a DIFFERENT sheet, where
// the constraint is real.
//
// N-7 — THE WRITE PATH IS NOT NEGOTIABLE. entities.email_opt_out_at has exactly
// one writer, set_email_preference. EntityContext.updateEntity() could write
// the column and MUST NOT: a second write path for the same column is the thing
// the single-canonical-write-path rule exists to prevent. This panel calls the
// service, then refresh()es the entity so what renders is what is stored.
//
// IT IS NOT A MARKETING PREFERENCE, because there is no marketing send. Never
// label it "subscription", "newsletter", "updates" or "notifications". The four
// things it governs are named in the help text and that list is the whole set.
// Default is ON and is never pre-set to off for a new account — a booking
// confirmation nobody receives is the worse failure.

interface SettingsPanelProps {
  /** Closes the whole account sheet. The board needs it before navigating —
   *  a modal left open would cover the tab it just moved to. */
  onDismiss?: () => void;
  /**
   * Switches the ACCOUNT SHEET to its credential view. A sibling view of one
   * sheet, not a second modal — which is why the unverified row may tap through
   * rather than only point (N-4-AMENDED ruling 3). Absent → the row still
   * renders and still carries its pointer text; it just does not jump.
   */
  onOpenCredential?: () => void;
}

export default function SettingsPanel({ onDismiss, onOpenCredential }: SettingsPanelProps) {
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const { entity, refresh } = useEntity();
  const { cards } = useCards();
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  // The board this panel is showing, or null for the settings list. Kept HERE
  // rather than as another AccountChip SheetView: the board is a module's
  // interior, not a peer of My ID / Contacts / Money.
  const [boardCard, setBoardCard] = useState<Card | null>(null);
  // ARM 1's refusal. The purchase seam cannot succeed before commerce ships, so
  // if that arm ever fires the tap says so rather than appearing to work.
  const [buyFailed, setBuyFailed] = useState(false);

  const handleBuy = useCallback(async () => {
    const result = await startModulePurchase('plexmed');
    setBuyFailed(!result.ok);
  }, []);

  const practiceCards = cards.filter((c) => c.kind === 'practice');

  useEffect(() => {
    if (!entity) {
      setAccess(null);
      return;
    }
    let active = true;
    void getModuleAccess('plexmed', entity).then((result) => {
      if (active) setAccess(result);
    });
    return () => {
      active = false;
    };
  }, [entity]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Held only across the round trip so the switch does not visibly snap back
  // while the write is in flight. Server truth resumes as soon as it lands.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  // ON is the ABSENCE of an opt-out stamp — the default for every account.
  const stored = (entity?.email_opt_out_at ?? null) === null;
  const enabled = optimistic ?? stored;

  const onToggle = useCallback(
    async (next: boolean) => {
      if (busy) return;
      setBusy(true);
      setFailed(false);
      setOptimistic(next);
      const result = await setEmailPreference(next);
      if (!result.ok) {
        // Revert to stored truth rather than leaving the switch asserting a
        // preference the server never took.
        setOptimistic(null);
        setFailed(true);
        setBusy(false);
        return;
      }
      await refresh();
      setOptimistic(null);
      setBusy(false);
    },
    [busy, refresh],
  );

  if (boardCard) {
    return (
      <OpenTimesBoard
        card={boardCard}
        onBack={() => setBoardCard(null)}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Modules. THE SECTION RENDERS AS SOON AS ACCESS IS KNOWN — never before
          (a row asserting a state we have not read is a guess), and never
          hidden for lack of a stamp (N-4-AMENDED). `access === null` is the
          in-flight read, which is the only case that renders nothing. */}
      {access !== null ? (
        <View style={styles.modules}>
          <Text style={styles.sectionLabel}>{MODULE_ROW_TITLE}</Text>
          {!access.owned ? (
            /* ARM 1 · THE STOREFRONT. Not reachable today — isModuleOwned() is
               the TODO(PAYWALL) seam and returns true — and built anyway by
               ruling, so the paywall drops into a structure that fits it.
               THE PRICE LINE IS OMITTED WHILE priceCents IS NULL: no PlexMed
               price has been ruled, and an invented number on an offer is the
               placeholder class that shipped fake metrics to a real customer. */
            <Pressable
              style={styles.moduleRow}
              onPress={() => void handleBuy()}
              accessibilityRole="button"
            >
              <View style={styles.moduleText}>
                <Text style={styles.moduleLabel}>{MODULE_CATALOGUE.plexmed.label}</Text>
                <Text style={styles.moduleBody}>{MODULE_CATALOGUE.plexmed.blurb}</Text>
                {MODULE_CATALOGUE.plexmed.priceCents !== null ? (
                  <Text style={styles.modulePrice}>
                    {formatCents(MODULE_CATALOGUE.plexmed.priceCents, 'usd')} a month
                  </Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : !access.licensed ? (
            /* ARM 2 · owned, no live stamp. TAPS THROUGH to the ceremony — a
               sibling view of this same sheet. The pointer text stays: where
               the licence lives outlives this one tap. */
            <Pressable
              style={styles.moduleRow}
              onPress={onOpenCredential}
              disabled={!onOpenCredential}
              accessibilityRole="button"
            >
              <View style={styles.moduleText}>
                <Text style={styles.moduleLabel}>{MODULE_CATALOGUE.plexmed.label}</Text>
                <Text style={styles.moduleBody}>{MODULE_UNVERIFIED_BODY}</Text>
                <Text style={styles.moduleHint}>{MODULE_UNVERIFIED_POINTER}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : practiceCards.length === 0 ? (
            /* ARM 3 · THE FOURTH ARM. Owned and verified with nothing for a
               board to attach to. Hiding the module here would repeat N-4's
               error one condition later, so it points at Profile — where
               ＋ Add → Practice is now an accepted path. */
            <Pressable
              style={styles.moduleRow}
              onPress={() => {
                // Close the sheet FIRST — a modal left open covers the tab it
                // just moved to (the CredentialPanel "See my card" pattern).
                onDismiss?.();
                navigation.navigate('Profile');
              }}
              accessibilityRole="button"
            >
              <View style={styles.moduleText}>
                <Text style={styles.moduleLabel}>{MODULE_CATALOGUE.plexmed.label}</Text>
                <Text style={styles.moduleBody}>{MODULE_NO_CARD_BODY}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : (
            /* ARM 4 · the board. One row per practice card, unchanged. */
            practiceCards.map((c) => (
              <Pressable
                key={c.id}
                style={styles.moduleRow}
                onPress={() => setBoardCard(c)}
                accessibilityRole="button"
              >
                <Text style={styles.moduleLabel}>{`Open times · ${c.title}`}</Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))
          )}
          {buyFailed ? <Text style={styles.failed}>{MODULE_UNAVAILABLE}</Text> : null}
        </View>
      ) : null}

      <View style={styles.row}>
        <Text style={styles.label}>Emails about your visits</Text>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          disabled={busy || entity === null}
          trackColor={{ false: theme.colors.surfaceInset, true: theme.colors.accent }}
          thumbColor={theme.colors.surface}
          accessibilityRole="switch"
          accessibilityLabel="Emails about your visits"
        />
      </View>
      <Text style={styles.help}>
        {enabled
          ? 'Requests, confirmations, reminders and cancellations. Nothing else.'
          : 'You’ll still see everything in your conversations.'}
      </Text>
      {failed ? <Text style={styles.failed}>That didn’t save. Try again.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  modules: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  // The row grew a body line, so its text stacks and the chevron stays centred
  // against the block rather than against a single line.
  moduleText: { flex: 1, gap: 2, paddingRight: theme.spacing.md },
  moduleBody: { ...theme.typography.caption, color: theme.colors.textSecondary },
  moduleHint: { ...theme.typography.caption, color: theme.colors.textMuted },
  modulePrice: {
    ...theme.typography.caption,
    color: theme.colors.accent,
    fontFamily: theme.fonts.semiBold,
  },
  sectionLabel: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  moduleLabel: { ...theme.typography.body, color: theme.colors.textPrimary },
  chevron: { ...theme.typography.body, color: theme.colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
  },
  label: { ...theme.typography.body, color: theme.colors.textPrimary, flexShrink: 1 },
  help: { ...theme.typography.bodyMuted, color: theme.colors.textMuted },
  failed: { ...theme.typography.bodyMuted, color: theme.colors.danger },
});
