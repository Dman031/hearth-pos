import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// IncomingScreen — the "Incoming" tab: requests/threads reaching the vendor
// through the network. Thin placeholder for the shell step; the real incoming
// card/thread list lands in a later sprint.
export default function IncomingScreen() {
  return (
    <View style={styles.content}>
      <Text style={styles.title}>Incoming</Text>
      <Text style={styles.subtitle}>Nothing waiting yet.</Text>
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
