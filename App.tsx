import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import HearthOrb from './src/components/HearthOrb';
import { AuthProvider } from './src/context/AuthContext';
import { VendorProvider } from './src/context/VendorContext';
import useAuth from './src/hooks/useAuth';
import useVendor from './src/hooks/useVendor';
import AuthScreen from './src/screens/AuthScreen';
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
  const { vendor, isLoading: vendorLoading } = useVendor();

  if (authLoading || vendorLoading) {
    return <SplashScreen />;
  }
  if (!user) {
    return <AuthScreen />;
  }
  // No vendor row yet, or a row that hasn't picked a business type — both mean
  // onboarding is unfinished.
  if (vendor === null || vendor.template_id === null) {
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
        {/* VendorProvider reads useAuth() — keep nested inside AuthProvider. */}
        <AuthProvider>
          <VendorProvider>
            <Root />
          </VendorProvider>
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
