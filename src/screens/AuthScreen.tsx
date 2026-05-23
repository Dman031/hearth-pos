import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import HearthOrb from '../components/HearthOrb';
import useAuth from '../hooks/useAuth';
import { theme } from '../styles/theme';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous gate. `submitting` state only disables the button on the next
  // render; a double-tap inside that gap would otherwise fire signUp/signIn
  // twice and trip Supabase's per-email cooldown.
  const inFlight = useRef(false);

  const isSignUp = mode === 'signup';

  const handleSubmit = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      setError(null);
      if (!email.trim() || !password.trim()) {
        setError('Enter both your email and a password.');
        return;
      }
      setSubmitting(true);
      const { error: authError } = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      if (authError) {
        setError(authError.message);
      }
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  const handleGoogle = async () => {
    const { error: providerError } = await signInWithGoogle();
    if (providerError) {
      Alert.alert('Continue with Google', providerError.message);
    }
  };

  const handleApple = async () => {
    const { error: providerError } = await signInWithApple();
    if (providerError) {
      Alert.alert('Continue with Apple', providerError.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.orbWrap}>
            <HearthOrb size={140} />
          </View>

          <Text style={styles.heading}>
            Welcome to <Text style={styles.headingAccent}>Hearth@POS</Text>
          </Text>
          <Text style={styles.subhead}>
            I&apos;ll send you customers. Free to download. You pay nothing
            until you&apos;ve made money through us.
          </Text>

          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              autoComplete="password"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={styles.primaryButton}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.background} />
              ) : (
                <Text style={styles.primaryButtonLabel}>
                  {isSignUp ? 'Sign up' : 'Sign in'}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.toggle}
              onPress={() => {
                setMode(isSignUp ? 'signin' : 'signup');
                setError(null);
              }}
            >
              <Text style={styles.toggleLabel}>
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : 'New here? Sign up'}
              </Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.outlinedButton} onPress={handleGoogle}>
              <Text style={styles.outlinedButtonLabel}>
                Continue with Google
              </Text>
            </Pressable>
            <Pressable style={styles.outlinedButton} onPress={handleApple}>
              <Text style={styles.outlinedButtonLabel}>
                Continue with Apple
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  orbWrap: {
    alignItems: 'center',
    marginTop: 60,
  },
  heading: {
    ...theme.typography.displayMedium,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
  },
  headingAccent: {
    color: theme.colors.accent,
  },
  subhead: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
  },
  form: {
    marginTop: theme.spacing.xxl,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.input,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.danger,
    marginBottom: theme.spacing.sm,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.input,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonLabel: {
    ...theme.typography.body,
    color: theme.colors.background,
    fontWeight: '600',
  },
  toggle: {
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  toggleLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.surface,
  },
  dividerLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginHorizontal: theme.spacing.md,
  },
  outlinedButton: {
    borderWidth: 1,
    borderColor: theme.colors.surface,
    borderRadius: theme.borderRadius.input,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  outlinedButtonLabel: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
});
