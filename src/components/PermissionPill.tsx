import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
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

const TIER_COLOR: Record<Perm, string> = {
  off: theme.colors.textMuted,
  contacts: theme.colors.textSecondary,
  verified: theme.colors.accent,
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
    ? 'rgba(125,132,113,0.35)'
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
    letterSpacing: 0.5,
    fontWeight: '600',
    // Evoke the prototype's mono pill label without shipping a new font.
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
});
