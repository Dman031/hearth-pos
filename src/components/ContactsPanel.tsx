import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { APP_NAME } from '../constants/app';
import { theme } from '../styles/theme';
import useContacts from '../hooks/useContacts';
import type { Contact } from '../types/contact';

// ContactsPanel — the private rolodex as an EMBEDDED sheet panel (Day 21
// STOP 5 ruling 2): Contacts moved off the bottom bar into the AccountChip
// sheet, following the IdentityPanel pattern (navigation-free, no route
// changes). Row logic mirrors src/screens/ContactsScreen.tsx, which is
// retained-but-unregistered per the Identity-tab precedent (TabNavigator's
// Day 17 note). Display-only, same as the tab was: a saved contact grants NO
// reach; useContacts stays shared with PlexChatScreen's saved-truth check.

/** A peer is "verified" if it carries ANY verification flag (matches the
 *  network's verified-tier derivation — not id_verified alone). */
function isVerified(c: Contact): boolean {
  return c.id_verified || c.business_verified || c.credential_verified;
}

/** A contact's display label: real name, else its public deus id, else fallback. */
function contactLabel(c: Contact): string {
  if (c.display_name && c.display_name.trim().length > 0) return c.display_name;
  if (c.deus_id && c.deus_id.trim().length > 0) return `#${c.deus_id}`;
  return 'Contact';
}

export default function ContactsPanel() {
  const { contacts, isLoading, error } = useContacts();

  if (isLoading && contacts.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error && contacts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>Couldn’t load right now.</Text>
      </View>
    );
  }

  if (contacts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.subtitle}>
          No contacts saved yet. Save people from a conversation.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      data={contacts}
      keyExtractor={(item) => item.contact_entity_id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.name}>{contactLabel(item)}</Text>
            {item.deus_id ? (
              <Text style={styles.deusId}>
                {APP_NAME} ID {item.deus_id}
              </Text>
            ) : null}
          </View>
          {isVerified(item) ? (
            <View style={styles.pill} accessibilityRole="text">
              <View style={styles.pillDot} />
              <Text style={styles.pillLabel}>Verified</Text>
            </View>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    // Cap the sheet's growth; the rolodex scrolls inside it.
    maxHeight: 380,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.hairline,
  },
  rowMain: {
    flexShrink: 1,
    paddingRight: theme.spacing.md,
  },
  name: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontFamily: theme.fonts.semiBold,
  },
  deusId: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent2Border,
    backgroundColor: theme.colors.accent2Fill,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.pill,
    backgroundColor: theme.colors.accent2Deep,
  },
  pillLabel: {
    ...theme.typography.caption,
    color: theme.colors.accent2Deep,
    fontFamily: theme.fonts.semiBold,
  },
});
