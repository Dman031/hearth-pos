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
import { APP_NAME } from '../constants/app';
import useAuth from '../hooks/useAuth';
import { theme } from '../styles/theme';

type AuthView = 'welcome' | 'form';
type Mode = 'signin' | 'signup';

// The cold-open's display heading and the "find and reach you" accent come
// straight from docs/deus-prototype.html (Onboarding step 0). The app loads no
// custom fonts yet, so the serif display falls back to Georgia/serif — the same
// face the prototype's own thumbnail uses for the wordmark.
const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

export default function AuthScreen() {
  const { signIn, signUp, signInWithGoogle, signInWithApple } = useAuth();
  const [view, setView] = useState<AuthView>('welcome');
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set when signup hits an existing email. Carries its own "switch to sign in"
  // affordance rather than dumping Supabase's raw message into the error line.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous gate. `submitting` state only disables the button on the next
  // render; a double-tap inside that gap would otherwise fire signUp/signIn
  // twice and trip Supabase's per-email cooldown.
  const inFlight = useRef(false);

  const isSignUp = mode === 'signup';

  const enterForm = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setAlreadyRegistered(false);
    setView('form');
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError(null);
    setAlreadyRegistered(false);
  };

  const handleSubmit = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      setError(null);
      setAlreadyRegistered(false);
      if (!email.trim() || !password.trim()) {
        setError('Enter both your email and a password.');
        return;
      }
      setSubmitting(true);
      const { error: authError } = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);
      if (authError) {
        // Existing-email signup is an expected branch, not a failure to show
        // raw. Offer to switch to sign-in instead.
        if (isSignUp && /already registered/i.test(authError.message)) {
          setAlreadyRegistered(true);
        } else {
          setError(authError.message);
        }
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
          <View style={styles.orbZone}>
            <HearthOrb size={104} />
          </View>

          {view === 'welcome' ? (
            <View style={styles.content}>
              <Text style={styles.eyebrow}>{APP_NAME}</Text>
              <Text style={styles.display}>
                Welcome.{'\n'}AI that helps people{' '}
                <Text style={styles.displayAccent}>find and reach you</Text> —
                free, on your terms.
              </Text>
              <Text style={styles.lead}>
                Free to join. You only pay when you earn money through us. Takes
                about a minute to set up.
              </Text>

              <View style={styles.actions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => enterForm('signup')}
                >
                  <Text style={styles.primaryButtonLabel}>Let&apos;s begin</Text>
                </Pressable>
                <Pressable
                  style={styles.ghostButton}
                  onPress={() => enterForm('signin')}
                >
                  <Text style={styles.ghostButtonLabel}>
                    I already have an account
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.display}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </Text>
              <Text style={styles.lead}>
                {isSignUp
                  ? `Join ${APP_NAME} with an email and password.`
                  : `Sign back in to ${APP_NAME}.`}
              </Text>

              <View style={styles.form}>
                <View style={styles.fieldShell}>
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
                </View>
                <View style={styles.fieldShell}>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry
                    autoComplete="password"
                  />
                </View>

                {alreadyRegistered ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeText}>
                      Looks like you already have an account with that email.
                    </Text>
                    <Pressable onPress={() => switchMode('signin')}>
                      <Text style={styles.noticeAction}>Switch to sign in</Text>
                    </Pressable>
                  </View>
                ) : null}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <Pressable
                  style={styles.primaryButton}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={theme.colors.onAccent} />
                  ) : (
                    <Text style={styles.primaryButtonLabel}>
                      {isSignUp ? 'Create account' : 'Sign in'}
                    </Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.toggle}
                  onPress={() => switchMode(isSignUp ? 'signin' : 'signup')}
                >
                  <Text style={styles.toggleLabel}>
                    {isSignUp
                      ? 'Already have an account? Sign in'
                      : 'New here? Create an account'}
                  </Text>
                </Pressable>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerLabel}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <Pressable style={styles.ghostButton} onPress={handleGoogle}>
                  <Text style={styles.ghostButtonLabel}>
                    Continue with Google
                  </Text>
                </Pressable>
                <Pressable style={styles.ghostButton} onPress={handleApple}>
                  <Text style={styles.ghostButtonLabel}>
                    Continue with Apple
                  </Text>
                </Pressable>

                <Pressable
                  style={styles.toggle}
                  onPress={() => setView('welcome')}
                >
                  <Text style={styles.backLabel}>Back</Text>
                </Pressable>
              </View>
            </View>
          )}
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
  orbZone: {
    alignItems: 'center',
    marginTop: 48,
    marginBottom: theme.spacing.xl,
  },
  content: {
    gap: theme.spacing.lg,
  },
  eyebrow: {
    color: theme.colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  display: {
    fontFamily: SERIF,
    fontSize: 34,
    lineHeight: 40,
    color: theme.colors.textPrimary,
  },
  displayAccent: {
    fontFamily: SERIF,
    fontStyle: 'italic',
    color: theme.colors.accent,
  },
  lead: {
    fontSize: 16.5,
    lineHeight: 25,
    color: theme.colors.textSecondary,
  },
  actions: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  form: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  fieldShell: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  input: {
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    padding: 0,
  },
  notice: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.accentBorder,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  noticeText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
  noticeAction: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  errorText: {
    ...theme.typography.bodyMuted,
    color: theme.colors.danger,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onAccent,
  },
  ghostButton: {
    borderWidth: 1,
    borderColor: theme.colors.hairline,
    borderRadius: theme.borderRadius.pill,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ghostButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  toggle: {
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  toggleLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
  },
  backLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.hairline,
  },
  dividerLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
    marginHorizontal: theme.spacing.md,
  },
});
