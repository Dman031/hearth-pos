// Teleoplexy "Field" palette (Direction III) — light-first, moss + wheat over
// olive paper. Canonical token source: docs/brand/field-tokens.css (vendored
// from the Teleoplexy brand handoff). Dark theme is deferred by brand decision
// ("a token flip, post-raise") — this app ships light-only, no switcher.
export const theme = {
  colors: {
    background: '#E8E6D2', // --paper · app background
    surface: '#FBFAF0', // --surface · raised card (near-white paper stock)
    surfaceInset: '#DED8C0', // --surface-2 · nested / inset / pressed
    textPrimary: '#1E2415', // --ink
    textSecondary: '#414A30', // --ink-2
    textMuted: '#73785C', // --soft
    accent: '#556327', // moss — primary action, links
    accentPress: '#414A22', // moss pressed
    accent2: '#BE9F49', // wheat — highlight / focus / verified
    onAccent: '#F2F0E2', // text on moss fills
    success: '#5C6B36', // --ok (success = moss)
    danger: '#A23B22', // clay-red
    warning: '#A8791F', // deep wheat
    hairline: 'rgba(33,38,24,0.16)', // --line
    // Accent tints, defined ONCE (previously triplicated as per-file
    // ACCENT_BORDER/ACCENT_FILL consts). Derived from moss rgb(85,99,39).
    accentBorder: 'rgba(85,99,39,0.28)',
    accentFill: 'rgba(85,99,39,0.07)',
    accentWash: 'rgba(85,99,39,0.12)',
    // Wheat tints — verified-tier chrome (VerifiedHumanBadge, verified pills).
    accent2Border: 'rgba(190,159,73,0.38)',
    accent2Fill: 'rgba(190,159,73,0.10)',
    // Deep wheat — the TEXT-safe wheat (raw #BE9F49 fails contrast on paper).
    // Same value as warning by design; distinct token for distinct semantics.
    accent2Deep: '#A8791F',
    // HearthOrb gradient palette — see docs/HARVESTONCE_ORB_RECIPE.md.
    // Deliberately NOT reskinned: orb keep-vs-crest is an open brand decision
    // (Derrick to confirm); the recipe is design-critical and stays untouched.
    orb: {
      warmCore: '#fff8e2',
      goldMid: '#d2be91',
      deepGold: '#b89e61',
      sageEdge: '#7d8471',
      darkSage: '#595e51',
      glow: 'rgba(210, 190, 145, 0.05)',
    },
  },
  // Hanken Grotesk runs ALL in-product type (brand decision: the bespoke Teleo
  // face lives only inside the logo SVGs, never as UI). Weights are distinct
  // family names — always set family via these tokens, never fontWeight, or
  // Android will fake-bold the wrong file.
  fonts: {
    regular: 'HankenGrotesk_400Regular',
    medium: 'HankenGrotesk_500Medium',
    semiBold: 'HankenGrotesk_600SemiBold',
    bold: 'HankenGrotesk_700Bold',
    // True italic file — Android does not synthesize italics for custom fonts.
    boldItalic: 'HankenGrotesk_700Bold_Italic',
  },
  borderRadius: {
    card: 12,
    input: 24,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  typography: {
    displayLarge: { fontSize: 48, lineHeight: 56, fontFamily: 'HankenGrotesk_700Bold' },
    displayMedium: { fontSize: 36, lineHeight: 44, fontFamily: 'HankenGrotesk_700Bold' },
    h1: { fontSize: 28, lineHeight: 36, fontFamily: 'HankenGrotesk_700Bold' },
    h2: { fontSize: 22, lineHeight: 28, fontFamily: 'HankenGrotesk_600SemiBold' },
    body: { fontSize: 16, lineHeight: 24, fontFamily: 'HankenGrotesk_400Regular' },
    bodyMuted: { fontSize: 14, lineHeight: 20, fontFamily: 'HankenGrotesk_400Regular' },
    caption: { fontSize: 12, lineHeight: 16, fontFamily: 'HankenGrotesk_400Regular' },
  },
} as const;

export type Theme = typeof theme;

// The single card-surface recipe, defined ONCE. Field cards are OPAQUE
// near-white paper lifted off --paper by a soft shadow + hairline (the
// field-tokens --e1 treatment) — the old dark-world translucent "glass"
// recipe does not survive a light background. Spread into a component's
// StyleSheet entry alongside its own layout props:
//   tile: { ...tileSurface, padding: theme.spacing.lg }
export const tileSurface = {
  backgroundColor: theme.colors.surface,
  borderWidth: 1,
  borderColor: theme.colors.hairline,
  borderRadius: theme.borderRadius.card,
  // --e1: 0 4px 16px -6px rgba(30,36,21,.14) — RN has no shadow spread, so the
  // -6px spread is approximated by a tighter radius.
  shadowColor: '#1E2415',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.14,
  shadowRadius: 10,
  elevation: 2,
} as const;
