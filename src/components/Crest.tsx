import React from 'react';
import { Image } from 'react-native';

// Crest — the app's HERO brand mark: the Teleoplexy face-orb (the watcher
// face in a circle, walking figure, dotted arc). Renders on every hero
// surface (splash, auth, entity setup, onboarding).
//
// Mark hierarchy (Derrick, 2026-07-15): face-orb = hero screens; the abstract
// ring/dot signet reads as a bullseye at size and lives ONLY at tiny scale
// (app icon, adaptive icons, favicon, the lockup's left block).
//
// The component keeps its original name and size contract so the six call
// sites never churn — only what it renders has changed (SVG signet → PNG).
// DEFERRED(brand-vector): PNG for now; vector/hi-res pass before Day 30.

const FACE_ORB = {
  // Ink linework — for paper (light) surfaces. Every current hero is paper.
  ink: require('../../assets/brand/face-orb-ink.png'),
  // Pale-wheat linework — for dark surfaces (none today; here for when one is).
  light: require('../../assets/brand/face-orb-light.png'),
} as const;

// Native art is 804×824 — explicit dimensions always (an <Image> without
// them renders the full 804px and blows out the screen).
const ASPECT = 824 / 804;

interface CrestProps {
  /** Rendered width in px; height follows the art's native aspect. */
  size?: number;
  variant?: keyof typeof FACE_ORB;
}

export default function Crest({ size = 120, variant = 'ink' }: CrestProps) {
  return (
    <Image
      source={FACE_ORB[variant]}
      style={{ width: size, height: Math.round(size * ASPECT) }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
