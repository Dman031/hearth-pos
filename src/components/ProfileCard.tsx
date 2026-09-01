import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Card } from '../types/card';
import {
  getGalleryUrls,
  getMediaUrl,
  isItemField,
  isReservedFieldLabel,
  normalizeFields,
} from '../utils/card-fields';
import { theme, tileSurface } from '../styles/theme';
import PermissionPill from './PermissionPill';
import GalleryGrid from './GalleryGrid';
import ImageViewer from './ImageViewer';

// ProfileCard — one of the user's cards in the Profile list: title, an optional
// media image, its user-named fields, and the two DISPLAY permission pills
// (see / act). Tapping the card opens the editor sheet — EXCEPT a practice
// card, which is read-only here (N-19: practice things are managed in PlexMed). Media (the reserved
// media_url field) can ride on ANY card kind — not just 'content' — so the
// image renders and the media_url entry is kept OUT of the text-field rows.
//
// Day 13 — fulfillable fields (those carrying a boolean `available`) render as
// one-tap "86" toggles: tap flips available true↔false WITHOUT opening the
// editor (a nested Pressable wins the touch). 86'd items grey out with an "out"
// tag. Describing fields (no `available`) render as plain rows, untappable.

interface ProfileCardProps {
  card: Card;
  /**
   * Opens the editor. OPTIONAL SINCE N-19: a practice card is read-only in the
   * Profile list — it is a card on the network and its owner sees it, but
   * editing lives in the PlexMed module. Absent → the row renders and does not
   * act, rather than acting on nothing (N-4).
   */
  onPress?: () => void;
  // Flip one item field's availability (the 86 toggle). `fieldIndex` is the
  // canonical index into normalizeFields(card.fields) — passed straight to
  // CardContext.setFieldAvailability. Absent → item rows render but don't toggle.
  onToggleAvailability?: (fieldIndex: number, next: boolean) => void;
}

export default function ProfileCard({
  card,
  onPress,
  onToggleAvailability,
}: ProfileCardProps) {
  // N-19 (2026-09-01) — THE PAUSED BANNER IS GONE, AND THE SLOT READ WITH IT.
  // P5 put a "your card is up, but paused" notice here pointing at Settings ›
  // PlexMed. Under N-19 the module screen says the same thing IN THE PLACE THAT
  // FIXES IT: state 3 is "Open times — nobody can book you until you post some"
  // with the button that posts them. A banner that points and a screen that acts
  // are the same fact told twice, and the pointing one was the scattered half.
  // The per-card useCardSlots read existed only to feed it; it is removed, so an
  // ordinary Profile list no longer issues a slots request per practice card.
  //
  const isPractice = card.kind === 'practice';

  // Canonical field list (media entry included so indices match the write
  // path); the media row is filtered out of the text rows below and rendered as
  // an image instead. Each kept row carries its canonical index for the toggle.
  const fields = useMemo(() => {
    const all = normalizeFields(card.fields);
    return all
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => !isReservedFieldLabel(entry.label));
  }, [card.fields]);
  const mediaUrl = useMemo(() => getMediaUrl(card.fields), [card.fields]);
  const galleryUrls = useMemo(() => getGalleryUrls(card.fields), [card.fields]);
  const [imageBroken, setImageBroken] = useState(false);
  // The gallery image open in the full viewer (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Re-arm the image when the URL changes (e.g. after an edit fixes a bad link).
  useEffect(() => {
    setImageBroken(false);
  }, [mediaUrl]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && onPress && styles.cardPressed]}
      onPress={onPress}
      // N-19: no onPress on a practice card, so it is not a button and does not
      // announce an edit it will not perform.
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Edit card: ${card.title}` : card.title}
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

      {/* Gallery thumbnails — tap one to browse full-screen. The thumbnail
          Pressables win the touch, so tapping a photo opens the viewer instead
          of the card editor (same nested-Pressable pattern as the 86 toggle). */}
      {galleryUrls.length > 0 ? (
        <GalleryGrid urls={galleryUrls} onPressImage={setViewerIndex} />
      ) : null}
      <ImageViewer
        urls={galleryUrls}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />

      {fields.length > 0 ? (
        <View style={styles.fields}>
          {fields.map(({ entry, index }) => {
            const item = isItemField(entry);
            const out = item && entry.available === false;

            // Describing field — plain, untappable row.
            if (!item) {
              return (
                <View key={`${entry.label}-${index}`} style={styles.fieldRow}>
                  {entry.label ? (
                    <Text style={styles.fieldLabel}>{entry.label}</Text>
                  ) : null}
                  <Text style={styles.fieldValue}>{entry.value || '—'}</Text>
                </View>
              );
            }

            // Item field — one-tap 86 toggle. Nested Pressable so the touch
            // does NOT bubble to the card's outer Pressable (no editor open).
            return (
              <Pressable
                key={`${entry.label}-${index}`}
                style={({ pressed }) => [
                  styles.itemRow,
                  pressed && styles.itemRowPressed,
                ]}
                onPress={() => onToggleAvailability?.(index, !entry.available)}
                accessibilityRole="button"
                accessibilityState={{ disabled: out }}
                accessibilityLabel={
                  out
                    ? `${entry.label || 'Item'} is sold out. Tap to restore.`
                    : `${entry.label || 'Item'} is available. Tap to mark sold out.`
                }
              >
                <View style={styles.itemTextRow}>
                  {entry.label ? (
                    <Text
                      style={[styles.fieldLabel, out && styles.outText]}
                    >
                      {entry.label}
                    </Text>
                  ) : null}
                  <Text style={[styles.fieldValue, out && styles.outText]}>
                    {entry.value || '—'}
                  </Text>
                </View>
                {out ? (
                  <View style={styles.outTag}>
                    <Text style={styles.outTagText}>out</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
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
    ...tileSurface,
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
  // WHEAT, NOT CLAY-RED. A paused card is not an error and its owner did
  // nothing wrong — this is the attention edge the decision slot uses, which is
  // the register for "this needs you", not for "this broke".
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  itemRowPressed: {
    opacity: 0.6,
  },
  itemTextRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  // 86'd item: text dims toward muted and strikes through so "unavailable"
  // reads at a glance, alongside the explicit "out" tag.
  outText: {
    color: theme.colors.textMuted,
    textDecorationLine: 'line-through',
  },
  outTag: {
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.pill,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  outTagText: {
    ...theme.typography.caption,
    color: theme.colors.danger,
    fontFamily: theme.fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
