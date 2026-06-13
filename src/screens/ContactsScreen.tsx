import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// ContactsScreen — the "Contacts" tab: the vendor's connected entities. Thin
// placeholder for the shell step; the real connections list lands later.
export default function ContactsScreen() {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>Contacts</Text>
      <Text style={styles.subtitle}>No connections yet.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
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
});
