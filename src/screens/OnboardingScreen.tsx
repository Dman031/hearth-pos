import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HearthOrb from '../components/HearthOrb';
import useAuth from '../hooks/useAuth';
import { theme } from '../styles/theme';

export default function OnboardingScreen() {
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <HearthOrb size={120} />
        <Text style={styles.title}>Onboarding — coming Day 2-3</Text>
        <Text style={styles.body}>
          We&apos;ll classify your business and build your profile.
        </Text>
      </View>
      <Pressable style={styles.signOut} onPress={() => signOut()}>
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  body: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.md,
  },
  signOut: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  signOutLabel: {
    ...theme.typography.body,
    color: theme.colors.danger,
  },
});
