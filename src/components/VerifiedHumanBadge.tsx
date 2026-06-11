import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// VerifiedHumanBadge — the amber "verified human" chip shown in the Profile
// identity header when `entities.id_verified` is true.
//
// Design: matches the prototype's `.chip.verified` (docs/deus-prototype.html) —
// an amber pill, amber dot, uppercase label, on the amber-tinted surface.
//
// Honesty rule (CLAUDE.md awareness pattern): this renders the verified state
// ONLY. When the vendor is NOT verified, the component returns null — it never
// shows a plausible "verified-looking" placeholder. The unverified affordance
// ("Verify your identity") is a separate control owned by ProfileScreen, so an
// unverified vendor can never see a badge that implies a verdict they don't have.

interface VerifiedHumanBadgeProps {
  verified: boolean;
}

export default function VerifiedHumanBadge({
  verified,
}: VerifiedHumanBadgeProps) {
  if (!verified) {
    return null;
  }

  return (
    <View style={styles.chip} accessibilityRole="text">
      <View style={styles.dot} />
      <Text style={styles.label}>Verified human</Text>
    </View>
  );
}

// Amber chip values mirror the prototype: text/dot use the hearth accent,
// border/background are the accent at low alpha.
const ACCENT_BORDER = 'rgba(212,165,116,0.28)';
const ACCENT_FILL = 'rgba(212,165,116,0.07)';

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: ACCENT_BORDER,
    backgroundColor: ACCENT_FILL,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  label: {
    color: theme.colors.accent,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
