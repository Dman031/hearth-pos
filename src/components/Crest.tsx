import React from 'react';
import { SvgXml } from 'react-native-svg';
import { CREST_SVG } from '../constants/brand';

// Crest — the Teleoplexy sigil (moss tile + ring/dot signet): the app's ONE
// brand mark, shared with the app icon and the header lockup's left block.
// Replaced the Hearth-era HearthOrb everywhere (2026-07-15). Deliberately
// STATIC — no breathing animation this pass, by decision (safe to ship
// without pixel-testing); see docs/brand/README.md.

interface CrestProps {
  /** Rendered width/height in px (the source viewBox is square). */
  size?: number;
}

export default function Crest({ size = 120 }: CrestProps) {
  return <SvgXml xml={CREST_SVG} width={size} height={size} />;
}
