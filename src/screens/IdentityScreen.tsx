import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import useAuth from '../hooks/useAuth';
import useEntity from '../hooks/useEntity';
import { theme } from '../styles/theme';

// IdentityScreen — the "Identity" tab: trust tier, account, sign-out. Thin
// placeholder for the shell step (the real trust-tier identity surface from the
// prototype lands at Day 17).
//
// CARRY-FORWARD: this tab is the new home of sign-out. The old HomeScreen held
// the only sign-out in the authenticated tab shell; it was deleted with the
// legacy tabs, so the affordance moves here (Identity = the account surface).
// Uses useAuth().signOut() directly — on success App's routing drops the user
// back to AuthScreen, so no navigation is needed here.
export default function IdentityScreen() {
  const { user, signOut } = useAuth();
  const { entity } = useEntity();
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const handleSignOut = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const { error } = await signOut();
      if (error) {
        Alert.alert('Sign out', error.message);
      }
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  }, [signOut]);

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.title}>Identity</Text>
        {/* TODO(Day 17): trust-tier identity surface (verification tiers,
            connections, the prototype Identity screen). Placeholder for now. */}
        <Text style={styles.meta}>{user?.email ?? 'Signed in'}</Text>
        {entity?.deus_id ? (
          <Text style={styles.metaMuted}>Deus ID {entity.deus_id}</Text>
        ) : null}
      </View>

      <Pressable
        style={styles.signOut}
        onPress={handleSignOut}
        disabled={submitting}
        hitSlop={8}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 22,
  },
  top: {
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
  },
  meta: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
  metaMuted: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  signOut: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  signOutLabel: {
    ...theme.typography.body,
    color: theme.colors.danger,
  },
});
