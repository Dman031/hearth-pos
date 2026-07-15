# Teleoplexy brand — Field (Direction III)

Vendored from the Teleoplexy brand handoff (Claude Design export, 2026-07-14).
`field-tokens.css` is the canonical token source; `src/styles/theme.ts` is its
React Native translation and MUST stay in sync with it.

## Decisions baked in (from the handoff + Derrick, 2026-07-14)

- **Field is THE product surface.** Stone/Ember palettes are marketing only.
- **Light-first, light-only.** Dark is a deferred token flip — no switcher ships.
- **Hanken Grotesk runs all in-product type.** The bespoke Teleo face lives only
  inside the logo SVGs (converted to paths) and is never loaded as a UI font.
- **The app is named Teleoplexy** — user-facing strings only. Infrastructure
  ("hearth-*" repos, worker URLs, package names, Supabase refs, edge function
  names, code identifiers like `HearthOrb`) is NOT brand and keeps its names.

## Assets

- `assets/lockup-teleoplexy-paper.svg` — the in-app header lockup (crest +
  TELE⟡PLEXY wordmark, signet in place of the O). **Generated, not from the
  handoff**: the handoff's `lockup-*.svg` wordmarks read "Connect" (the
  prototype product name), so this file was built from `Teleo.otf` per the
  brand book's lockup spec (Teleo 400 caps, .26em tracking, ink on paper).
  Inlined as `LOCKUP_SVG` in `src/constants/brand.ts` — regenerate with a
  font-to-path pass over Teleo.otf if the mark changes.
- `assets/crest-{paper,dark}.svg` — standalone crest tile (moss square + signet).
- `assets/lockup-{paper,dark}.svg` — handoff originals ("Connect" wordmark),
  kept for geometry reference only. Do not ship.
- `assets/Teleo.otf` — brand face, kept ONLY for regenerating logo paths.
  Never bundle into the app.

## Known open decision

- HearthOrb (breathing gold orb): keep as-is vs replace with the Teleoplexy
  crest — Derrick to confirm. Until then the orb and its recipe
  (`docs/HARVESTONCE_ORB_RECIPE.md`, `theme.colors.orb`) are untouched.
