import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
// Per-weight subpath imports — the package index re-exports all 36 weight
// files and metro would bundle every one of them (~1.3MB of unused fonts).
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk/600SemiBold';
import { HankenGrotesk_700Bold } from '@expo-google-fonts/hanken-grotesk/700Bold';
import { HankenGrotesk_700Bold_Italic } from '@expo-google-fonts/hanken-grotesk/700Bold_Italic';
import Crest from './src/components/Crest';
import { AuthProvider } from './src/context/AuthContext';
import { EntityProvider } from './src/context/EntityContext';
import { VendorProvider } from './src/context/VendorContext';
import { CardProvider } from './src/context/CardContext';
import useAuth from './src/hooks/useAuth';
import useEntity from './src/hooks/useEntity';
import useCards from './src/hooks/useCards';
import usePushTokenRegistration from './src/hooks/usePushTokenRegistration';
import AuthScreen from './src/screens/AuthScreen';
import EntitySetupScreen from './src/screens/EntitySetupScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabNavigator from './src/navigation/TabNavigator';
import { theme } from './src/styles/theme';

function SplashScreen() {
  return (
    <SafeAreaView style={styles.splash}>
      <Crest size={120} />
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
  // 16b push (Route B). Self-gated init effect — captures this device's Expo push
  // token once the authenticated entity has loaded and upserts it via the
  // upsert_device_token RPC. No-ops signed-out and pre-`eas init` (see the hook).
  usePushTokenRegistration();

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
  // Hanken Grotesk runs all in-product type (theme.fonts). Per rule B.1 the
  // fonts must be ready before any text renders — an unknown fontFamily falls
  // back to system silently — so the splash holds until loading resolves.
  // fontError is deliberately non-fatal: if loading fails we render with the
  // system fallback rather than blank the app, and log the error.
  const [fontsLoaded, fontError] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_700Bold_Italic,
  });
  if (fontError) {
    console.error('[fonts] Hanken Grotesk failed to load', fontError);
  }
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* Dark glyphs on the light Field paper (field-tokens.css footer note). */}
        <StatusBar style="dark" />
        {/* EntityProvider and VendorProvider read useAuth() — keep nested
            inside AuthProvider. CardProvider reads useEntity() — keep nested
            inside EntityProvider. */}
        {fontsLoaded || fontError ? (
          <AuthProvider>
            <EntityProvider>
              <VendorProvider>
                <CardProvider>
                  <Root />
                </CardProvider>
              </VendorProvider>
            </EntityProvider>
          </AuthProvider>
        ) : (
          <SplashScreen />
        )}
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
