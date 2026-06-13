import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ProfileScreen from '../screens/ProfileScreen';
import IncomingScreen from '../screens/IncomingScreen';
import ContactsScreen from '../screens/ContactsScreen';
import IdentityScreen from '../screens/IdentityScreen';
import Wordmark from '../components/Wordmark';
import { theme } from '../styles/theme';

// The four-tab card-model shell (replaces the legacy Home/Inbox/Jobs/Money +
// temp Profile). SHELL + navigation only — Incoming/Contacts/Identity are thin
// placeholders; Profile keeps its real identity header (verified badge + Stripe
// trigger), Day 11-12 adds its card list, Day 17 builds Identity for real.
//
// The carved Deus wordmark sits in a shared header across all tabs. The tab bar
// stays the working bottom navigator for now; matching the prototype's top pill
// segmented control + Incoming badge is deferred to the design pass.

const Tab = createBottomTabNavigator();

/** Shared top brand bar: the carved wordmark, owning the top safe-area inset. */
function ShellHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + theme.spacing.sm }]}>
      <Wordmark />
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        // Custom header renders the brand; it owns the top inset so screens
        // below should NOT also apply a top safe-area edge.
        header: () => <ShellHeader />,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.surface,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 24,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        // Labels-only for the shell step; the prototype's icon/pill treatment
        // comes in the design pass.
        tabBarIcon: () => null,
      }}
    >
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Incoming" component={IncomingScreen} />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
      <Tab.Screen name="Identity" component={IdentityScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: theme.colors.background,
    borderBottomColor: theme.colors.surface,
    borderBottomWidth: 1,
    paddingBottom: theme.spacing.md,
    alignItems: 'center',
  },
});
