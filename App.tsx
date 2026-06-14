import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import HearthOrb from './src/components/HearthOrb';
import { AuthProvider } from './src/context/AuthContext';
import { EntityProvider } from './src/context/EntityContext';
import { VendorProvider } from './src/context/VendorContext';
import { CardProvider } from './src/context/CardContext';
import useAuth from './src/hooks/useAuth';
import useEntity from './src/hooks/useEntity';
import useCards from './src/hooks/useCards';
import AuthScreen from './src/screens/AuthScreen';
import EntitySetupScreen from './src/screens/EntitySetupScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/styles/theme';

function SplashScreen() {
  return (
    <SafeAreaView style={styles.splash}>
      <HearthOrb size={120} />
    </SafeAreaView>
  );
}

function Root() {
  const { user, isLoading: authLoading } = useAuth();
  // Gate on isInitializing (first load only), NOT isLoading. isLoading is true
  // during every background refresh too — keying the splash off it would unmount
  // the whole navigator whenever an in-tab screen calls refresh() (this was the
  // ProfileScreen-blank bug). isInitializing stays false through refreshes.
  const { entity, isInitializing: entityInitializing, revealEntity } =
    useEntity();
  const { isInitializing: cardsInitializing, needsOnboarding } = useCards();

  if (authLoading || entityInitializing) {
    return <SplashScreen />;
  }
  if (!user) {
    return <AuthScreen />;
  }
  // New front door (Decision 4): one login = one entity. Until the entity
  // exists — and through the one-time deus_id reveal (revealEntity) — entity
  // setup owns the screen. Returning logins (entity already present, nothing to
  // reveal) fall straight through.
  // NOTE: this is checked BEFORE the card splash so the deus_id reveal isn't
  // hidden by cards loading for the just-created entity in the background.
  if (entity === null || revealEntity !== null) {
    return <EntitySetupScreen />;
  }
  // Entity exists — wait for its cards to load before deciding onboarding.
  if (cardsInitializing) {
    return <SplashScreen />;
  }
  // Card-seeding helper (Phase 4 / Day 10). Replaces the legacy classify-business
  // onboarding. Latched at card-load time: runs only for a fresh entity with no
  // cards, and never again once it hands off (completeOnboarding) or once any
  // card exists on a later launch. See CardContext.needsOnboarding.
  if (needsOnboarding) {
    return <OnboardingScreen />;
  }
  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {/* EntityProvider and VendorProvider read useAuth() — keep nested
            inside AuthProvider. CardProvider reads useEntity() — keep nested
            inside EntityProvider. */}
        <AuthProvider>
          <EntityProvider>
            <VendorProvider>
              <CardProvider>
                <Root />
              </CardProvider>
            </VendorProvider>
          </EntityProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  splash: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
