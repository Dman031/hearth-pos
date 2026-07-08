export const theme = {
  colors: {
    background: '#050505',
    surface: '#111111',
    textPrimary: '#F5F0E8',
    textSecondary: '#A5A99A',
    textMuted: '#7D8471',
    accent: '#D4A574',
    success: '#5DCAA5',
    danger: '#E24B4A',
    warning: '#EF9F27',
    // Glass tile recipe (docs/deus-prototype.html --glass / --hairline): a warm-
    // white lift over #050505 with a hairline edge. Consumed only via tileSurface.
    glass: 'rgba(245,240,232,0.04)',
    hairline: 'rgba(245,240,232,0.08)',
    // HearthOrb gradient palette — see docs/HARVESTONCE_ORB_RECIPE.md
    orb: {
      warmCore: '#fff8e2',
      goldMid: '#d2be91',
      deepGold: '#b89e61',
      sageEdge: '#7d8471',
      darkSage: '#595e51',
      glow: 'rgba(210, 190, 145, 0.05)',
    },
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
    displayLarge: { fontSize: 48, lineHeight: 56, fontWeight: '700' },
    displayMedium: { fontSize: 36, lineHeight: 44, fontWeight: '700' },
    h1: { fontSize: 28, lineHeight: 36, fontWeight: '700' },
    h2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
    body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
    bodyMuted: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  },
} as const;

export type Theme = typeof theme;

// The single glass-tile surface recipe, defined ONCE. Prototype .tile is a
// translucent lift + hairline border (blur intentionally dropped — no expo-blur).
// Radius stays 12 (theme card token), not the prototype's 16. Spread into a
// component's StyleSheet entry alongside its own layout props:
//   tile: { ...tileSurface, padding: theme.spacing.lg }
export const tileSurface = {
  backgroundColor: theme.colors.glass,
  borderWidth: 1,
  borderColor: theme.colors.hairline,
  borderRadius: theme.borderRadius.card,
} as const;
