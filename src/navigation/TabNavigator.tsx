import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import ProfileScreen from '../screens/ProfileScreen';
import IncomingScreen from '../screens/IncomingScreen';
import PlexChatStack from './PlexChatStack';
import ContactsScreen from '../screens/ContactsScreen';
import Wordmark from '../components/Wordmark';
import useInboundCount from '../hooks/useInboundCount';
import useUnreadCount from '../hooks/useUnreadCount';
import { theme } from '../styles/theme';

// The four-tab card-model shell: Profile / Incoming / PlexChat / Contacts.
// Incoming is the first-contact consent gate (realtime knocks); PlexChat is the
// conversation that follows (read view in 16a, compose in 16b); Profile keeps
// its real identity header (verified badge + Stripe trigger) + card list. The
// placeholder Identity tab folds into Profile ("My ID") at Day 17 — its screen
// file is retained but no longer registered here.
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
  // Incoming tab badge: count of pending knocks awaiting triage (16b item 2,
  // Incoming half). Read-only + realtime; self-clears as inbound is Accepted/
  // Declined. undefined hides the badge entirely (no "0" pill).
  const { count: incomingCount } = useInboundCount();

  // PlexChat tab badge: total UNREAD messages I've received across all threads
  // (16b item 2b, PlexChat half). Live via realtime; decrements when a thread is
  // opened (mark_thread_read on focus). undefined hides the badge (no "0" pill).
  const { count: unreadCount } = useUnreadCount();

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
      <Tab.Screen
        name="Incoming"
        component={IncomingScreen}
        options={{
          tabBarBadge: incomingCount > 0 ? incomingCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.accent,
            color: theme.colors.background,
          },
        }}
      />
      <Tab.Screen
        name="PlexChat"
        component={PlexChatStack}
        // The nested Stack owns its headers (list + named conversation); hide the
        // tab-level ShellHeader for this tab to avoid a double header.
        options={{
          headerShown: false,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.accent,
            color: theme.colors.background,
          },
        }}
      />
      <Tab.Screen name="Contacts" component={ContactsScreen} />
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
