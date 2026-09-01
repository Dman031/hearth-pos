import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import PlexMedScreen from '../screens/PlexMedScreen';

// RootNavigator — the shell plus the screens PUSHED OVER it.
//
// WHY THIS EXISTS AT ALL (N-19, 2026-09-01). Until now TabNavigator sat directly
// under NavigationContainer and there was nowhere to push to. PlexMed is one
// screen with four states, and each state's action opens a SHEET —
// PracticeCardSheet and AddTimesSheet are both `Modal`s. Rendering PlexMed as a
// view inside AccountChip's own Modal would host a modal inside a modal, which
// is the stacked modal N-8 exists to prevent. (The pre-N-19 board did exactly
// that: OpenTimesBoard rendered inside the account sheet and mounted
// AddTimesSheet from there. This retires it.) A pushed screen dismisses the
// account sheet on the way in, so every sheet PlexMed opens is the only one on
// screen.
//
// THE TAB BAR IS UNTOUCHED. STOP 5 fixed four tabs and N-1 keeps modules off
// them; 'Shell' IS that four-tab navigator, pushed-over rather than replaced.
// PlexMed is still entered from Settings — N-1's entry point survives N-19
// entire.
//
// ROUTE NAMES ARE NO LONGER FLAT, and that is the one thing this file changes
// for everyone else. From a screen pushed ABOVE the tabs, 'Incoming' and
// 'Engagement' are not siblings; they are routes of the 'Shell' child. Anything
// reachable from inside PlexMed therefore navigates
// `navigate('Shell', { screen: 'Incoming' })`, which both selects the tab and
// pops PlexMed off the stack — one call, the right two effects. Components that
// render ONLY inside the tab shell (EngagementScreen, IncomingScreen,
// ConversationListScreen) keep their flat names and are unaffected.

export type RootStackParamList = {
  Shell: undefined;
  PlexMed: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Shell" component={TabNavigator} />
      <Stack.Screen
        name="PlexMed"
        component={PlexMedScreen}
        // A pushed screen, not a modal presentation: it is a place you go and
        // come back from, and its own sheets need to be the topmost layer.
        options={{ presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}
