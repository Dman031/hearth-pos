import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import useEntity from '../hooks/useEntity';
import useCards from '../hooks/useCards';
import { setEmailPreference } from '../services/settings';
import { getModuleAccess, type ModuleAccess } from '../services/entitlements';
import OpenTimesBoard from './OpenTimesBoard';
import type { Card } from '../types/card';

// SettingsPanel — the account's own settings, as an embedded sheet panel
// (ContactsPanel / MoneyPanel pattern: navigation-free, lives inside
// AccountChip's sheet). Ruling N-1 makes this the home for owned modules too;
// there is NO modules section yet, on purpose — nothing is ownable until the
// board ships, and an empty "Modules" heading is exactly the placeholder N-4
// forbids. It appears when there is something in it.
//
// THE MODULES SECTION IS NOW REAL. N-1 deferred it until there was something in
// it; the open-times board is that something. It renders ONLY when a module is
// unlocked — hidden when ungated, never visible-locked (N-4): a locked surface
// advertises what someone cannot have and invites a refused tap.
//
// THE GATE IS TWO CONDITIONS (N-1): owned AND licensed. isModuleOwned() is the
// TODO(PAYWALL) seam and returns true until commerce ships, so today the licence
// stamp is what decides. The two lock arms are kept distinct in entitlements.ts
// because they are different screens once the paywall exists — nothing here
// collapses them.
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
}

export default function SettingsPanel({ onDismiss }: SettingsPanelProps) {
  const { entity, refresh } = useEntity();
  const { cards } = useCards();
  const [access, setAccess] = useState<ModuleAccess | null>(null);
  // The board this panel is showing, or null for the settings list. Kept HERE
  // rather than as another AccountChip SheetView: the board is a module's
  // interior, not a peer of My ID / Contacts / Money.
  const [boardCard, setBoardCard] = useState<Card | null>(null);

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
      {/* Modules — hidden entirely unless unlocked (N-4). A practice card is
          what a PlexMed board attaches to, so with no practice card there is
          nothing to open and the section stays absent rather than empty. */}
      {access?.unlocked && practiceCards.length > 0 ? (
        <View style={styles.modules}>
          <Text style={styles.sectionLabel}>PlexMed</Text>
          {practiceCards.map((c) => (
            <Pressable
              key={c.id}
              style={styles.moduleRow}
              onPress={() => setBoardCard(c)}
              accessibilityRole="button"
            >
              <Text style={styles.moduleLabel}>{`Open times · ${c.title}`}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
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
