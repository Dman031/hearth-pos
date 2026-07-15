import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../styles/theme';

// GalleryGrid — a wrapping grid of square thumbnails for a content card's
// gallery (Day 15). Used read-only on ProfileCard (tap → ImageViewer) and
// editable in CardEditorSheet (each thumb carries a × remove badge). Broken
// URLs degrade to a muted placeholder rather than a missing-image gap.

interface GalleryGridProps {
  urls: string[];
  // Tap a thumbnail (e.g. open the full viewer at this index).
  onPressImage?: (index: number) => void;
  // When provided, each thumbnail shows a remove (×) control → editable mode.
  onRemove?: (index: number) => void;
}

const THUMB = 92;

function Thumb({
  url,
  index,
  onPressImage,
  onRemove,
}: {
  url: string;
  index: number;
  onPressImage?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <View style={styles.thumbWrap}>
      <Pressable
        onPress={() => onPressImage?.(index)}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Gallery photo ${index + 1}`}
        style={({ pressed }) => [styles.thumb, pressed && styles.thumbPressed]}
      >
        {broken ? (
          <View style={styles.brokenThumb}>
            <Text style={styles.brokenMark}>!</Text>
          </View>
        ) : (
          <Image
            source={{ uri: url }}
            style={styles.thumbImage}
            resizeMode="cover"
            onError={() => setBroken(true)}
            accessibilityIgnoresInvertColors
          />
        )}
      </Pressable>

      {onRemove ? (
        <Pressable
          onPress={() => onRemove(index)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove gallery photo ${index + 1}`}
          style={styles.removeBadge}
        >
          <Text style={styles.removeMark}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function GalleryGrid({
  urls,
  onPressImage,
  onRemove,
}: GalleryGridProps) {
  if (urls.length === 0) {
    return null;
  }
  return (
    <View style={styles.grid}>
      {urls.map((url, index) => (
        <Thumb
          key={`${url}-${index}`}
          url={url}
          index={index}
          onPressImage={onPressImage}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  thumbWrap: {
    width: THUMB,
    height: THUMB,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: theme.borderRadius.card,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  thumbPressed: {
    opacity: 0.7,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  brokenThumb: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  brokenMark: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.bold,
  },
  removeBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMark: {
    color: theme.colors.danger,
    fontSize: 15,
    fontFamily: theme.fonts.bold,
    lineHeight: 18,
  },
});
