import React from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../styles/theme';

// ImageViewer — full-screen, horizontally paged viewer for a card's gallery.
// Opened by tapping a thumbnail (GalleryGrid). Read-only: browse + close.
// The backdrop stays DARK (ink) even in the light Field world — a lightbox
// is the one surface where photos must sit on dark, not paper.

interface ImageViewerProps {
  urls: string[];
  // The image to open on; null = closed.
  index: number | null;
  onClose: () => void;
}

const { width: SCREEN_W } = Dimensions.get('window');

export default function ImageViewer({ urls, index, onClose }: ImageViewerProps) {
  const visible = index !== null;
  const initial = index ?? 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.headerBar}>
          <Text style={styles.counter}>
            {visible ? `${initial + 1} / ${urls.length}` : ''}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close image viewer"
          >
            <Text style={styles.close}>Done</Text>
          </Pressable>
        </View>

        <FlatList
          data={urls}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initial}
          getItemLayout={(_, i) => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          keyExtractor={(url, i) => `${url}-${i}`}
          renderItem={({ item }) => (
            <Pressable style={styles.page} onPress={onClose}>
              <Image
                source={{ uri: item }}
                style={styles.image}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.textPrimary, // ink — deliberate dark lightbox
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  counter: {
    ...theme.typography.bodyMuted,
    color: theme.colors.background, // paper-on-ink (viewer inverts the world)
  },
  close: {
    ...theme.typography.body,
    color: theme.colors.accent2, // raw wheat is contrast-safe on ink
    fontFamily: theme.fonts.semiBold,
  },
  page: {
    width: SCREEN_W,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SCREEN_W,
    height: '100%',
  },
});
