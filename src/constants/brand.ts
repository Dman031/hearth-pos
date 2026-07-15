// Teleoplexy brand marks, inlined as SVG XML for react-native-svg's SvgXml
// (no metro svg-transformer configured — do not import .svg files).
//
// Source of truth: docs/brand/assets/ (see docs/brand/README.md). The lockup
// wordmark is Teleo converted to paths — the Teleo face itself is never
// loaded as a UI font (brand decision). Colors are baked brand constants,
// not theme tokens: the mark is the one surface that does NOT re-theme.

/** Horizontal lockup — crest + TELE⟡PLEXY wordmark, ink on transparent,
 *  tuned for the paper background. Intrinsic viewBox 426×80. */
export const LOCKUP_ASPECT_RATIO = 426 / 80;

export const LOCKUP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="426" height="80" viewBox="0 0 426 80">
  <rect x="8" y="12" width="56" height="56" rx="15" fill="#556327"></rect>
  <g transform="translate(36,40) scale(.86)">
    <circle cx="0" cy="0" r="15" fill="none" stroke="#F2F0E2" stroke-width="2.4"></circle>
    <circle cx="0" cy="0" r="3.6" fill="#BE9F49"></circle>
    <circle cx="0" cy="-15" r="2.4" fill="#BE9F49"></circle>
  </g>
  <path d="M98.44 26L101.33 26L101.33 52L98.44 52M90.45 26L109.32 26L109.32 28.90L90.45 28.90M123.88 26L126.78 26L126.78 52L123.88 52M123.88 26L141.26 26L141.26 28.90L123.88 28.90M123.88 37.55L139.48 37.55L139.48 40.45L123.88 40.45M123.88 49.10L141.26 49.10L141.26 52L123.88 52M155.82 26L158.72 26L158.72 52L155.82 52M155.82 49.10L171.72 49.10L171.72 52L155.82 52M186.28 26L189.18 26L189.18 52L186.28 52M186.28 26L203.66 26L203.66 28.90L186.28 28.90M186.28 37.55L201.88 37.55L201.88 40.45L186.28 40.45M186.28 49.10L203.66 49.10L203.66 52L186.28 52M253.88 26L256.78 26L256.78 52L253.88 52M256.70 25.55C259.79 25.55 262.42 26.37 264.58 27.97C266.77 29.57 267.85 31.53 267.85 33.80C267.85 36.07 266.77 38.03 264.58 39.63C262.42 41.23 259.79 42.05 256.70 42.05C253.62 42.05 250.98 41.23 248.83 39.63C246.64 38.03 245.56 36.07 245.56 33.80C245.56 31.53 246.64 29.57 248.83 27.97C250.98 26.37 253.62 25.55 256.70 25.55M256.70 28.45C254.44 28.45 252.47 28.97 250.87 30.01C249.27 31.05 248.46 32.31 248.46 33.80C248.46 35.29 249.27 36.55 250.87 37.59C252.47 38.63 254.44 39.15 256.70 39.15C258.97 39.15 260.94 38.63 262.53 37.59C264.13 36.55 264.95 35.29 264.95 33.80C264.95 32.31 264.13 31.05 262.53 30.01C260.94 28.97 258.97 28.45 256.70 28.45M289.54 26L292.43 26L292.43 52L289.54 52M289.54 49.10L305.43 49.10L305.43 52L289.54 52M319.99 26L322.89 26L322.89 52L319.99 52M319.99 26L337.38 26L337.38 28.90L319.99 28.90M319.99 37.55L335.59 37.55L335.59 40.45L319.99 40.45M319.99 49.10L337.38 49.10L337.38 52L319.99 52M351.94 52L354.83 52L374.52 26L371.62 26M371.62 52L374.52 52L354.83 26L351.94 26M389.08 26L391.98 26L401.45 39.74L398.55 39.74M408.02 26L410.92 26L401.45 39.74L398.55 39.74M398.55 36.85L401.45 36.85L401.45 52L398.55 52" fill="#1E2415"></path>
  <circle cx="228.77" cy="39.00" r="8.98" fill="none" stroke="#1E2415" stroke-width="0.83"></circle>
  <circle cx="228.77" cy="39.00" r="2.30" fill="#1E2415"></circle>
</svg>`;

/** Standalone crest tile (moss square + signet) — avatars, splash, future
 *  app-icon source. Intrinsic viewBox 96×96. */
export const CREST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect x="2" y="2" width="92" height="92" rx="24" fill="#556327"></rect>
  <g transform="translate(48,48)">
    <circle cx="0" cy="0" r="15" fill="none" stroke="#F2F0E2" stroke-width="2.4"></circle>
    <circle cx="0" cy="0" r="3.6" fill="#BE9F49"></circle>
    <circle cx="0" cy="-15" r="2.4" fill="#BE9F49"></circle>
  </g>
</svg>`;
