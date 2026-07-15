import React from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';
import { APP_NAME } from '../constants/app';

// Wordmark — the Teleoplexy horizontal lockup (face-orb + TELE⟡PLEXY +
// tagline) for the shared shell header. The visible brand string is baked
// into the art, so the accessibility label routes through APP_NAME.
//
// Asset note: assets/brand/lockup-horizontal.png is the source of record but
// carries an opaque dark background with heavy internal padding; the header
// renders lockup-horizontal-header.png — the same art content-trimmed (sharp
// .trim + even margins, background-matched) so the wordmark stays legible at
// header scale. It reads as a dark brand plaque on the paper header bar.
// DEFERRED(brand-vector): replace with a transparent vector lockup pre-Day 30.

const LOCKUP = require('../../assets/brand/lockup-horizontal-header.png');
// Trimmed art is 680×187 — explicit dimensions always.
const ASPECT = 680 / 187;
const HEADER_HEIGHT = 36;

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
      <Image
        source={LOCKUP}
        style={styles.lockup}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    width: Math.round(HEADER_HEIGHT * ASPECT),
    height: HEADER_HEIGHT,
    borderRadius: 8, // the opaque plaque gets soft corners on the paper bar
  },
});
