import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';
import useContacts from '../hooks/useContacts';
import type { Contact } from '../types/contact';

// ContactsScreen — the "Contacts" tab: the vendor's PRIVATE rolodex (Day 17A).
// Renders the owner's saved contacts (get_my_contacts RPC via useContacts): each
// peer's name, public Deus ID, and a "Verified" pill when the peer carries any
// verification flag. This is a private LIST only — a saved contact grants NO
// reach (17B is a separate build), so a row is display-only (no reach/messaging
// tap-through in scope; a contact-detail surface lands with 17B).

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

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.name}>{contactLabel(contact)}</Text>
        {contact.deus_id ? (
          <Text style={styles.deusId}>Deus ID {contact.deus_id}</Text>
        ) : null}
      </View>
      {isVerified(contact) ? (
        <View style={styles.pill} accessibilityRole="text">
          <View style={styles.pillDot} />
          <Text style={styles.pillLabel}>Verified</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ContactsScreen() {
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
        <Text style={styles.title}>Contacts</Text>
        <Text style={styles.subtitle}>Couldn’t load right now.</Text>
      </View>
    );
  }

  if (contacts.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Contacts</Text>
        <Text style={styles.subtitle}>No contacts yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.contact_entity_id}
        renderItem={({ item }) => <ContactRow contact={item} />}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  listContent: {
    padding: theme.spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  deusId: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    backgroundColor: theme.colors.accentFill,
    marginLeft: theme.spacing.md,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  pillLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
