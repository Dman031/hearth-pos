import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useEntity from '../hooks/useEntity';
import { theme } from '../styles/theme';
import IdentityPanel from './IdentityPanel';
import SignOutButton from './SignOutButton';

// AccountChip — the account affordance behind the user's name, present on ALL
// four tabs' headers (Day 17A). Fixes the LIVE defect that a signed-in user had
// no way to sign out (the only SignOutButton lived on pre-shell screens).
//
// The chip (the entity's initial) opens a bottom-sheet Modal it owns entirely —
// no NavigationContainer/App changes. The sheet has two states:
//   - 'menu':     Identity / Settings (placeholder) / Billing (placeholder) /
//                 Sign Out (separated at the bottom, reusing <SignOutButton inline/>).
//   - 'identity': the "My ID" panel (IdentityPanel) with a back affordance.
// One <AccountChip/> instance is dropped into each header (TabNavigator's
// ShellHeader + PlexChatStack's headerRight); only one header is visible at once.

type SheetView = 'menu' | 'identity';

/** First letter of the display name, upper-cased; '·' when unknown. */
function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '·';
}

/** A placeholder menu row (Settings / Billing) — visible, honestly marked "Soon". */
function PlaceholderRow({ label }: { label: string }) {
  return (
    <View style={[styles.row, styles.rowDisabled]} accessibilityRole="text">
      <Text style={[styles.rowLabel, styles.rowLabelMuted]}>{label}</Text>
      <Text style={styles.soon}>Soon</Text>
    </View>
  );
}

export default function AccountChip() {
  const insets = useSafeAreaInsets();
  const { entity } = useEntity();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SheetView>('menu');

  const displayName = entity?.display_name ?? null;

  const close = () => {
    setOpen(false);
    // Reset to the menu for next open (after the sheet is dismissed).
    setView('menu');
  };

  return (
    <>
      <Pressable
        style={styles.chip}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
      >
        <Text style={styles.chipInitial} allowFontScaling={false}>
          {initialOf(displayName)}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        {/* Backdrop — tap outside the sheet to dismiss. */}
        <Pressable style={styles.backdrop} onPress={close}>
          {/* Stop propagation: taps on the sheet itself must not close it. */}
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + theme.spacing.lg }]}
            onPress={() => {}}
          >
            <View style={styles.grabber} />

            {view === 'menu' ? (
              <>
                <Text style={styles.sheetTitle}>{displayName ?? 'Account'}</Text>

                <Pressable
                  style={styles.row}
                  onPress={() => setView('identity')}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowLabel}>My ID</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <PlaceholderRow label="Settings" />
                <PlaceholderRow label="Billing" />

                {/* Sign Out — separated at the bottom; reuses SignOutButton. */}
                <View style={styles.divider} />
                <SignOutButton inline />
              </>
            ) : (
              <>
                <Pressable
                  style={styles.backRow}
                  onPress={() => setView('menu')}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.back}>‹ Account</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>My ID</Text>
                <IdentityPanel />
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(212,165,116,0.28)',
  },
  chipInitial: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.card,
    borderTopRightRadius: theme.borderRadius.card,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textMuted,
    opacity: 0.5,
    marginBottom: theme.spacing.md,
  },
  sheetTitle: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
  },
  rowDisabled: {
    opacity: 0.8,
  },
  rowLabel: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  rowLabelMuted: {
    color: theme.colors.textSecondary,
  },
  soon: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  chevron: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.background,
    marginVertical: theme.spacing.sm,
  },
  backRow: {
    paddingVertical: theme.spacing.xs,
  },
  back: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
});
