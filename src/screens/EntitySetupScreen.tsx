import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import SignOutButton from '../components/SignOutButton';
import useAuth from '../hooks/useAuth';
import useEntity from '../hooks/useEntity';
import { theme } from '../styles/theme';

// The new front door (Decision 4): one login = one entity. This screen collects
// display_name + phone (email comes from the signup), creates the entity with a
// minted deus_id, then reveals that deus_id once. Root keeps it mounted through
// both phases via EntityContext.revealEntity.
export default function EntitySetupScreen() {
  const { user } = useAuth();
  const { revealEntity, createEntity, acknowledgeReveal } = useEntity();

  const email = user?.email ?? null;
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous double-tap gate (mirrors AuthScreen) — a second tap before the
  // disabled state renders would otherwise fire a second insert.
  const inFlight = useRef(false);

  const handleCreate = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      setError(null);
      if (!displayName.trim()) {
        setError('Enter your name or business name.');
        return;
      }
      if (!phone.trim()) {
        setError('Enter a phone number.');
        return;
      }
      setSubmitting(true);
      await createEntity({
        display_name: displayName.trim(),
        email,
        phone: phone.trim(),
      });
      // On success EntityContext sets revealEntity → this screen swaps to the
      // deus_id reveal below, and Root keeps us mounted until acknowledgeReveal().
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not finish setup. Please try again.',
      );
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  if (revealEntity) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.revealWrap}>
          <View style={styles.orbWrap}>
            <HearthOrb size={140} />
          </View>
          <Text style={styles.revealLabel}>This is you</Text>
          <Text style={styles.deusId}>{revealEntity.deus_id}</Text>
          <Text style={styles.revealHint}>
            Save it. It&apos;s your address on the network — how people and their
            assistants reach you.
          </Text>
          <Pressable style={styles.primaryButton} onPress={acknowledgeReveal}>
            <Text style={styles.primaryButtonLabel}>Continue</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <SignOutButton />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.orbWrap}>
            <HearthOrb size={120} />
          </View>

          <Text style={styles.heading}>Let&apos;s set up your profile</Text>
          <Text style={styles.subhead}>
            A few basics so people — and their assistants — can find and reach
            you.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Name or business name</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Blue Hour Coffee"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
            />

            {email ? (
              <>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.input, styles.inputReadonly]}>
                  <Text style={styles.readonlyText}>{email}</Text>
                </View>
              </>
            ) : null}

            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Phone number"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {/* TODO(SMS): phone is collected and stored UNVERIFIED. Wire Supabase
                phone OTP here later (send code → verify → auth.users.phone_confirmed_at);
                no entity column changes (Decision 1A / Decision 3). */}
            <Text style={styles.hint}>We&apos;ll verify your phone by text soon.</Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              style={styles.primaryButton}
              onPress={handleCreate}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={theme.colors.onAccent} />
              ) : (
                <Text style={styles.primaryButtonLabel}>Continue</Text>
              )}
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
    marginTop: 48,
  },
  heading: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
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
  label: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.input,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.body.fontSize,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  inputReadonly: {
    justifyContent: 'center',
  },
  readonlyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    marginTop: -theme.spacing.sm,
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
    marginTop: theme.spacing.sm,
  },
  primaryButtonLabel: {
    ...theme.typography.body,
    color: theme.colors.onAccent,
    fontFamily: theme.fonts.semiBold,
  },
  // Reveal phase
  revealWrap: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealLabel: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xl,
  },
  deusId: {
    ...theme.typography.displayLarge,
    color: theme.colors.accent,
    letterSpacing: 4,
    marginTop: theme.spacing.sm,
  },
  revealHint: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xxl,
  },
});
