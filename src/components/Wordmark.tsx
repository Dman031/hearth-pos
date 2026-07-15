import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { APP_NAME } from '../constants/app';
import { LOCKUP_ASPECT_RATIO, LOCKUP_SVG } from '../constants/brand';

// Wordmark — the Teleoplexy lockup (crest + TELE⟡PLEXY) for the app shell.
// Rendered from the inlined brand SVG (src/constants/brand.ts); the visible
// brand string is baked into the vector, so the accessibility label routes
// through APP_NAME to keep the spoken name on the single source of truth.

const LOCKUP_HEIGHT = 26;

interface WordmarkProps {
  /** Optional container override (e.g. extra padding from a nav header). */
  style?: ViewStyle;
}

export default function Wordmark({ style }: WordmarkProps) {
  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="header"
      accessibilityLabel={APP_NAME}
    >
      <SvgXml
        xml={LOCKUP_SVG}
        height={LOCKUP_HEIGHT}
        width={LOCKUP_HEIGHT * LOCKUP_ASPECT_RATIO}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
