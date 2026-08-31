import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useEntity from '../hooks/useEntity';
import { theme } from '../styles/theme';
import IdentityPanel from './IdentityPanel';
import ContactsPanel from './ContactsPanel';
import MoneyPanel from './MoneyPanel';
import SettingsPanel from './SettingsPanel';
import CredentialPanel from './CredentialPanel';
import SignOutButton from './SignOutButton';

// AccountChip — the account affordance behind the user's name, present on ALL
// four tabs' headers (Day 17A). Fixes the LIVE defect that a signed-in user had
// no way to sign out (the only SignOutButton lived on pre-shell screens).
//
// The chip (the entity's initial) opens a bottom-sheet Modal it owns entirely —
// no NavigationContainer/App changes. The sheet has three states:
//   - 'menu':     My ID / Contacts / Settings / Money /
//                 Sign Out (separated at the bottom, reusing <SignOutButton inline/>).
//   - 'identity': the "My ID" panel (IdentityPanel) with a back affordance.
//   - 'contacts': the private rolodex (ContactsPanel) — the top-corner home of
//                 Contacts since Day 21 STOP 5 replaced its tab with Engagement.
//   - 'money':    balance + settled ledger (MoneyPanel, Day 22B) — the "Soon"
//                 placeholder made real. (The Day 22 earnings/paywall
//                 scaffolds — useEarnings / EarningsCard / TransactionCounter —
//                 stay empty: the ruled Money surface is thinner than the
//                 shape they anticipated.)
//   - 'settings': the account's own settings (SettingsPanel) — the second "Soon"
//                 placeholder made real. Ruling N-1 (2026-08-28) also makes this
//                 the home for OWNED MODULES (PlexMed / PlexLaw / PlexATS):
//                 purchased entitlements belong beside identity, contacts and
//                 money, never on the four-tab bar STOP 5 fixed.
//   - 'credential': the licence ceremony (CredentialPanel, CRED S3), reached
//                 from the Credential pill inside 'identity'. It sits here
//                 rather than on a screen because the pill is here.
// One <AccountChip/> instance is dropped into each header (TabNavigator's
// ShellHeader + PlexChatStack's headerRight); only one header is visible at once.

type SheetView = 'menu' | 'identity' | 'contacts' | 'money' | 'settings' | 'credential';

/** Sheet titles for every non-menu view, in one place. */
const VIEW_TITLE: Record<Exclude<SheetView, 'menu'>, string> = {
  identity: 'My ID',
  contacts: 'Contacts',
  money: 'Money',
  settings: 'Settings',
  credential: 'Verify my license',
};

/** First letter of the display name, upper-cased; '·' when unknown. */
function initialOf(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : '·';
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

                <Pressable
                  style={styles.row}
                  onPress={() => setView('contacts')}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowLabel}>Contacts</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable
                  style={styles.row}
                  onPress={() => setView('settings')}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowLabel}>Settings</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                <Pressable
                  style={styles.row}
                  onPress={() => setView('money')}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowLabel}>Money</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>

                {/* Sign Out — separated at the bottom; reuses SignOutButton. */}
                <View style={styles.divider} />
                <SignOutButton inline />
              </>
            ) : (
              <>
                <Pressable
                  style={styles.backRow}
                  onPress={() => setView(view === 'credential' ? 'identity' : 'menu')}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.back}>
                    {view === 'credential' ? '‹ My ID' : '‹ Account'}
                  </Text>
                </Pressable>
                <Text style={styles.sheetTitle}>{VIEW_TITLE[view]}</Text>
                {view === 'identity' ? (
                  <IdentityPanel onOpenCredential={() => setView('credential')} />
                ) : view === 'contacts' ? (
                  <ContactsPanel />
                ) : view === 'settings' ? (
                  // N-4-AMENDED ruling 3 — THE JUMP. Settings and the ceremony
                  // are two views of THIS sheet, so switching between them is a
                  // view change, not a stacked modal, and the stacked modal is
                  // what N-8 targets. A clinician who taps a row reading
                  // "verify your license" lands in the ceremony rather than
                  // being told where to look for it. The back affordance
                  // already returns 'credential' to 'identity' (:148) — that
                  // stays; arriving from Settings still leaves via My ID, which
                  // is where the licence lives and where the row said it was.
                  <SettingsPanel onDismiss={close} onOpenCredential={() => setView('credential')} />
                ) : view === 'credential' ? (
                  <CredentialPanel onClose={close} />
                ) : (
                  <MoneyPanel />
                )}
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
    borderColor: theme.colors.accentBorder,
  },
  chipInitial: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontFamily: theme.fonts.bold,
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
  rowLabel: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
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
    fontFamily: theme.fonts.semiBold,
  },
});
