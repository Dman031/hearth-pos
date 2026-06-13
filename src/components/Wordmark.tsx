import React from 'react';
import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { APP_NAME } from '../constants/app';
import { theme } from '../styles/theme';

// Wordmark — the Deus brand mark for the app shell. "Carved" treatment: the
// serif wordmark sits slightly recessed into the dark-warm surface via a soft
// dark text-shadow (engraved look) rather than floating on top. Brand text
// routes through APP_NAME (single source of truth), never a hardcoded string,
// so the planned Deus→Flow rename stays a one-line change.
//
// Serif matches the AuthScreen brand treatment (Georgia on iOS, serif default).

const SERIF = Platform.select({ ios: 'Georgia', default: 'serif' });

interface WordmarkProps {
  /** Optional container override (e.g. extra padding from a nav header). */
  style?: ViewStyle;
}

export default function Wordmark({ style }: WordmarkProps) {
  return (
    <View style={[styles.container, style]} accessibilityRole="header">
      <Text style={styles.mark} allowFontScaling={false}>
        {APP_NAME}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    fontFamily: SERIF,
    fontSize: 22,
    color: theme.colors.textPrimary,
    letterSpacing: 3,
    // Carved/engraved: a dark shadow dropped just below the glyphs reads as the
    // text being pressed into the warm-dark surface.
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
