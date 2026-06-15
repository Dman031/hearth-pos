import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card } from '../types/card';
import { normalizeFields } from '../utils/card-fields';
import { theme } from '../styles/theme';
import PermissionPill from './PermissionPill';

// ProfileCard — one of the user's cards in the Profile list (part 1): title, its
// user-named fields, and the two DISPLAY permission pills (see / act). Tapping
// opens the editor sheet. Card flavor, editable perms, and delete are Day 12.

interface ProfileCardProps {
  card: Card;
  onPress: () => void;
}

export default function ProfileCard({ card, onPress }: ProfileCardProps) {
  const fields = useMemo(() => normalizeFields(card.fields), [card.fields]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit card: ${card.title}`}
    >
      <Text style={styles.title}>{card.title}</Text>

      {fields.length > 0 ? (
        <View style={styles.fields}>
          {fields.map((f, i) => (
            <View key={`${f.label}-${i}`} style={styles.fieldRow}>
              {f.label ? <Text style={styles.fieldLabel}>{f.label}</Text> : null}
              <Text style={styles.fieldValue}>{f.value || '—'}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noFields}>No details yet — tap to add some.</Text>
      )}

      <View style={styles.pills}>
        <PermissionPill axis="see" perm={card.see_perm} />
        <PermissionPill axis="act" perm={card.act_perm} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  cardPressed: {
    opacity: 0.7,
  },
  title: {
    ...theme.typography.h2,
    color: theme.colors.textPrimary,
  },
  fields: {
    gap: theme.spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  fieldLabel: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  fieldValue: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textSecondary,
    flexShrink: 1,
  },
  noFields: {
    ...theme.typography.bodyMuted,
    color: theme.colors.textMuted,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
});
