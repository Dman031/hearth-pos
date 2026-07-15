import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ActPerm, SeePerm } from '../types/card';
import { theme } from '../styles/theme';

// PermissionPill — DISPLAY-ONLY pill showing a card's current see/act tier
// (Profile part 1). Matches the prototype `.pill`: a colored dot + a mono-ish
// label, transparent fill, hairline border, fully-rounded. The editable
// permission control (tap to change tier, verification-lock) is Day 12.
//
// Colors map per tier to existing theme tokens:
//   off → muted · contacts → secondary · verified → accent · anyone → success

type Axis = 'see' | 'act';
type Perm = SeePerm | ActPerm;

// Field-palette tier colors: verified is WHEAT (the brand's highlight/
// verified accent — deep wheat, the text-safe variant) so it stays distinct
// from 'anyone' (success = moss-green, near-identical to the moss accent).
const TIER_COLOR: Record<Perm, string> = {
  off: theme.colors.textMuted,
  contacts: theme.colors.textSecondary,
  verified: theme.colors.accent2Deep,
  anyone: theme.colors.success,
};

interface PermissionPillProps {
  axis: Axis;
  perm: Perm;
}

export default function PermissionPill({ axis, perm }: PermissionPillProps) {
  const color = TIER_COLOR[perm] ?? theme.colors.textMuted;
  return (
    <View
      style={[styles.pill, { borderColor: hairlineFor(color) }]}
      accessibilityRole="text"
      accessibilityLabel={`${axis === 'see' ? 'Visible to' : 'Can act'}: ${perm}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>
        {axis.toUpperCase()} · {perm}
      </Text>
    </View>
  );
}

/** A soft border tint of the tier color (prototype uses ~0.4-alpha borders). */
function hairlineFor(color: string): string {
  return color === theme.colors.textMuted
    ? `${theme.colors.textMuted}59` // 0.35 alpha
    : `${color}66`; // ~0.4 alpha in 8-digit hex
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 12,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.pill,
  },
  label: {
    fontSize: 11,
    // Field-guide chip type: Hanken, UPPER, .18em tracking (~2px at 11px).
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: theme.fonts.semiBold,
  },
});
