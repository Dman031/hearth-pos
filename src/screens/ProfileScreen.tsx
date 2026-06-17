import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import useEntity from '../hooks/useEntity';
import useCards from '../hooks/useCards';
import VerifiedHumanBadge from '../components/VerifiedHumanBadge';
import ProfileCard from '../components/ProfileCard';
import CardEditorSheet from '../components/CardEditorSheet';
import { startIdentityVerification } from '../services/stripe';
import type { Card } from '../types/card';
import { theme } from '../styles/theme';

// ProfileScreen — the vendor's identity surface and the PERMANENT home of the
// Profile tab from docs/deus-prototype.html.
//
// Scope today (Step 3.2): identity HEADER only — display name, Deus ID,
// location placeholder, and the verification badges area. This is intentionally
// thin but on-spec so it grows in place rather than being thrown away:
//   • Day 9 / Step 4.1 replaces the whole tab bar with Profile/Incoming/
//     Contacts/Identity — this screen stays; only the navigator changes.
//   • Day 11-12 adds the CARD LIST and the DECLARE sheet below the header.
//     Their seams are marked with TODO comments at the bottom of the layout.
//
// The "verified human" badge renders here when entities.id_verified is true.
// When false, the same slot shows the just-in-time "Verify your identity"
// affordance that launches Stripe Identity hosted verification (Step 3.2's
// trigger). The verdict is flipped server-side by the stripe-identity-webhook
// Edge Function; we refresh the entity on focus so returning from the browser
// reflects the new state.

/** Human-readable copy for each failure reason from startIdentityVerification. */
const VERIFY_ERROR_COPY: Record<string, string> = {
  unauthenticated: 'Please sign in again to verify your identity.',
  session_create_failed:
    'We could not start verification right now. Please try again in a moment.',
  cannot_open_browser:
    'We could not open the verification page on this device.',
};

export default function ProfileScreen() {
  const { entity, refresh } = useEntity();
  const { cards, setFieldAvailability } = useCards();
  const [starting, setStarting] = useState(false);
  // The card open in the editor sheet (null = not editing). Day 12: rename,
  // fields, flavor, permissions + verification lock, and content media.
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  // True while the editor is open in create ("add a card") mode.
  const [creating, setCreating] = useState(false);

  // The sheet's mode, derived from the two pieces of open-state above.
  const editorMode: 'create' | 'edit' | null = creating
    ? 'create'
    : editingCard
      ? 'edit'
      : null;
  const closeEditor = useCallback(() => {
    setEditingCard(null);
    setCreating(false);
  }, []);

  // Returning from the hosted browser, the webhook may have already flipped
  // id_verified — re-read the entity each time the tab regains focus so the
  // badge state is current without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const handleVerify = useCallback(async () => {
    setStarting(true);
    try {
      const result = await startIdentityVerification();
      if (!result.ok) {
        Alert.alert(
          'Verification unavailable',
          VERIFY_ERROR_COPY[result.reason] ??
            'Something went wrong. Please try again.',
        );
      }
      // On success the system browser opens; the badge updates on next focus.
    } finally {
      setStarting(false);
    }
  }, []);

  const isVerified = entity?.id_verified ?? false;
  const displayName = entity?.display_name?.trim() || 'Your profile';
  const deusId = entity?.deus_id ?? null;

  return (
    // No top edge: the shell's wordmark header owns the top safe-area inset.
    <SafeAreaView style={styles.safe} edges={[]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity header (pheader in the prototype) */}
        <View style={styles.header}>
          <Text style={styles.name}>{displayName}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Deus ID</Text>
            <Text style={styles.deusId}>
              {deusId ?? '—'}
            </Text>
          </View>

          {/* Location placeholder — no location is collected yet. Renders an
              explicit "not set" state rather than a plausible fake city. */}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Location</Text>
            <Text style={styles.locationMuted}>Not set</Text>
          </View>

          {/* Verification badges area. Verified → amber badge. Not verified →
              the just-in-time verify affordance. */}
          <View style={styles.badgesArea}>
            {isVerified ? (
              <VerifiedHumanBadge verified />
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.verifyCta,
                  pressed && styles.verifyCtaPressed,
                  starting && styles.verifyCtaDisabled,
                ]}
                onPress={handleVerify}
                disabled={starting}
                accessibilityRole="button"
                accessibilityLabel="Verify your identity"
              >
                {starting ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.accent}
                  />
                ) : (
                  <Text style={styles.verifyCtaLabel}>Verify your identity</Text>
                )}
              </Pressable>
            )}
            {!isVerified && (
              <Text style={styles.verifyHint}>
                Confirm you're a real person with a government ID and a selfie.
                We store only the result — never your document.
              </Text>
            )}
          </View>
        </View>

        {/* Card list — the user's cards with their fields + SEE/ACT display
            pills. Tap a card to edit it; ⊕ adds a new one. */}
        <View style={styles.cardList}>
          <View style={styles.cardListHeader}>
            <Text style={styles.cardListLabel}>Your cards</Text>
            <Pressable
              onPress={() => setCreating(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Add a card"
              style={({ pressed }) => [
                styles.addCard,
                pressed && styles.addCardPressed,
              ]}
            >
              <Text style={styles.addCardLabel}>＋ Add</Text>
            </Pressable>
          </View>

          {cards.length > 0 ? (
            cards.map((card) => (
              <ProfileCard
                key={card.id}
                card={card}
                onPress={() => setEditingCard(card)}
                onToggleAvailability={(fieldIndex, next) =>
                  void setFieldAvailability(card.id, fieldIndex, next)
                }
              />
            ))
          ) : (
            <Text style={styles.cardsEmpty}>
              No cards yet. Add the first thing people can find you for.
            </Text>
          )}
        </View>

        {/* TODO(Day 12+): swipe-to-delete lands here. */}
      </ScrollView>

      <CardEditorSheet
        mode={editorMode}
        card={editingCard}
        onClose={closeEditor}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: theme.spacing.lg,
    paddingHorizontal: 22,
    paddingBottom: theme.spacing.xxl,
  },
  header: {
    gap: theme.spacing.md,
  },
  cardList: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  cardListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardListLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  addCard: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  addCardPressed: {
    opacity: 0.6,
  },
  addCardLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  cardsEmpty: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  name: {
    ...theme.typography.h1,
    color: theme.colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  deusId: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    letterSpacing: 1,
  },
  locationMuted: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  badgesArea: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  verifyCta: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyCtaPressed: {
    opacity: 0.6,
  },
  verifyCtaDisabled: {
    opacity: 0.6,
  },
  verifyCtaLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.accent,
    fontWeight: '600',
  },
  verifyHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
});
