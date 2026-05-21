# BUGS_AND_SOLUTIONS — Hearth POS

*Last updated: 2026-05-18*

This file is the canonical bug ledger for hearth-pos. The archive starts empty and grows as bugs are confirmed and resolved.

## Protocol

For entry format, category taxonomy, Introduced-By taxonomy, cross-check rules, and the promotion rule, see `.claude/skills/bug-tracker/SKILL.md`.

The Bug Protocol in `CLAUDE.md` is always-on and gates every fix proposal through a grep of this file. Even when the archive is empty, the grep step is not optional — it just returns zero matches and you proceed.

## Recurrence Tracking

Patterns that have surfaced more than once. When the count reaches 3, the pattern is promoted to a hardcoded rule in `CLAUDE.md` under "Promoted Rules" (per the promotion rule in SKILL.md).

| Pattern | Count | Bug IDs | Status |
|---------|-------|---------|--------|
| — | — | — | — |

---

## Entries

## BUG-001: Bare-string Stripe config plugin crashes Expo start

**Status:** FIXED
**Date:** 2026-05-20
**Severity:** High
**Category:** deployment
**Introduced-by:** claude-prompt
**Related bugs:** none

### Symptoms

- `npx expo start` fails during config-plugin resolution; Metro never finishes booting.
- Error verbatim:
  ```
  Cannot read properties of undefined (reading 'merchantIdentifier')
  ```

### Root Cause

`app.json` registered `@stripe/stripe-react-native` as a bare string in the `plugins` array. The Stripe config plugin reads `props.merchantIdentifier`; with the bare-string form there is no props object, so `props` is `undefined` and the property access throws. The plugin requires the array form `["@stripe/stripe-react-native", { ... }]` to supply config.

### Solution

Replaced the bare string with the array form supplying a props object: `merchantIdentifier` (placeholder `merchant.com.hearth.pos`, real Apple Pay merchant ID lands Day 8 with Stripe Connect) and `enableGooglePay: false` (Android payments not configured today).

### Files Changed

- `app.json` — `plugins[2]` changed from bare string `"@stripe/stripe-react-native"` to `["@stripe/stripe-react-native", { "merchantIdentifier": "merchant.com.hearth.pos", "enableGooglePay": false }]`

### Commits

- `<this commit>` — fix: supply Stripe config-plugin props in app.json

### Verification

- `node -e "JSON.parse(...)"` on `app.json` → valid JSON, zero output.
- `npx expo start --ios --no-dev` → Metro Bundler started and reached "Opening exp://..." with no `merchantIdentifier` error. Run stopped only on an unrelated interactive Expo Go version prompt (expected in non-interactive mode; runtime simulator verification is out of scope).

### Cross-check Performed

- Other `app.json` plugin entries (`expo-router`, `expo-secure-store`): inspected — both are valid bare-string plugins that require no props; no issue, left unchanged.
- Other Stripe Connect Express flows (vendor onboarding account link/KYC, transaction charge, $50/mo paywall trigger, 1.5% fee, referral kickback): none implemented yet — no parallel config site exists. Flagged for re-check when those flows ship.
- No `app.config.js`/`app.config.ts` present — `app.json` is the single Expo config source.

### Prevention

When adding an Expo config plugin that requires options, always use the array form `["plugin-name", { ...options }]`. Grep for bare-string plugin entries that may need props:
`grep -n 'stripe-react-native' app.json`

### Prompt/Subagent Notes

Introduced by commit `eca5996` ("Align package versions to Expo SDK 55 + add Stripe config plugin"). The build prompt that added the Stripe plugin specified registering the plugin but did not specify the required props object, so the plugin was added in its incomplete bare-string form. Future prompts adding config plugins should state the full array-form entry including required options.
