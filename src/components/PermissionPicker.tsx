import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ActPerm, SeePerm } from '../types/card';
import {
  actTierRequiresOwnerVerification,
  seeTierRequiresOwnerVerification,
} from '../services/card-gating';
import { theme } from '../styles/theme';

// PermissionPicker — EDITABLE tier selector for ONE axis (see or act) in the
// card editor / add-card sheet. Renders the axis's tiers as selectable pills
// matching the display-only PermissionPill aesthetic. The 'verified' tier —
// "restrict to verified callers" — is LOCKED until the owner is verified:
// tapping it is a no-op and a hint explains why. 'anyone' (the network's
// baseline reach) is NEVER locked. The lock uses the NARROW card-gating
// predicate (=== 'verified'); see DEFERRED.md for the onboarding-vs-editor
// enforcement seam (this lock is UI-side, not in the shared write path).

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

const SEE_TIERS: readonly SeePerm[] = ['off', 'contacts', 'verified', 'anyone'];
const ACT_TIERS: readonly ActPerm[] = ['off', 'contacts', 'verified'];

interface PermissionPickerProps {
  axis: Axis;
  value: Perm;
  ownerVerified: boolean;
  onChange: (perm: Perm) => void;
}

export default function PermissionPicker({
  axis,
  value,
  ownerVerified,
  onChange,
}: PermissionPickerProps) {
  const tiers: readonly Perm[] = axis === 'see' ? SEE_TIERS : ACT_TIERS;
  const requiresVerification = (perm: Perm): boolean =>
    axis === 'see'
      ? seeTierRequiresOwnerVerification(perm as SeePerm)
      : actTierRequiresOwnerVerification(perm as ActPerm);
  const anyLocked = !ownerVerified && tiers.some(requiresVerification);

  return (
    <View style={styles.wrap}>
      <Text style={styles.axisLabel}>
        {axis === 'see' ? 'Who can SEE this' : 'Who can ACT on this'}
      </Text>
      <View style={styles.row}>
        {tiers.map((perm) => {
          const selected = perm === value;
          const locked = !ownerVerified && requiresVerification(perm);
          const color = TIER_COLOR[perm];
          return (
            <Pressable
              key={perm}
              onPress={() => {
                if (!locked) {
                  onChange(perm);
                }
              }}
              disabled={locked}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={
                `${axis === 'see' ? 'Visible to' : 'Can act'}: ${perm}` +
                (locked ? ' (locked — verify your identity)' : '')
              }
              style={[
                styles.pill,
                { borderColor: selected ? color : hairlineFor(color) },
                selected && { backgroundColor: `${color}1F` },
                locked && styles.pillLocked,
              ]}
            >
              <View style={[styles.dot, { backgroundColor: color }]} />
              <Text style={[styles.label, { color }]}>
                {perm}
                {locked ? ' 🔒' : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {anyLocked ? (
        <Text style={styles.lockHint}>
          Verify your identity to restrict to verified callers.
        </Text>
      ) : null}
    </View>
  );
}

/** A soft border tint of the tier color (matches PermissionPill). */
function hairlineFor(color: string): string {
  return color === theme.colors.textMuted
    ? `${theme.colors.textMuted}59` // 0.35 alpha
    : `${color}66`; // ~0.4 alpha in 8-digit hex
}

const styles = StyleSheet.create({
  wrap: {
    gap: theme.spacing.sm,
  },
  axisLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
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
  pillLocked: {
    opacity: 0.45,
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
  lockHint: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
});
