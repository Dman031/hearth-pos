import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useAuth from '../hooks/useAuth';
import { theme } from '../styles/theme';

export default function HomeScreen() {
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Text style={styles.welcome}>Welcome back</Text>
        <Text style={styles.email}>{user?.email ?? 'vendor'}</Text>
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
  top: {
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  welcome: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  email: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
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
