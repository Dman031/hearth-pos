import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import HearthOrb from './src/components/HearthOrb';
import useAuth from './src/hooks/useAuth';
import { supabase } from './src/services/supabase';
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
  const { user, isLoading } = useAuth();
  const [hasVendorProfile, setHasVendorProfile] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    if (!user) {
      setHasVendorProfile(null);
      return;
    }

    let mounted = true;
    supabase
      .from('vendor_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[Root] vendor_profiles lookup failed:', error);
        }
        if (!mounted) {
          return;
        }
        setHasVendorProfile(!!data);
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  if (isLoading || (user && hasVendorProfile === null)) {
    return <SplashScreen />;
  }
  if (!user) {
    return <AuthScreen />;
  }
  if (hasVendorProfile === false) {
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
        <Root />
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
