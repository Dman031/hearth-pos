# BUGS_AND_SOLUTIONS — Hearth POS

*Last updated: 2026-05-26*

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

---

## BUG-002: Split useAuth/useVendor state — onboarding cannot complete in one session

**Status:** FIXED
**Date:** 2026-05-26
**Severity:** High
**Category:** state-management / react-context
**Introduced-by:** claude-prompt
**Related bugs:** none

### Symptoms

- Vendor signs in, completes onboarding (submits description, confirms classification), and the app continues to render `<OnboardingScreen />` instead of advancing to `<TabNavigator />`.
- Only a full sign-out → sign-back-in cycle moves the vendor onto the tabs.
- No error logged; the post-onboarding `setVendor(...)` call appears to succeed but Root never observes the change.

### Root Cause

`useAuth` and `useVendor` were authored as hooks that own their own state. Every call site (`Root`, `OnboardingScreen`, `HomeScreen`, `AuthScreen`, plus `useVendor`'s internal `useAuth()` call) instantiated a separate copy of the state:

- Five independent `supabase.auth.onAuthStateChange` subscriptions.
- Two independent `vendor` rows held in React state — one in `Root` (deciding whether to render `<OnboardingScreen />`), one in `OnboardingScreen` (mutated by `createVendor`).

When `createVendor` resolved, it called `setVendor(created)` on the *OnboardingScreen instance only*. Root's `vendor` remained `null`, so the routing condition at [App.tsx:35](App.tsx#L35) (`vendor === null || vendor.template_id === null`) kept rendering `<OnboardingScreen />`. The sign-out round trip "fixed" it because remounting `Root` re-ran its `useVendor()`, which then ran `loadVendor(user.id)` and finally read the row OnboardingScreen had written to the DB.

### Solution

Lifted both hooks into Context providers. `<AuthProvider>` and `<VendorProvider>` each own the state once; `useAuth` and `useVendor` become thin readers (`useContext(AuthContext)` / `useContext(VendorContext)`) that every call site shares. `setVendor(created)` inside `createVendor` now propagates to every consumer via context, so Root observes the row immediately and advances to the tabs.

Provider order matters: `<VendorProvider>` calls `useAuthContext()` for `user`/`authLoading`, so it must be wrapped inside `<AuthProvider>`. A one-line comment on the provider declaration in `App.tsx` documents this constraint.

### Files Changed

- `src/context/AuthContext.tsx` — new file. `<AuthProvider>` owns `user`/`session`/`isLoading` + auth methods; `useAuthContext()` is the reader. Single `onAuthStateChange` subscription app-wide.
- `src/context/VendorContext.tsx` — new file. `<VendorProvider>` owns `vendor`/`isLoading`/`error` + `createVendor`/`refresh`. Reads `useAuthContext()` for `user`/`authLoading`. State-owning logic moved verbatim from the old `useVendor`.
- `src/hooks/useAuth.ts` — collapsed from a state-owning hook to a thin context re-export. Signature unchanged at every call site.
- `src/hooks/useVendor.ts` — same shape collapse.
- `App.tsx` — imports `{ AuthProvider }`, `{ VendorProvider }`; wraps `<Root />` in `<AuthProvider><VendorProvider>...</VendorProvider></AuthProvider>` with an inline comment on ordering.

### Commits

- `8bb8830` — refactor: lift useAuth and useVendor into Context providers
- `<this commit>` — feat: no-WIMP conversational onboarding (A+B+C) + BUG-002 ledger entry

### Verification

- `npx tsc --noEmit` clean after the Context lift.
- `npx tsc --noEmit` clean after the A+B+C redesign.
- Manual flow planned (sign in → submit description → narration → save → tabs without sign-out round trip) executed by Derrick on the day3-no-wimp-onboarding branch before merge.

### Cross-check Performed

- All five `useAuth`/`useVendor` call sites (`Root` in `App.tsx`, `OnboardingScreen`, `HomeScreen`, `AuthScreen`, plus the now-removed internal `useAuth()` in the old `useVendor`) verified to compile and behave identically against the new context readers — signatures unchanged.
- No other shared-state hook patterns exist in `src/hooks/` today (`useTemplate`, `useJobs`, `useTasks`, `useTickets`, `useEarnings`, `useReferrals` are read-only per-screen utilities — none mutate state that another screen reads). Flagged for the same lift if they grow cross-screen writes.
- No Stripe Connect, paywall, or transaction flows exist yet — no adjacent state-management paths to fix. The same lift pattern applies when those ship.
- No tests exist for these hooks today; testing infra ships separately.

### Prevention

When a hook owns local state and that state must be observed by sibling components after a write, lift to a Context provider. A hook of the form `useX(): { x, setX }` invoked from multiple components is a structural bug; each call site gets its own `x`. Grep for the pattern when adding new shared-state hooks:

`grep -rn "useState\|useReducer" src/hooks/`

Any hook whose return value includes a setter or a mutator (`create*`, `update*`, `refresh`, `setX`) that callers expect to broadcast across screens MUST live in a Context provider, not in a hook that owns the state directly.

### Prompt/Subagent Notes

The original Day 1 / Day 2 build prompts asked for `useAuth` and `useVendor` as hooks without specifying that the state had to be shared across call sites — the implicit assumption ("if Root reads vendor, OnboardingScreen's createVendor will update it") was an unstated invariant. Future prompts that introduce shared-state hooks should state explicitly: "must be a Context provider; every call site reads the same instance." Particularly relevant for Day 3 onboarding because Pattern B's deferred write makes the round-trip even more sensitive — if Root doesn't see the post-finalize vendor row, the vendor lands back on OnboardingScreen with no way out.

---

## BUG-003: Yes/No confirmation button after classification (no-WIMP violation)

**Status:** FIXED (architectural)
**Date:** 2026-05-26
**Severity:** Medium (UX / design-principle)
**Category:** ui-architecture / wimp-violation
**Introduced-by:** claude-prompt
**Related bugs:** BUG-002 (Pattern B's deferred write depends on the Context lift)

### Symptoms

- Day 2 onboarding presented a "Yes, that's right" / "Not quite" button pair after the classifier's narration, plus a low-confidence pick-list (per-template buttons + "None of these fit"). Mismatch with the no-WIMP principle that governs Hearth@Home: a button may carry input or navigation, but never a decision.
- Higher concrete risk than the same issue in @Home: a wrong template here reconfigures the entire app (plumber sees café tools), not just a wrong note.
- Compounding architectural bug: `createVendor` was called at confirmation time, so a wrong tap committed the wrong template to the DB immediately, with no recovery path short of sign-out + re-onboard.

### Root Cause

Onboarding was modeled as a multi-state machine with WIMP-style confirm/select gates. The classifier result was treated as an *assertion the vendor had to ratify*, instead of an *assumption Hearth narrates that the vendor can override in prose*. This shape inherently produces decision-buttons.

### Solution

Rebuilt the onboarding flow per the approved A+B+C spec:

- **Pattern A — assume-and-narrate.** High-confidence classifier output is presented as a two-line bubble: a prominent `▸ NAME` line followed by a soft "if I read that wrong, just tell me" invitation. No yes/no buttons. The vendor's next message is either a correction or an answer to the next question.
- **Pattern B — deferred write (mandatory, ships WITH A).** `createVendor` no longer runs at narration. The chosen template id is held in `pendingTemplateId` local state, and the row is written only at the end of the question loop via `runFinalize`. A "Save and continue" navigation action triggers the write. Pattern A without Pattern B is explicitly rejected by the spec because a button-less confirm + immediate write is *more* dangerous, not less.
- **Cheap correction-router.** The classifier is re-run *only* on the message immediately after narration, and only if that message matches one of a small set of correction cues at the start (`no`, `not quite`, `actually`, `wrong`, ...). Later messages are treated as question-loop answers. No classifier-on-every-turn.
- **Pattern C — two-pass low-confidence fallback.** Confidence < 0.7 (but > 0) prompts one prose reclarify ("tell me more about a typical job"); the pick-list appears only on the second classification failure or on a hard `confidence === 0` (failed read). The pick-list is marked as a documented exception in the code with an explicit comment block at `enterManualSelectionException` explaining why this is the one place the no-WIMP rule bends.
- **Structural guard at the component layer.** `ConversationBubble`'s `buttons` prop was renamed to `actions` and each entry now requires a `kind: 'input' | 'navigation'` tag (no `'decision'` kind exists). A runtime guard refuses to render a 2-action stack where neither action is `'navigation'` — the structural shape of a yes/no decision pair. Fails loud (`console.warn`) and drops the trailing action. Also added a bubble-level `tone?: 'danger'` for the save-error path.

### Files Changed

- `src/components/ConversationBubble.tsx` — `buttons` → `actions`; new `ConversationAction.kind` discriminator (`'input' | 'navigation'`); new `tone?: 'default' | 'danger'` at both action and bubble levels; new `guardActions()` runtime check that warns + drops on a yes/no-shaped 2-action stack; `danger` styling.
- `src/screens/OnboardingScreen.tsx` — phase machine rewritten: removed `awaiting_confirmation`, `confirming_category`; added `narrating`, `reclarifying`, `awaiting_clarification`, `question_loop`, `manual_selection_exception`, `finalizing`. `createVendor` lifted out of `enterConfirmed` (deleted) into `runFinalize` (new). New `looksLikeCorrection()` heuristic + `correctionWindowOpen` ref guarding the single-message correction-router. New `reclarifyAttempted` ref gating Pattern C's pick-list to the second failure. `enterManualSelectionException` carries a multi-line code comment marking the pick-list as the documented exception. All ConversationBubble button entries now use the new `actions` API with `kind` tags.

### Commits

- `8bb8830` — refactor: lift useAuth and useVendor into Context providers (BUG-002 fix; prerequisite)
- `<this commit>` — feat: no-WIMP conversational onboarding (A+B+C) + BUG-002/BUG-003 ledger

### Verification

- `npx tsc --noEmit` clean (exit 0, no output).
- Decision-buttons #3, #4, #5, #6 (per the audit table in the original Step 2 report) no longer exist in the rendered tree under any phase except the documented Pattern C exception.
- `ConversationBubble` guard tested via type system: the `actions` prop signature with `kind: 'input' | 'navigation'` makes a `decision`-kind action structurally absent. Runtime fallback covers the case where someone constructs a 2-action stack with two `'input'` entries.
- Pattern B guard: `runFinalize` is the only call site for `createVendor`. Verified via grep:
  ```
  grep -n "createVendor" src/screens/OnboardingScreen.tsx
  ```
- Manual flow (vendor types description → high-conf narration → reply continues to question loop → "Save and continue" writes vendor row → Root advances to tabs) planned by Derrick on the day3-no-wimp-onboarding branch before merge.

### Cross-check Performed

- `ConversationBubble` is consumed only by `OnboardingScreen`. Grep:
  ```
  grep -rn "ConversationBubble" src --include="*.tsx" --include="*.ts"
  ```
  No other consumer needs to migrate from `buttons` to `actions`.
- Hearth@Home reference implementation (`hearth-at-home/app/onboarding.tsx`, `hearth-at-home/src/services/onboarding-conversation.ts`, `hearth-at-home/src/components/MessageBubble.tsx`) confirmed to use the same assume-and-advance pattern with zero decision buttons — POS now mirrors that posture.
- No other screen renders a yes/no Pressable pair today: `AuthScreen`, `HomeScreen`, `JobsScreen`, `InboxScreen`, `MoneyScreen`, `ProfileScreen`, `SettingsScreen`, `TaskFeedScreen` reviewed by grep:
  ```
  grep -rn "Yes\|Not quite\|Confirm\|Cancel" src/screens
  ```
  No matches that constitute a decision-button pair. Flagged: the same `actions.kind` discipline must apply when Day 5+ screens add interactive bubbles.
- No tests for the onboarding state machine exist today; testing infra ships separately. The phase transitions are documented in a comment block at the top of the file to compensate.

### Prevention

A button row may carry INPUT (template-selection payload, typed input) or NAVIGATION (continue, retry). Never a binary decision. Enforce via:

1. `ConversationAction.kind: 'input' | 'navigation'` — there is no `'decision'` kind in the type.
2. The `guardActions()` runtime check in `ConversationBubble` (warns + drops the trailing action on a yes/no-shaped 2-action stack).
3. Code review: any classifier or extractor output that the vendor might disagree with MUST be narrated, not gated. The vendor's free-text reply is the correction channel.
4. State that the vendor mutates (templates, profile fields, etc.) MUST follow Pattern B — held in local state until the end of the relevant flow, written in one canonical call. Premature writes destroy the recovery affordance the conversational pattern provides.

Grep for the anti-pattern when adding any new bubble-anchored actions:

```
grep -rn "kind: 'input'" src
grep -rn "kind: 'navigation'" src
```

If any new bubble uses `actions` without `kind`, TS will fail.

### Prompt/Subagent Notes

The Day 2 build prompt did not specify the no-WIMP principle for the POS onboarding flow — the spec mirrored Hearth@Home in voice but not in architecture, which is how the yes/no buttons and the immediate-write `createVendor` ended up in the same screen. Future onboarding-adjacent prompts should state the principle explicitly: "decisions are made by typing, not by tapping; mutator calls run at the end of a flow, not at intermediate confirms." The same principle applies to any future surface where Hearth classifies, extracts, or assumes something about the vendor or their work.


---

## BUG-004: Profile tab renders blank — in-tab refresh() unmounts the whole navigator

**Status:** FIXED
**Date:** 2026-06-12
**Severity:** High
**Category:** expo-rn
**Introduced-by:** claude-fix
**Related bugs:** BUG-002 (shared-vs-per-instance context state — inverse lesson)

### Symptoms

- Tapping the new Profile tab shows nothing — no name, no Deus ID, no "Verify your identity" button. Completely blank.
- The logged-in account (`testjune@gmail.com`) had a full entity row (`deus_id 225606`, `display_name "Derrick"`, `id_verified false`), so it was NOT a missing-entity issue.
- Other tabs (Home/Inbox/Jobs/Money) rendered fine. No error logged, no redbox.

### Root Cause

`ProfileScreen` ran `useFocusEffect(() => void refresh())` (`ProfileScreen.tsx:52-54`). `refresh()` → `loadEntity()` calls `setIsLoading(true)` on the **shared** `EntityProvider` state (`EntityContext.tsx:146`). `Root` keyed its full-screen splash gate on that same value — `if (authLoading || entityLoading || vendorLoading) return <SplashScreen/>` (`App.tsx:33`, reading entity `isLoading` as `entityLoading`). So every time Profile gained focus, `entityLoading` flipped true → Root unmounted the entire `NavigationContainer`/`TabNavigator` → on resolve it remounted a fresh `NavigationContainer` at its initial route (Home). Profile's content never stayed on screen.

`isLoading` conflated two different things: a first-load (legit full-screen splash) and a background refresh (should be invisible). Profile was the only screen calling `refresh()` on focus, which is why it was the only broken tab.

### Solution

Split the flag in `EntityContext`. Added `isInitializing` — true only until the FIRST load for the current user resolves; background `refresh()` calls leave it false. A per-user ref (`initializedUserId`) lets the mount effect re-show the splash on a genuine (re)login while staying false on a token refresh (same id), avoiding splash flicker. Pointed `Root` at `isInitializing` instead of `isLoading`.

### Files Changed

- `src/context/EntityContext.tsx` — added `isInitializing` state + `initializedUserId` ref; `loadEntity` finally resolves `isInitializing=false`; mount effect re-shows it only for an un-initialized user id; exposed in the context value + interface.
- `App.tsx` — `Root` gates the splash on `entityInitializing` (was entity `isLoading`).

### Commits

- `<pending>` — fix: gate Root splash on entity isInitializing, not isLoading (Profile tab blank)

### Verification

- `npx tsc --noEmit` → exit 0.
- Logic trace: focus refresh now toggles only `isLoading` (Root ignores) → navigator stays mounted → ProfileScreen renders the entity. Cold start / sign-in still splash on first load (`isInitializing` true → false on resolve). Token refresh (same id) does not re-splash. New-user-no-entity path still resolves to `EntitySetupScreen` without flashing.
- NOTE: not yet verified on-device (requires running the Expo build); confirmed by type-check + control-flow trace. DB state was never the issue — the entity row was confirmed present in the report.

### Cross-check Performed

- **Other screens calling refresh() on focus:** `grep -rn "useFocusEffect\|refresh()" src/screens` → only `ProfileScreen`. No other tab triggers the teardown today.
- **Same latent pattern in sibling contexts (out-of-scope-but-flagged):** `VendorContext` and `AuthContext` also expose an `isLoading` that `Root` gates on (`vendorLoading`, `authLoading`). If a future in-tab screen ever calls vendor `refresh()` (or an auth reload), it would reproduce this exact teardown. No current caller exists, so not fixed here — flagged for the same `isInitializing` split if/when an in-tab vendor/auth refresh is added.
- **iOS/Android parity:** the fix is pure JS state/control-flow (no native API); behaves identically on both platforms.

### Prevention

A context's "is loading" flag that is also true during background refreshes must NOT be used as an app-level full-screen gate. Gate first-mount splashes on an init-only flag; let refreshes toggle a separate flag that no unmount-gate reads.

Grep for at-risk gates: `grep -n "isLoading" App.tsx` and confirm any provider `isLoading` used in a Root-level early return is an init-only flag.

### Prompt/Subagent Notes

Introduced by `claude-fix`: the Step 3.2 ProfileScreen code added `useFocusEffect(refresh)` for the verified-badge auto-refresh without checking how `Root` consumed the shared entity `isLoading`. The investigation-first report for that build traced the entity write path but not the Root render gate. Build prompts that add a `refresh()` call from a screen should require tracing every consumer of the loading flag the refresh toggles — especially app-level early returns.
