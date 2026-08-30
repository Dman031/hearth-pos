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
import useCardSlots from '../hooks/useCardSlots';
import {
  PAUSED_HORIZON_DAYS,
  PAUSED_NO_TIMES_BODY,
  PAUSED_NO_TIMES_POINTER,
  PAUSED_STAMP_OFF_BODY,
  PAUSED_STAMP_OFF_POINTER,
  PAUSED_TITLE,
  type PracticePaused,
} from '../services/practice';

// ProfileCard — one of the user's cards in the Profile list: title, an optional
// media image, its user-named fields, and the two DISPLAY permission pills
// (see / act). Tapping the card opens the editor sheet. Media (the reserved
// media_url field) can ride on ANY card kind — not just 'content' — so the
// image renders and the media_url entry is kept OUT of the text-field rows.
//
// Day 13 — fulfillable fields (those carrying a boolean `available`) render as
// one-tap "86" toggles: tap flips available true↔false WITHOUT opening the
// editor (a nested Pressable wins the touch). 86'd items grey out with an "out"
// tag. Describing fields (no `available`) render as plain rows, untappable.

interface ProfileCardProps {
  card: Card;
  onPress: () => void;
  /**
   * Whether the owner holds a LIVE Verified Clinician stamp. Only meaningful on
   * a practice card, and DELIBERATELY TRI-STATE: `undefined` means the caller
   * has not told us, and no paused banner renders at all. A missing answer must
   * never become "paused" — that is the same rule the honesty chips follow.
   */
  licenceLive?: boolean;
  // Flip one item field's availability (the 86 toggle). `fieldIndex` is the
  // canonical index into normalizeFields(card.fields) — passed straight to
  // CardContext.setFieldAvailability. Absent → item rows render but don't toggle.
  onToggleAvailability?: (fieldIndex: number, next: boolean) => void;
}

export default function ProfileCard({
  card,
  onPress,
  licenceLive,
  onToggleAvailability,
}: ProfileCardProps) {
  // ─── P5, THE PAUSED BANNER ────────────────────────────────────────────────
  //
  // THE READ LIVES HERE, NOT ON THE SCREEN, and that is what makes it correct
  // for more than one practice card. Nothing in the schema limits an entity to
  // one (0038a adds the enum value and no uniqueness index), so a screen-level
  // read would have to loop — which React forbids — or quietly answer for the
  // first card only. One component, one card, one hook.
  //
  // A NON-PRACTICE CARD PASSES null AND COSTS NOTHING: useCardSlots returns
  // early on a null id without issuing a request. The hook is called
  // unconditionally because hooks must be, not because every card needs it.
  const isPractice = card.kind === 'practice';
  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: now,
      to: new Date(now.getTime() + PAUSED_HORIZON_DAYS * 24 * 60 * 60 * 1000),
    };
  }, []);
  const { slots, isLoading: slotsLoading, failed: slotsFailed } = useCardSlots(
    isPractice ? card.id : null,
    from,
    to,
  );

  // PAUSED MEANS NOBODY CAN ASK — never "nobody has an opening left". The
  // predicate is ZERO FUTURE SLOTS OF ANY STATE, so a clinician whose every
  // time is booked gets NO banner: they are the person doing best here, and a
  // paused notice on their card would be a false alarm on exactly the wrong
  // person. `from` is now, so times that have already passed do not count.
  //
  // A FAILED OR IN-FLIGHT READ RENDERS NOTHING. An empty board and an unknown
  // board must not look alike, and of the two possible mistakes, telling a
  // working clinician they are paused is the expensive one.
  const paused: PracticePaused | null = !isPractice
    ? null
    : licenceLive === false
      ? // Checked FIRST and needs no slot read: with the stamp off the times are
        // not shown whatever the board holds, so the other branch would name the
        // wrong cause even when it is also true.
        'stamp_off'
      : licenceLive === true && !slotsLoading && !slotsFailed && slots.length === 0
        ? 'no_times'
        : null;
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
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit card: ${card.title}`}
    >
      <Text style={styles.title}>{card.title}</Text>

      {/* P5. ABOVE the fields, because it is about whether this card WORKS —
          a person reading it has not got to the fields yet. Pointing rather
          than opening (N-8): the fix lives on another surface and this says
          where, it does not reach across and start it. */}
      {paused ? (
        <View style={styles.pausedBanner}>
          <Text style={styles.pausedTitle}>{PAUSED_TITLE}</Text>
          <Text style={styles.pausedBody}>
            {paused === 'stamp_off' ? PAUSED_STAMP_OFF_BODY : PAUSED_NO_TIMES_BODY}
          </Text>
          <Text style={styles.pausedPointer}>
            {paused === 'stamp_off' ? PAUSED_STAMP_OFF_POINTER : PAUSED_NO_TIMES_POINTER}
          </Text>
        </View>
      ) : null}

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
  // WHEAT, NOT CLAY-RED. A paused card is not an error and its owner did
  // nothing wrong — this is the attention edge the decision slot uses, which is
  // the register for "this needs you", not for "this broke".
  pausedBanner: {
    borderRadius: theme.borderRadius.card,
    borderWidth: 1,
    borderColor: theme.colors.accent2,
    backgroundColor: theme.colors.surfaceInset,
    padding: theme.spacing.md,
    gap: 2,
    marginBottom: theme.spacing.sm,
  },
  pausedTitle: {
    ...theme.typography.bodyMuted,
    fontFamily: theme.fonts.semiBold,
    color: theme.colors.textPrimary,
  },
  pausedBody: { ...theme.typography.caption, color: theme.colors.textSecondary },
  pausedPointer: { ...theme.typography.caption, color: theme.colors.accent },
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
