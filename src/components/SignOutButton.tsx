import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useAuth from '../hooks/useAuth';
import { theme } from '../styles/theme';

// Minimal, on-brand sign-out affordance for the pre-tab screens
// (EntitySetupScreen, OnboardingScreen) where a logged-in user would otherwise
// be stuck with no way back to AuthScreen. Self-positions top-right; calls the
// existing useAuth().signOut(). On success the session clears and App's routing
// drops the user back to AuthScreen automatically — no navigation here.
export default function SignOutButton() {
  const { signOut } = useAuth();
  // SafeAreaView applies the top inset as padding, but this button is
  // absolutely positioned against its border box — so offset by the inset
  // ourselves, otherwise it renders under the notch and isn't tappable.
  const insets = useSafeAreaInsets();
  const [submitting, setSubmitting] = useState(false);
  // Synchronous gate against a double-tap before `submitting` re-renders.
  const inFlight = useRef(false);

  const handlePress = async () => {
    if (inFlight.current) {
      return;
    }
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
  };

  return (
    <Pressable
      style={[styles.button, { top: insets.top + theme.spacing.sm }]}
      onPress={handlePress}
      disabled={submitting}
      hitSlop={8}
    >
      <Text style={styles.label}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: theme.spacing.xl,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    zIndex: 10,
  },
  label: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
});
