import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card } from '../types/card';
import {
  getMediaUrl,
  normalizeFields,
  withoutMediaField,
} from '../utils/card-fields';
import { theme } from '../styles/theme';
import PermissionPill from './PermissionPill';

// ProfileCard — one of the user's cards in the Profile list: title, an optional
// media image, its user-named fields, and the two DISPLAY permission pills
// (see / act). Tapping opens the editor sheet. Media (the reserved media_url
// field) can ride on ANY card kind — not just 'content' — so the image renders
// and the media_url entry is kept OUT of the text-field rows for every card.

interface ProfileCardProps {
  card: Card;
  onPress: () => void;
}

export default function ProfileCard({ card, onPress }: ProfileCardProps) {
  // Text fields exclude the reserved media_url entry; media renders as an image.
  const fields = useMemo(
    () => withoutMediaField(normalizeFields(card.fields)),
    [card.fields],
  );
  const mediaUrl = useMemo(() => getMediaUrl(card.fields), [card.fields]);
  const [imageBroken, setImageBroken] = useState(false);
  // Re-arm the image when the URL changes (e.g. after an edit fixes a bad link).
  useEffect(() => {
    setImageBroken(false);
  }, [mediaUrl]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit card: ${card.title}`}
    >
      <Text style={styles.title}>{card.title}</Text>

      {mediaUrl && !imageBroken ? (
        <Image
          source={{ uri: mediaUrl }}
          style={styles.media}
          resizeMode="cover"
          onError={() => setImageBroken(true)}
          accessibilityIgnoresInvertColors
        />
      ) : null}

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
  media: {
    width: '100%',
    height: 160,
    borderRadius: theme.borderRadius.card,
    backgroundColor: theme.colors.background,
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
