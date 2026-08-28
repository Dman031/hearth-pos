import React, { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import useEntity from '../hooks/useEntity';
import { setEmailPreference } from '../services/settings';

// SettingsPanel — the account's own settings, as an embedded sheet panel
// (ContactsPanel / MoneyPanel pattern: navigation-free, lives inside
// AccountChip's sheet). Ruling N-1 makes this the home for owned modules too;
// there is NO modules section yet, on purpose — nothing is ownable until the
// board ships, and an empty "Modules" heading is exactly the placeholder N-4
// forbids. It appears when there is something in it.
//
// TODAY IT HOLDS ONE SWITCH: the email preference (E-10, migration 0043).
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

export default function SettingsPanel() {
  const { entity, refresh } = useEntity();
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
