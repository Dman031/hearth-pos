import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../styles/theme';
import useEntity from '../hooks/useEntity';
import { setEmailPreference } from '../services/settings';
import { MODULE_CATALOGUE, getModuleAccess, type ModuleAccess } from '../services/entitlements';
// startModulePurchase is NOT imported, by ruling (P-6): arm 1 has no tap, so it
// has no caller. Nor is MODULE_UNAVAILABLE, its refusal text. Both still exist and
// must not be deleted — see their comments before wiring either back.
import { MODULE_ROW_TITLE, MODULE_SETUP_LINE } from '../services/practice';

// SettingsPanel — the account's own settings, as an embedded sheet panel
// (ContactsPanel / MoneyPanel pattern: navigation-free, lives inside
// AccountChip's sheet). Ruling N-1 makes this the home for owned modules too;
// there is NO modules section yet, on purpose — nothing is ownable until the
// board ships, and an empty "Modules" heading is exactly the placeholder N-4
// forbids. It appears when there is something in it.
//
// N-19 (2026-09-01) — PLEXMED IS ONE SCREEN, AND THIS ROW IS ITS DOOR.
// This panel used to carry FOUR ARMS, three of which each pointed somewhere else
// (the ceremony behind My ID, Profile's ＋ Add for the card, the board inline).
// Arm 3 pointed at Profile — and from the Profile tab that tap did nothing
// visible, which is the device finding that produced N-19. The three owned arms
// collapse into ONE row that pushes PlexMedScreen, where the four states and
// their single next actions now live. N-1's entry point is untouched: modules
// are still in the account menu behind Settings.
// ARM 1 (unowned) IS UNCHANGED and stays here — N-19's four states are all
// OWNED states, and the storefront row is not one of them. It is still inert by
// P-6 and still not reachable (the seam returns true).
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
  /** Closes the whole account sheet. The PlexMed row needs it before pushing —
   *  a modal left open would cover the screen it just moved to. (Pre-N-19 this
   *  said "the board needs it"; the board moved to the PlexMed screen.) */
  onDismiss?: () => void;
  /*
   * N-19 retired `onOpenCredential`. The ceremony was reached from here because
   * the unverified arm lived here; it is now STATE 1 of the PlexMed screen, which
   * is the one place a clinician sets a practice up. AccountChip still owns the
   * 'credential' view — the Credential pill inside My ID still opens it.
   */
}

export default function SettingsPanel({ onDismiss }: SettingsPanelProps) {
  const navigation = useNavigation<{ navigate: (screen: string) => void }>();
  const { entity, refresh } = useEntity();
  const [access, setAccess] = useState<ModuleAccess | null>(null);

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

               IT IS NOT PRESSABLE, AND HAS NO CHEVRON (P-6, 2026-08-31). PlexMed
               is bought on the web, so a tap here could only ever produce a
               refusal, and a control whose only possible outcome is a refusal
               cannot act — N-4's original reasoning, restored. The setup line
               renders INLINE AND ALWAYS instead of after a futile tap: it is the
               answer to "how do I get this", not an error.

               NO PRICE LINE, AND NO BRANCH THAT COULD GROW ONE. priceCents is
               ruled null permanently (P-5) and the app names no figure (P-3).
               The `priceCents !== null` render branch was removed with the tap:
               a branch waiting for a value that can never arrive is a claim about
               the future written into code. */
            <View style={styles.moduleRow}>
              <View style={styles.moduleText}>
                <Text style={styles.moduleLabel}>{MODULE_CATALOGUE.plexmed.label}</Text>
                <Text style={styles.moduleBody}>{MODULE_CATALOGUE.plexmed.blurb}</Text>
                <Text style={styles.moduleHint}>{MODULE_SETUP_LINE}</Text>
              </View>
            </View>
          ) : (
            /* THE DOOR (N-19). One row, one destination. What used to be three
               arms — verify your license / make a practice card / the board — are
               now the first three STATES OF THAT SCREEN, which is the only place
               they can each show exactly one next action.
               DISMISS BEFORE PUSHING: this row lives in a Modal, and a modal left
               open would cover the screen it just pushed. */
            <Pressable
              style={styles.moduleRow}
              onPress={() => {
                onDismiss?.();
                navigation.navigate('PlexMed');
              }}
              accessibilityRole="button"
            >
              <View style={styles.moduleText}>
                <Text style={styles.moduleLabel}>{MODULE_CATALOGUE.plexmed.label}</Text>
                <Text style={styles.moduleBody}>{MODULE_CATALOGUE.plexmed.blurb}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
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
  // modulePrice retired with the price line (P-5) — the app renders no figure, so
  // the style that made one look like a price has no reason to exist. `failed`
  // below is NOT dead: the email-preference save error still uses it.
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
