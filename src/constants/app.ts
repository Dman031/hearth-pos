// The single source of truth for the user-facing app name. NEVER hardcode the
// brand string per screen — route every vendor-facing mention through APP_NAME
// (including derived labels like "{APP_NAME} ID"). Renamed Deus → Teleoplexy
// with the 2026-07 Field reskin. User-facing strings ONLY: infrastructure
// names (hearth-* repos/URLs, package ids, Supabase refs, deus_id column,
// code identifiers) are not brand and never route through this constant.
// NOTE: the header lockup SVG (src/constants/brand.ts) bakes the wordmark
// into vector paths — a future rename must regenerate it, not just edit here.
export const APP_NAME = 'Teleoplexy';
