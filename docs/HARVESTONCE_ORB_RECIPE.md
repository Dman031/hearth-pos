# HarvestOnce Orb Recipe

Reference notes for `src/components/HearthOrb.tsx` — an SVG approximation of the
WebGL orb on harvestonce.com. This file is the canonical source for the orb
color tokens added under `theme.colors.orb`.

---

## INVESTIGATION REPORT

### Problem
`HearthOrb.tsx` uses a 4-layer single-amber-color SVG approach that does not
approximate the harvestonce.com WebGL orb; it should be rebuilt as a single
5-stop radial gradient (cream -> gold -> sage -> dark) with a separate
outer-glow circle and recipe-accurate breathing timings.

### Current State
- `src/components/HearthOrb.tsx` — 4 stacked `Circle`s, each a `RadialGradient`
  of `theme.colors.accent` (`#D4A574`) at descending opacity. Single breathing
  scale 1.0<->1.05, 2000ms period, `Easing.inOut(Easing.sin)`.
- `src/styles/theme.ts` — no `colors.orb` group exists; orb borrows
  `colors.accent`.
- `App.tsx` — renders `<HearthOrb size={200} />`.
- `docs/` did not exist; created with this file.
- Dependencies present: `react-native-reanimated@4.2.1`,
  `react-native-svg@15.15.3`. No new deps needed.
- `HearthOrb` is consumed only by `App.tsx`. Props contract (`size`,
  `listening`, `onPress`) preserved unchanged.
- Bug archive: zero matches for orb/reanimated/svg.

### Files Touched
| File | Change Type | Risk |
|------|-------------|------|
| docs/HARVESTONCE_ORB_RECIPE.md | create | low |
| src/styles/theme.ts | modify | low |
| src/components/HearthOrb.tsx | modify (full rewrite) | medium |
| App.tsx | modify (temporary test only, reverted before commit) | low |

### What This Change Does
1. Creates this recipe doc.
2. `theme.ts` — adds a `colors.orb` group with the 5-color palette + glow.
3. `HearthOrb.tsx` — full rewrite: single 5-stop radial gradient, separate
   outer-glow circle, recipe-accurate breathing timings, subtle `listening`
   brighten.

### What This Change Does NOT Do
- Does not introduce a real WebGL/GLView surface — SVG approximation only.
- Does not change the `HearthOrb` public props API.
- Does not edit CLAUDE.md (out of approved scope — see Side Effects).
- Does not change any other `theme.ts` token.
- Does not leave the temporary `App.tsx` test render in place.

### Potential Side Effects
- CLAUDE.md line 23 still describes the old 4-layer / 4s orb and canonical
  RGBA values. After this change that line is stale. CLAUDE.md is not in the
  approved touch list, so it is not edited here — flagged for a follow-up so
  the design doc matches the code.

---

## Color palette

Sampled / derived from the harvestonce.com orb. Five stops, center -> edge.

| Token      | Hex       | Role                                  |
|------------|-----------|---------------------------------------|
| `warmCore` | `#fff8e2` | Cream-white hot center                |
| `goldMid`  | `#d2be91` | Golden midtone                        |
| `deepGold` | `#b89e61` | Deeper amber/gold band                |
| `sageEdge` | `#7d8471` | Sage transition near the rim          |
| `darkSage` | `#595e51` | Dark sage fade-out at the outer edge  |
| `glow`     | `rgba(210, 190, 145, 0.05)` | Outer halo fill (= goldMid at 0.05) |

## Radial gradient stops

A single `RadialGradient` from center (offset 0) to edge (offset 1). Offsets
map to the smoothstep ranges in the original shader:

| Stop | Color      | Offset |
|------|------------|--------|
| 0    | `warmCore` | 0.0    |
| 1    | `goldMid`  | 0.35   |
| 2    | `deepGold` | 0.6    |
| 3    | `sageEdge` | 0.85   |
| 4    | `darkSage` | 1.0    |

## Outer glow

A second SVG circle rendered *behind* the main orb:
- radius = `1.22 x` the main orb radius
- fill = `goldMid` (`#d2be91`) at `0.05` opacity
- scale is static (no breathing on scale)
- opacity breathes between `0.02` and `0.06` over a `~5.24s` cycle
  (`2*pi / 1.2`)

## Breathing animation

Main orb:
- scale breathes `1.0 <-> 1.03` (subtle)
- period `7.85s` — one full cycle of `sin(t * 0.8)` is `2*pi / 0.8 ~= 7.854s`
- easing `Easing.inOut(Easing.sin)`

## listening = true

A subtle brighten, not a color change:
- `warmCore` stop opacity raised to `1.0`
- `goldMid` stop opacity nudged up slightly
- all other stops unchanged
