# BUGS_AND_SOLUTIONS — Hearth POS

*Last updated: 2026-07-27*

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

---

## BUG-005: Onboarding classifier could not classify "teacher" (and the whole low-confidence class)

**Status:** RESOLVED BY DESIGN
**Date:** 2026-06-13
**Severity:** Medium (onboarding dead-end for unsupported business types)
**Category:** ai-tool-calling → resolved by removal
**Introduced-by:** human (product direction — template era); resolved-by `claude` (Phase 4 card model)
**Related bugs:** BUG-003 (the no-WIMP pick-list exception this removes), BUG-002 (the createVendor-on-finalize path this retires)

### Symptom

- A vendor describing themselves as a "teacher" (and other inputs outside the four launch templates: generic_service, plumber, coffee_shop, task_runner) returned low or zero confidence from `classify-business`. The flow fell through to the documented pick-list exception (BUG-003's Pattern C), where none of the four templates fit — a dead-end framed as a choice.

### Root Cause

Onboarding was modeled as "classify the vendor into one of N templates." Any input outside the seeded template set is inherently unclassifiable; no amount of prompt tuning fixes a closed-set classifier facing an open-set world. The teacher case is one instance of an unbounded class.

### Fix (by design — classification removed entirely)

Phase 4 replaces the template/classify model with the Deus **card model**. The new `OnboardingScreen` is a SCRIPTED helper (no LLM, no `classify-business`, no Anthropic call): it asks plain questions, seeds 1–3 cards (`title` + `fields` in the vendor's own words), sets per-card see/act permissions (framed as privacy/control), and hands off via a static closing beat. There is no classification left to fail, so the entire low-confidence class — teacher included — is moot. The card-write path goes through `assertCardCanGoLive` (PROMPT-CODE CONTRACT) in `CardContext.createCard`.

### Files Changed

- `src/screens/OnboardingScreen.tsx` — rewritten internals: scripted card phase machine; removed `classifyBusiness`/`fetchAllTemplates`/`useVendor`/`createVendor`; reuses the existing bubble/orb/input shell and the no-WIMP action model.
- `src/context/CardContext.tsx` — new. Loads the entity's cards; gated `createCard`; `needsOnboarding` load-time latch + `completeOnboarding()`; `isInitializing` split (mirrors EntityContext, per BUG-004's prevention rule).
- `src/hooks/useCards.ts` — new thin context reader.
- `App.tsx` — mount `CardProvider` inside `EntityProvider`; route onboarding off `needsOnboarding` (was `vendor.template_id`); splash no longer gates on `vendorLoading` (closes the latent gate BUG-004 flagged); card splash checked AFTER the deus_id reveal so the reveal isn't hidden.
- `src/services/classifier.ts` + `supabase/functions/classify-business` — left cleanly orphaned (no callers); retire/delete in a later cleanup (tracked in DEFERRED.md).

### Commits

- `<pending>` — feat: scripted card-seeding onboarding (replaces classify-business)

### Verification

- `npx tsc --noEmit` → exit 0.
- `grep` confirms no remaining real references to `classifyBusiness`/`fetchAllTemplates`/`createVendor` in `App.tsx`/`OnboardingScreen.tsx` (only comments + the `'vendor'` bubble-speaker literal remain).
- `grep -ni "schema"` over the new files → only the comment forbidding the word.
- NOT yet verified on-device (requires the Expo build) — confirmed by type-check + control-flow trace. cards-table RLS policies are not in-repo; if a card write silently returns zero rows that is the cause and `createCard` surfaces it as failure (SUPABASE WRITE RULE) with a retry affordance (tracked in DEFERRED.md).

### Cross-check Performed

- **Other AI invocation surfaces (ai-tool-calling cross-check rule):** `classify-business` was the only Anthropic call wired into the app; no other tool-calling/extraction surface ships in hearth-pos today, so none carries the same closed-set-classifier failure mode.
- **Other routing inputs:** `vendor` is still read by `stripe.ts`/`useVendor`; `VendorProvider` stays mounted, only its routing role is dropped. The four tab screens never read `vendor`, so the tabs are unaffected.
- **isInitializing-vs-isLoading pattern (BUG-004):** `CardContext` was built with the init-only split from the start, so it does not reintroduce the ProfileScreen-blank teardown.
- **Deus-ID reveal regression:** Root checks `revealEntity`/entity-setup BEFORE the card splash, so the Phase 3 reveal is not hidden while cards load for the just-created entity.

### Prevention

Do not model onboarding (or any vendor-facing categorization) as classification into a closed set when the input space is open. Prefer letting the vendor name the thing in their own words (a card) over forcing it into a predefined bucket. If a future surface must classify, it must have an explicit, non-dead-end path for "none of the buckets fit" that is not framed as a choice the vendor failed to make.

---

## BUG-006: Reserved image-URL fields polluted the semantic-search embedding

**Status:** FIXED
**Date:** 2026-06-23
**Severity:** Medium
**Category:** ai-tool-calling (semantic search / embedding hygiene)
**Introduced-by:** claude-prompt
**Related bugs:** none

### Symptoms

- No user-visible error — a silent search-QUALITY degradation, found during Day 15 (gallery cards) investigation, not from a report.
- Every content card with an image embedded the literal token `media_url` **plus its full Supabase Storage URL** (e.g. `https://<proj>.supabase.co/storage/v1/object/public/card-media/<uuid>/1699-ab12cd.jpg`) into its semantic-search vector — ~100+ chars of opaque, meaningless tokens diluting the describing text an LLM actually matches on.

### Root Cause

The reserved-field machinery (`MEDIA_FIELD_LABEL`, `withoutMediaField`, `getMediaUrl`) lived ONLY in the client `src/utils/card-fields.ts`, used for rendering/editing. The WRITE-side embedder `composeEmbeddingText` (`supabase/functions/_shared/embed-core.ts`) had no knowledge of it: it walked the entire `fields` array and pushed every `{label, value}`, including the reserved `media_url` entry. When embed-on-write was added (semantic search, commit `c11d78f`), the already-existing `media_url` reserved field was not excluded — the two systems were built independently and never reconciled.

### Solution

Added `RESERVED_EMBED_SKIP_LABELS = new Set(['media_url', 'gallery_image'])` to `embed-core.ts` and `continue` past any field whose label is reserved (skips BOTH the label token and the URL value). `gallery_image` (Day 15's repeated gallery reserved field) is included pre-emptively in the same set so the gallery feature never reintroduces the same pollution. Existing rows were re-embedded via the new backfill `force_all` cursor mode (already-embedded rows don't match the stale filter, so a forced pass is required to rewrite their vectors).

### Files Changed

- `supabase/functions/_shared/embed-core.ts` — `RESERVED_EMBED_SKIP_LABELS` set + skip in `composeEmbeddingText`.
- `supabase/functions/backfill-embeddings/index.ts` — `force_all` + `after_id` cursor mode to re-embed already-embedded rows.

### Commits

- `<this commit>` — feat: Day 15 search hygiene (reserved-field embed exclusion + force-all backfill)

### Verification

- `npx tsc --noEmit` → exit 0.
- Code trace: a `{label:'media_url', value:'https://…jpg'}` entry now hits the `RESERVED_EMBED_SKIP_LABELS.has(label)` guard and is skipped before either push.
- Ops (Derrick): redeploy `embed-card` + `backfill-embeddings`; invoke backfill with `{ "force_all": true }`, re-invoking with the returned `next_cursor` until it is null, to rewrite the ~handful of existing content-card vectors.
- NOT independently re-verifiable on-device (server-side embedding); the vector is never returned to the client. Confirmed by reading `composeEmbeddingText` and the network's `match_cards` (returns no vector).

### Cross-check Performed

- **Other reserved fields (same anti-pattern grep `grep -rn "MEDIA_FIELD_LABEL\|GALLERY_FIELD_LABEL" src`):** `media_url` was the only reserved field at discovery; `gallery_image` is added by this same Day 15 work and is covered by the same skip-set in the same commit — no reserved field is left embeddable.
- **Other embed entry points:** both `embed-card` (write) and `backfill-embeddings` (ops) call the SHARED `composeEmbeddingText`, so the single fix covers every vector-producing path. The network read side embeds only the QUERY (never card fields), so it needs no change.
- **Availability flag (`available`):** already correctly excluded — `composeEmbeddingText` only reads `label`/`value`, never `available` (Day 13 guardrail intact).
- **Substring fallback (`query_cards`):** scans `label`/`value` literally; a reserved `media_url`/`gallery_image` label could in theory substring-match a query, but the values are opaque URLs and labels are machine tokens a human query won't contain — out-of-scope-but-flagged (no behavioural change made there).

### Prevention

When a reserved/machine field is added to a jsonb blob that is ALSO embedded for search, the exclusion must be applied at EVERY consumer of that blob, not just the render/edit path. The embed text builder and the renderer are independent consumers — a reserved-field convention defined in one does not propagate to the other. Grep both sides when adding a reserved label: `grep -rn "composeEmbeddingText\|RESERVED_EMBED_SKIP_LABELS" supabase` and `grep -rn "FIELD_LABEL" src`.

---

### DECISION (Day 15): old cards left un-backfilled as an observational cohort

The fix (`composeEmbeddingText` reserved-label exclusion) is deployed, so all cards created AFTER the Day 15 `embed-card` deploy are clean. Existing cards created BEFORE the deploy still carry the old polluted embeddings (image URL in the vector).

We are deliberately NOT running the `force_all` backfill yet, treating the two cohorts as a natural observational split:
  - **CLEAN cohort:** cards created post-fix (URL excluded from embedding)
  - **POLLUTED cohort:** cards created pre-fix (URL still in embedding)

This lets us observe whether the pollution actually degraded search in practice before spending the backfill effort.

**IMPORTANT — the polluted cards do NOT break.** They remain findable. The only expected symptom is SLIGHTLY WORSE search ranking (the URL noise competes with describing text for embedding budget).

**TRIGGER to run the backfill (any of):**
  - Observed: pre-fix cards consistently surface worse than post-fix cards for comparable queries
  - A specific important pre-fix card (e.g. the ezCater menu card — parsed WITH a photo, so it's in the polluted cohort) isn't getting found well in demos
  - Before the fundable demo / raise — clean everything so no card is handicapped when it matters

**TO RUN THE BACKFILL (when triggered — see triggers above):**
  1. **PREREQUISITE — make the function ops-invokable.** It currently gates on `auth.getUser(token)` (`supabase/functions/backfill-embeddings/index.ts:45-56`), so it needs a signed-in USER JWT. Both anon AND service_role keys 401 here (neither is a user token `auth.getUser` can resolve). Before running, change the gate to accept a `service_role` claim or a shared ops-secret Bearer. Scope this as its own small change.
  2. Invoke `backfill-embeddings`, body `{"force_all": true}`, with the ops credential from step 1.
  3. Re-invoke with each returned `next_cursor` until `next_cursor` is null.
  4. Search-test 3 cards (menu / Blue Hour Coffee / pickleball) on the live network — all must still surface. If any regress, STOP and investigate.
  Idempotent + reversible (re-embeds derived data; source cards untouched). Same model (bge-base-en-v1.5), same dims — no index rebuild.

**INTERIM (run before the gate change):** pass a signed-in vendor's access token as the Bearer — that satisfies `auth.getUser` today, no code change needed.

---

## BUG-007: create-connect-account crashes on the current Edge runtime (legacy std/node shims via esm.sh `?target=deno`)

**Status:** FIXED (code) — deploy + live verification pending (Derrick deploys by hand)
**Date:** 2026-07-11
**Severity:** High
**Category:** stripe (edge-runtime dependency compatibility)
**Introduced-by:** upstream-dependency
**Related bugs:** none

### Symptoms

- `create-connect-account` fails on every invocation on the current Supabase Edge runtime; vendor cannot start Stripe Connect (Express) business verification.
- Invocation log:
```
Deno.core.runMicrotasks() is not supported
```
  originating from `deno.land/std@0.177.1/node` shims.
- `entity_stripe_accounts` is empty — the function has never succeeded in this runtime; no load-bearing state existed.

### Root Cause

No file imports `std@0.177.1/node` directly. The Stripe import used esm.sh's Deno target: `import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno'`. That esm.sh build polyfills Node builtins (process, events, …) via the legacy `deno.land/std@0.177.1/node` compatibility layer, which calls `Deno.core.runMicrotasks()` — removed in the current Edge runtime (Deno 2 era; `supabase/config.toml` already sets `deno_version = 2`). The crash happens at module init, before any request handling. The Stripe client construction itself was already the modern shape (`Stripe.createFetchHttpClient()`, pinned `apiVersion`); only the import specifier was legacy.

### Solution

Switched to the runtime-native npm specifier — `import Stripe from 'npm:stripe@17.5.0'` (exact pin kept so the `'2024-12-18.acacia'` apiVersion literal stays type-valid and deploys are deterministic) — in `create-connect-account` and `stripe-connect-webhook`. In the webhook, additionally pass `Stripe.createSubtleCryptoProvider()` to `constructEventAsync` per current Stripe/Supabase Deno guidance (Web Crypto is guaranteed on the Edge runtime; Node-crypto compat is best-effort).

### Files Changed

- `supabase/functions/create-connect-account/index.ts` — Stripe import → `npm:stripe@17.5.0`.
- `supabase/functions/stripe-connect-webhook/index.ts` — Stripe import → `npm:stripe@17.5.0`; `createSubtleCryptoProvider()` passed to `constructEventAsync`.

### Commits

- `<this commit>` — fix: BUG-007 — npm: Stripe specifier for create-connect-account + stripe-connect-webhook

### Verification

- `deno check` (Deno 2.2.7 via npx deno-bin, `--node-modules-dir=none`): both changed functions type-check with the npm: import; **zero new errors vs the pristine `main` baseline** (6 pre-existing supabase-js type errors exist identically on both — see Cross-check).
- `npx tsc --noEmit` (app) → exit 0 (`tsconfig.json` excludes `supabase/`; app unaffected).
- Live verification is deploy-gated (Derrick deploys by hand): after deploy, invoke `create-connect-account` as a signed-in vendor → expect `{ url, account_id }` and a row in `entity_stripe_accounts` (DB state = ground truth), not the runMicrotasks crash.

### Cross-check Performed

- **All Stripe-importing functions swept** (`grep -rn "esm.sh/stripe" supabase/functions`): four sites, identical legacy pattern. Fixed here: `create-connect-account`, `stripe-connect-webhook` (webhook needed for the Connect verification round-trip). **Out-of-scope-but-flagged for follow-up: `create-identity-session/index.ts:21` and `stripe-identity-webhook/index.ts:25`** — same import, will crash the same way on next invocation; same one-line fix (+ crypto provider in the identity webhook, which also calls `constructEventAsync` without one).
- **Non-Stripe functions** (`classify-business`, `embed-card`, `backfill-embeddings`, etc.): use plain `esm.sh/@supabase/supabase-js@2` WITHOUT `?target=deno` — does not pull the std/node shims; unaffected.
- **Latent adjacent risk flagged (not fixed):** the supabase-js import is UNPINNED (`@2` floats). Today it resolves to 2.110.x, whose changed generics produce the 6 pre-existing `deno check` type errors (`never`-typed rows). Type-level only — but a floating major-adjacent dependency in deploy-time-resolved functions is the same class of upstream drift that caused this bug. Recommend pinning in the identity-pair follow-up.

### Prevention

- Never use esm.sh `?target=deno` builds for Node-ecosystem packages in Edge functions — use `npm:` specifiers (runtime-native, no shim layer). Detection grep for remaining sites: `grep -rn "target=deno\|deno.land/std" supabase/functions --include='*.ts'` (after the identity follow-up this must return nothing).
- Pin exact versions in deploy-time-resolved imports (`npm:pkg@X.Y.Z`, not `@^X` or bare `@2`) so runtime behavior can't drift between deploys.

---

## BUG-008: Stripe webhook endpoint created without Connect scope — connected-account events silently match nothing

**Status:** FIXED (Stripe-side configuration) — verified live end-to-end
**Date:** 2026-07-13
**Severity:** High
**Category:** stripe (webhook delivery / dashboard configuration)
**Introduced-by:** human-config (Stripe Dashboard/Workbench endpoint creation; closest ledger taxonomy: human-error)
**Related bugs:** BUG-007 (same webhook surface; this bug surfaced during BUG-007's post-deploy live verification)

### Symptoms

- `account.updated` fires for a fully onboarded connected account (charges_enabled, details_submitted, no disabled_reason, `entity_id` in metadata) — and nothing happens.
- Stripe shows **zero delivery attempts** (Total 0, Failed 0) — not failed deliveries; none attempted.
- Supabase gateway logs (`function_edge_logs`) show **zero inbound HTTP requests** to `stripe-connect-webhook` — confirmed live by firing a fresh `account.updated` ping while watching the logs in real time.
- `entities.business_verified` never written; the commerce RPC gate correctly kept refusing enables.

### Root Cause

The webhook endpoint was created via the Dashboard/Workbench UI, which does not expose the `connect` flag. An endpoint without `connect=true` is scoped to "Your account" (platform events only) and **silently matches no connected-account events** — Stripe never selects it for delivery, so nothing appears in delivery logs on either side. v1 `account.updated` events from connected accounts route ONLY to Connect-scoped ("Connected accounts") endpoints (docs.stripe.com/connect/webhooks).

### The Tell

GET the endpoint via API (`stripe webhook_endpoints retrieve we_...`):
- `application: null` → NOT Connect-scoped.
- `application: ca_...` → Connect-scoped.

### Solution

Create the endpoint via CLI with the explicit flag (the UI can't set it):

```
stripe webhook_endpoints create \
  -d "url=https://lfznznuqspeabfmsczqc.functions.supabase.co/stripe-connect-webhook" \
  -d "enabled_events[]=account.updated" \
  -d "connect=true"
```

Then `supabase secrets set STRIPE_CONNECT_WEBHOOK_SECRET=<new whsec_>` and redeploy `stripe-connect-webhook` so it boots with the new secret.

### Files Changed

- None — configuration fix outside the repo (Stripe endpoint + Supabase secret). The function code was already correct (`supabase/functions/stripe-connect-webhook/index.ts`, deployed v14+ with `npm:stripe@17.5.0` + `createSubtleCryptoProvider`).

### Commits

- `<this commit>` — docs: Day 18 close-out — BUG-008 ledger entry (config-only fix; entry ships with the close-out per protocol).

### Verification

Full pipeline proven live (DB state = ground truth): commerce toggle → Connect Express onboarding → `/connect/return` → `account.updated` → webhook → `business_verified=true` → `set_card_commerce` accepted enable → price persisted → external LLM read it via `get_card_details` on the live MCP server. Card `d7b767e8` (Josh Winslow, "Breakfast Menu") returns `commerce_enabled=true, price_cents=1250, price_currency=usd, commerce_terms` set. Negative: the RPC refused every enable while `business_verified` was false, and a sweep for `commerce_enabled=true` on unverified entities returns zero rows.

Repeatable Supabase-side observation (independent of Stripe's deliveries tab):

```
curl -sG "https://api.supabase.com/v1/projects/<ref>/analytics/endpoints/logs.all" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  --data-urlencode "sql=select cast(t.timestamp as datetime) as ts, r.status_code, req.method from function_edge_logs t cross join unnest(t.metadata) as m cross join unnest(m.response) as r cross join unnest(m.request) as req where req.url like '%stripe-connect-webhook%' order by t.timestamp desc limit 50"
```

Successful delivery = `POST 200` + console line `[stripe-connect-webhook] business_verified=true for <entity_id>`. Signature failure = `POST 400` + warn line. Nothing at all = Stripe isn't delivering — this bug's signature.

### Cross-check Performed

Confounds that cost diagnosis time — each is an adjacent trap on this surface:

- **(a) No retro-delivery:** Stripe does not deliver events to endpoints created after the event fired. Pings that pre-date endpoint creation prove nothing — always fire a FRESH event after any endpoint change.
- **(b) Thin vs snapshot payloads:** the new Workbench flow defaults to Thin (v2) event destinations (`ed_...` objects), which our snapshot handler cannot consume. An earlier thin destination delivered nothing usable and was replaced.
- **(c) Sandbox isolation:** Sandbox environments have their own separate destinations, invisible from other environments — read the environment the platform key actually operates in.
- **(d) Platform profile prerequisite:** Connect requires a completed platform profile before the first `accounts.create`; that error surfaces only in edge-function logs.
- **Adjacent webhook (`stripe-identity-webhook`):** listens to `identity.verification_session.verified` — a PLATFORM event, so "Your account" scope is CORRECT there (delivering fine since Jul 2). No change needed; the scope rule cuts the other way for Identity — do not "fix" it to `connect=true`.
- **Other Stripe Connect flows** (transaction charge, paywall trigger at transaction 10, 1.5% fee, referral kickback): not implemented yet — flagged: any future webhook consuming connected-account events MUST be created Connect-scoped via CLI.

### Prevention

- Never create connected-account webhook endpoints in the Dashboard UI. CLI/API with explicit `connect=true`, always.
- After ANY webhook endpoint change, run both checks before declaring it wired: the tell (`application` field via `stripe webhook_endpoints retrieve`) AND one live ping (`stripe accounts update <acct> -d "metadata[ping]=1"`) observed as a `POST` in the Supabase gateway-log query above.

---

## BUG-009: Engagement realtime channels are dead — engagements table never added to the supabase_realtime publication

**Status:** RESOLVED 2026-08-27 (fixed in hearth-network migration `0041`, applied 2026-08-26; publication membership confirmed directly against `pg_publication_tables`)
**Date:** 2026-07-27
**Closed:** 2026-08-27 (hearth-pos Session 0, contract sync)
**Severity:** Medium
**Category:** supabase-realtime
**Introduced-by:** claude-prompt
**Related bugs:** none

### Symptoms

- No user-visible error. The Engagement tab badge and list subscribe to `postgres_changes` on `public.engagements` (`useEngagementActionCount.ts`, `useMyEngagements.ts`, `useThreadEngagements.ts`) and the channels subscribe successfully — but no event ever arrives for INSERT/UPDATE on engagements.
- Consequences: the badge would never decrement after Done (STOP 5 amendment item 3), the tab doesn't gain rows live after an accept in PlexChat/Incoming, and a webhook `accepted → paid` transition doesn't update an open tab.

### Root Cause

Supabase realtime only streams tables in the `supabase_realtime` publication. Grep across all applied migrations: `grep -rln "supabase_realtime" hearth-network/migrations/` → only `0004_messages_plexchat.sql`, which added `inbound` and `messages`. Neither 0017 (engagements) nor 0018 (writers) adds `public.engagements` to the publication or sets its replica identity. All three engagement realtime subscriptions were written against a table that does not publish.

### Solution

- **Real fix (hearth-network) — APPLIED.** Shipped as `0041_today_visit_wrap.sql` SECTION 2 (`:242-243`), in exactly the 0004 idempotent style this entry specified:
  `alter table public.engagements replica identity full;`
  `do $$ begin alter publication supabase_realtime add table public.engagements; exception when duplicate_object then null; end $$;`
  Applied 2026-08-26; ledger row `'0041'` in `public.schema_migrations` (RECEIPT RULE — the receipt and the schema change land in one transaction).
- **Client mitigation (this commit):** `src/utils/engagement-refresh.ts` — an in-app change signal. The Done action (`complete_engagement`) fires `notifyEngagementsChanged()`; `useEngagementActionCount` subscribes, so the badge decrements deterministically. The dormant realtime channels stay in place and go live the moment the publication gains the table.

### Files Changed

- `src/utils/engagement-refresh.ts` (new) — listener registry + notify.
- `src/hooks/useEngagementActionCount.ts` — subscribes to the signal; comment documents the dormant channel.
- `src/hooks/useMyEngagements.ts`, `src/screens/EngagementScreen.tsx` — comments reference this bug; screen refreshes explicitly after its own write.

### Commits

- Ships with the Day 21 STOP 5 amendment commit (Engagement tab actionable).

### Verification

- (At diagnosis, 2026-07-27) Ground truth is migrations (canon rule 1): no publication add existed for engagements in any applied migration. Not verifiable against the live DB from that session.
- **Post-fix check, PERFORMED (2026-08-27):** `select * from pg_publication_tables where pubname = 'supabase_realtime';` → **returns `engagements`.** Run by Derrick against the live database; this is the entry's closing evidence. (The hearth-pos session could only reach `0041:242-243` plus the ledger row — PostgREST cannot expose `pg_catalog`, so the direct read was the necessary confirmation.)

### Cross-check Performed

- **Other engagements subscribers:** `grep -rn "table: 'engagements'" src/` → `useMyEngagements.ts`, `useEngagementActionCount.ts`, `useThreadEngagements.ts` (STOP 4 decision-slot chips). The banner's post-accept chip appearing today relies on its explicit `refresh()` + the inbound channel (inbound IS published), so it functions; its engagements channel is equally dormant. Out-of-scope-but-flagged: no code change needed there once the publication fix lands.
- **Other tables subscribed in-app:** `inbound` (published, 0004), `messages` (published, 0004) — both fine. `threads` deliberately uses fetch-on-focus because it is NOT published (`useThreads.ts` comment) — the same discipline engagements code assumed incorrectly.
- **At close (Session 0, 2026-08-27):** all three engagement channels go live with NO code change — `useMyEngagements.ts:188`, `useEngagementActionCount.ts:77`, `useThreadEngagements.ts:84`. `src/utils/engagement-refresh.ts` is KEPT deliberately (PLEXMED S7 spec, app-side gap 2): idempotent re-reads cost nothing and remain the deterministic path when a realtime connection drops. Only the two stale comments asserting dormancy were corrected (`useMyEngagements.ts:32-37`, `engagement-refresh.ts:1-16`).
- **Same failure class, swept in the same session:** a select string narrower than the type it casts into is the same silent, tsc-invisible lie as a channel on an unpublished table. All five were widened together — `useInbound.ts:14`, `useThreadPendingInbound.ts:15`, `useMyEngagements.ts:36`, `useThreadEngagements.ts:15`, `useThreadMessages.ts:11` — rather than only the three the session's scope originally named.

### Prevention

Before writing any `postgres_changes` subscription, verify the table is in the publication: `grep -rn "supabase_realtime" migrations/` in hearth-network (or `pg_publication_tables` live). A successfully-subscribed channel on an unpublished table is a silent no-op — the most expensive failure class (invisible until a stale badge/list is user-visible).

### Prompt/Subagent Notes

Introduced by the Day 21 STOP 5 build: the build prompt specified "realtime" badge/list behavior and the implementation subscribed to `engagements` without checking publication membership; the 0017 migration review focused on RLS and never asked whether the table publishes. Build prompts that specify realtime UI should require the publication grep as part of Step 1.

## BUG-010: an invented tense — "That isn't on sale yet." promised an in-app purchase nobody ever intended to build

**Category:** placeholder-data (tense, not value) · **Severity:** medium (copy shown to clinicians; no data effect) · **Status:** fixed
**Introduced-by:** Claude-build, N-1 / N-4-AMENDED as implemented (2026-08-28 / 2026-08-30). Not a slip — every one of these strings was TRUE WHEN WRITTEN. The paywall was unbuilt, so "yet" was an accurate description of the world.
**Found:** 2026-08-31, recording the PlexMed pricing rulings (P-1…P-6). P-3 put billing on the web permanently, and the moment it did, three pieces of copy and one render branch became false at once.

### Symptoms

None. Nothing errored, nothing rendered wrong, and the app said only things that had been true. A clinician who tapped the storefront row saw "That isn't on sale yet." — a sentence promising a future in-app purchase that P-3 forbids and that nobody had ever planned to build.

### Root Cause

**AN INVENTED TENSE. This is the placeholder pattern's quietest form, and it deserves its own name.**

The Awareness Pattern this repo already carries — *don't ship plausible placeholder data* — was written about invented VALUES: `vendorRating = 4.7`, "12 meals together", a number that looks real and is not (harvest-once BUG-014). A reviewer can catch those, because a fabricated figure has a source you can go and fail to find.

**A tense has no source to check.** "Yet", "soon", "not available *yet*", a field comment that says "until the paywall session rules the number" — each encodes a PROMISE ABOUT THE FUTURE that nobody ever made, and each reads as ordinary caution rather than as a claim. **A promise nobody made is harder to spot than a fake figure**, because there is no wrong value to notice: the sentence is grammatical, modest, and was accurate on the day it was written. It goes false silently, when a ruling elsewhere changes the future it assumed — and nothing recompiles a tense.

Four instances, all of one decision:

| Site | Said | Assumed |
|---|---|---|
| `practice.ts:275` | `MODULE_UNAVAILABLE = "That isn't on sale yet."` | it will go on sale, in the app |
| `entitlements.ts:148,150` | `reason: 'not_available_yet'` | availability is coming |
| `entitlements.ts:47-58` | priceCents null "until the paywall session rules the number" | a session will rule a number into this field |
| `SettingsPanel.tsx:192-196` | `priceCents !== null ? <price/> : null` | a value will arrive to fill this branch |

The fourth is the sharpest, because it is not prose: **a render branch waiting for a value that can never arrive is a claim about the future written into code.** It would have sat there indefinitely, one assignment away from putting a price in an app that may not carry one.

### Solution

Rulings P-5 and P-6 (DEUS_DAY_BY_DAY.md, 2026-08-31), built in one commit:

- `MODULE_SETUP_LINE = 'PlexMed is set up outside the app.'` — ratified copy. True forever, names no figure, names no destination.
- `reason: 'not_sold_in_app'` — the permanent fact, not a waiting state.
- `priceCents`' comment now says RULED NULL, PERMANENTLY, and says why the app names no figure.
- The `priceCents !== null` render branch is **removed**, along with the `modulePrice` style that made a figure look like a price.
- Arm 1 is no longer a `Pressable` and has no chevron: with the purchase on the web, its tap could only ever produce a refusal, and a control whose only possible outcome is a refusal cannot act (N-4's original reasoning, restored — its later "a price is an offer" extension was withdrawn by Derrick and is written out as withdrawn in `entitlements.ts`).
- `startModulePurchase()` and `MODULE_UNAVAILABLE` are **kept and deliberately unreferenced**, each carrying a comment saying so and why, so a future session does not "fix" the dead code by wiring a button back. `MODULE_UNAVAILABLE` is now defined FROM `MODULE_SETUP_LINE` — one string, two names, so the two cannot drift.

### Cross-check Performed

- **Every other "yet"/"soon"/"not yet" in `src/`**, swept for the same shape: `grep -rniE "\byet\b|\bsoon\b|coming later|for now|until the" src/`. Remaining hits are of two kinds and **both are correct**: (i) comments describing genuinely unbuilt work whose future is still open (PlexLaw/PlexATS `blurb: 'Coming later.'` — those modules ARE planned and unruled, so the tense is honest), and (ii) `TODO(PAYWALL)` markers on `isModuleOwned()`, which genuinely IS still coming — the entitlement read is real, ruled, and unbuilt. **A tense is only invented when the future it names has been ruled out**, which is the test this entry adds.
- **`MODULE_UNVERIFIED_BODY` / `MODULE_UNVERIFIED_POINTER` / `MODULE_NO_CARD_BODY`** — the other three arms' copy. All describe present, actionable states ("Verify your license to open your times board"), none promises a future. Unchanged.
- **`styles.failed`** — nearly removed as dead with `styles.modulePrice`. It is **not** dead: the email-preference save error at `SettingsPanel.tsx:274` still uses it. Checked before deleting; only `modulePrice` went.
- **hearth-network's Stripe surface** — P-3's subscription webhook does not exist yet, so there is no sibling copy there to correct. Flagged for the paywall session: the new webhook must not name a tense either.
- **Out-of-scope-but-flagged:** nothing.

### Prevention

**Name the pattern, because that is what makes it visible: AN INVENTED TENSE.** PROPOSED, NOT PROMOTED — it belongs beside "don't ship plausible placeholder data" in CLAUDE.md's Awareness Patterns, where it would ask a different question of a different kind of string. Promotion is its own ceremony (grep command + one-time sweep + a note on the origin entry) and one occurrence, however many instances it had, is not the bar. Recorded here so the second occurrence has something to recur against.

The test, one line: **does this sentence, literal, or branch assume a future that has been ruled out?** If the future is genuinely open, the tense is honest. If a ruling has closed it, the tense is a promise nobody made — and the fix is never to soften the word, but to say the permanent thing instead.

Sweep: `grep -rniE "\byet\b|\bsoon\b|not available|coming|until the" src/` — every hit gets read against the roadmap, not against intuition.

## BUG-011: two permanent refusals on a practice booking — one told the clinician to try again, the other told them nothing at all

**Category:** ai-tool-calling / refusal-copy · **Severity:** high (a clinician acting on a live booking gets no true account of what happened) · **Status:** fixed
**Introduced-by:** upstream ruling, not a slip. N-20-AMENDED-7 items 2 and 3 (recorded 2026-09-05) and the 0050/0051 migrations added two refusals to `respond_to_inbound` that did not exist when these surfaces were written. Every arm here was correct on the day it shipped; the server grew two terminals underneath it. The Decline half is a genuine app defect and is older — see below.
**Found:** 2026-09-10, the N-20/N-21 app catch-up investigation, reading the live `respond_to_inbound` body via `admin_functiondef`.

### Symptoms

A clinician taps **Accept** on a practice booking that has just confirmed and paid, and reads: *"Couldn't accept just now. Nothing was changed — try again."* Every retry fails identically. Nothing is wrong with the connection, the row, or the clinician; the server refuses this decision permanently and always will.

A clinician taps **Decline** on the same row and **nothing happens at all.** No toast, no error, no state change — a control that visibly does nothing. This is the worse of the two: the retry advice is at least an account, however false; silence gives the clinician nothing to be wrong about, and there is nothing on screen to correct it.

### Root Cause

**Two different causes wearing one symptom, which is why the Decline half survived a fix to the Accept half.**

**The Accept half is a stale default.** `respond_to_inbound`'s live body raises `SLOT_ALREADY_CONFIRMED` at line 70 when `card.kind = 'practice' and inbound.kind = 'booking'`. `ClinicalRequestTile.tsx` matched only `SLOT_NO_LONGER_HELD` and let everything else fall to a retry string. That default is *correct* for a dropped connection and *false* for a terminal refusal — the same shape the let-go race arm was written to close, arriving one ruling later. The retry advice is not merely unhelpful: it asserts that trying again might work, which is a claim about the world that the server has already settled.

**The Decline half is a missing catch, and it predates the ruling.** `ClinicalRequestTile.tsx:218` was `onPress={() => void onDecline(inbound)}` — the handler called straight off the Pressable with no `try`/`catch` anywhere on the path, while the sibling `accept` on the same component (:99-117) had one. `IncomingScreen.handleDecline` (:53-57) throws on `rpcErr`. So the rejection had nowhere to land and became an unhandled promise rejection. **`SLOT_BOOKING_NOT_DECLINABLE` did not break this path; it only made an already-silent path reachable with something worth saying.** Any decline failure — a dropped connection included — has always been silent here.

**Why the asymmetry survived review:** the two controls sit eight lines apart and read as a pair, so `accept`'s visible `try`/`catch` makes the file *look* like it handles decline too. The absence is invisible at exactly the altitude a reviewer reads at.

### Solution

Two commits on `feat/n20-n21-app`:

- **`f15645d`** removes the row from every pending-inbound read (N-20-AMENDED-7 item 3) — the actual fix. A bridge-state practice booking is not a decision anyone can make, so it is not offered.
- **this commit** is the belt for the race window, where the row was on screen when `confirm_slot_booking` landed and the finger came down before the realtime stream cleared it.

- `src/services/practice.ts` — `isSlotAlreadyConfirmed` / `isSlotBookingNotDeclinable` (matched by message, like every refusal in this file), plus `ALREADY_CONFIRMED_MESSAGE` and `NOT_DECLINABLE_MESSAGE`. The two strings share their first clause deliberately: one fact underlies both refusals, and a clinician meeting the second should recognise it rather than read an unrelated explanation of the same state.
- `src/components/ClinicalRequestTile.tsx` — the accept arm, and a wrapped `decline` callback that replaces the bare `void onDecline(inbound)`. Its generic arm ("Couldn't decline just now. Nothing was changed — try again.") is new behaviour for *every* decline failure on this tile, not only the two ruled ones.
- `src/components/ThreadDecisionBanner.tsx` — both arms, **each gated on its own `decision`**. The two codes come off opposite branches of `respond_to_inbound`; a loose match would report the wrong refusal.

**`isSlotNoLongerHeld` and `LET_GO_RACE` are untouched.** The arms are additions. Note, though, that `SLOT_NO_LONGER_HELD` is now **unreachable on a practice booking** — the practice guard at live line 70 precedes the raise at line 132 inside the same accept branch. The arm stays because the code is still live for non-practice slot accepts; deleting a live answer to tidy a dead branch would be the wrong trade.

### Cross-check Performed

- **`src/components/InboundTile.tsx:83,96`** — the non-clinical tile's own `accept`/`decline` catches. Both codes are **unreachable** here: the server guard requires `card.kind = 'practice'`, and `InboundTile.tsx:102` routes every practice row to `ClinicalRequestTile` before these handlers are used. **Out of scope, deliberately left** — adding arms for codes that cannot fire would be dead copy on a hot path. It does carry a separate, pre-existing weakness worth naming: both catches surface `err.message` raw, so any RPC refusal reaching them shows the server's internal string, prefix and `(code: …)` suffix included. **Flagged, not fixed** — no ruled copy exists for those paths and inventing some is out of this item's scope.
- **`src/screens/IncomingScreen.tsx:35-57`** — both handlers rethrow and are unchanged. Rethrowing is correct: the tile owns the copy, and moving the decision up here would put it further from the surface that renders it.
- **Every other `respond_to_inbound` call site**: three total (`IncomingScreen` ×2, `ThreadDecisionBanner` ×1). All three accounted for above.
- **Every other refusal `ClinicalRequestTile` can meet**: `postInquiryMessage`'s (`ask`, :79-97) already has named arms for `awaiting_their_reply` and `already_decided`. Unchanged and correct.
- **Other surfaces with a `void handler()` straight off a Pressable, i.e. the same missing-catch shape**: swept with `grep -rn "onPress={() => void " src/` — 21 hits, every one read. **This sweep's first result was written up as "no second instance" and that was wrong; it is corrected here rather than left standing.** The distinction that decides each hit is what the handler *awaits*: this app's service layer returns `{ ok, reason }` Results and never rejects (`visits.ts`, `slots.ts`, `inquiry.ts`), so a `void` call into it is safe; the **Contexts** (`CardContext`, `EntityContext`, `VendorContext`) and `IncomingScreen`'s two decision handlers are what throw. Sorted by that predicate:
  - **Safe, Result-only:** `TodayTile.sendToRecord/start/openRoom/runSuperbill`, `AddTimesSheet.post`, `MoneyPanel.loadMore`, `ClinicalRequestTile.ask`.
  - **Calls a throwing Context and already catches:** `CardEditorSheet.handleSave` (:313-407), `CardEditorSheet.onCommerceToggle` (:236-267), `MoneyPanel.onSetUpPayments` (:94-112).
  - **ONE SECOND INSTANCE, REAL:** `OpenTimesBoard.confirmZone` (:132-144) toasts on the `setEntityTimezone` Result and then `await refreshEntity()` — an EntityContext method that throws (`EntityContext.tsx:255-309`) — with no `try`/`catch` and invoked as `void confirmZone(z)` (:231, :243). A failed refresh after a saved timezone is silent. Lower stakes than the Decline path and the same shape.
  - **Second-order:** `PlexChatScreen.openSuperbill` (:281) ends on `await Linking.openURL(url)`, which can reject even behind its `canOpenURL` guard.
- **Out-of-scope-but-flagged:** `OpenTimesBoard.confirmZone` and `PlexChatScreen.openSuperbill` — both are missing catches, neither is a refusal-copy defect, and fixing them here would be scope creep on an item that is about two error arms. `OpenTimesBoard` is already opened by N-20-AMENDED-7's hold-window copy work (item 11 of the same build); this is where that catch belongs. `InboundTile`'s raw `err.message` rendering (above). BUG-012 below.

### Prevention

**A refusal arm is owed wherever a server grows a terminal, and the retry default is where the debt accumulates.** The pattern is not "we forgot a case" — it is that a *default* which was true of every refusal a surface could meet stays syntactically valid, and silently false, when a new refusal arrives. Nothing recompiles a fallback string.

Sweep, to be run whenever a migration adds a `raise` carrying a `(code: X)` suffix: `grep -rn "(code:" ../hearth-network/migrations/*.sql | grep -oE "code: [A-Z_]+" | sort -u` — every code goes to a `grep -rn "<CODE>" src/`. A code with no app hit is either unreachable from the app (say why, in the entry) or an unrendered refusal.

**And the narrower one, which is what actually bit here: an async handler invoked with `void` off a control has no catch unless someone wrote one.** `void` silences the floating-promise warning that would otherwise have pointed at this exact line.

Sweep: `grep -rn "onPress={() => void " src/`. **A hit is only safe if you can name what the handler awaits.** In this app that is a two-way split — the service layer returns `{ ok, reason }` and cannot reject, the Contexts throw — so the second grep is the one that matters: `grep -rn "throw " src/context/`. A handler that awaits a Context method and has no `try`/`catch` is an instance, whatever its stakes.

**And a note on this entry's own cross-check, because it is the more useful lesson:** the first version of that bullet said "no second instance" on the strength of a heuristic that searched 40 lines from the first grep hit for the substring `try {`. It resolved three handler definitions to the wrong line entirely and reported "NO try/catch" for handlers that plainly have one. **A check that can pass — or fail — without the thing being true is worse than no check**, and it nearly shipped a false all-clear into the ledger, in the cross-check section whose whole purpose is to catch what the fix missed. Read the handler; do not pattern-match near it.

## BUG-012: [NETWORK · OPEN] cancel_slot_booking's audit imprint carries no `event` key, so every slot cancellation records `prior_cancel_request: false`

**Category:** stripe / audit-provenance · **Severity:** medium (no user-visible effect; corrupts the provenance flag an operator triages refunds with) · **Status:** **OPEN — hearth-network item, out of scope for hearth-pos**
**Introduced-by:** hearth-network `0051` as built (N-20-AMENDED-7 section 4). `cancel_engagement`'s pre-existing refund-due imprint carries `'event', 'cancel_requested_refund_due'`; the new `cancel_slot_booking` imprint was written with the richer slot fields and without that key.
**Found:** 2026-09-10, the N-20/N-21 app catch-up investigation, reading both live bodies via `admin_functiondef` while checking whether the app's "refunds are processed manually" copy is still true. **Recorded here by ruling (Derrick, 2026-09-10) so it is not lost — it is not fixed by any hearth-pos commit and must not be.**

### Symptoms

None visible. A slot cancellation refunds correctly and the app renders correctly. The damage is in the ledger: when `charge.refunded` later arrives, the webhook records `prior_cancel_request: false` for a refund that *was* preceded by an in-system cancel request — the exact discrimination that flag exists to make.

### Root Cause

`cancel_slot_booking`'s imprint (live body :120-131) builds `engagement_id, from_status, to_status, path, refund_due, slot_id, slot_disposition, transaction_id, stripe_payment_intent_id` — and **no `event`**. `cancel_engagement`'s own refund-due imprint (live :137-148) carries `'event', 'cancel_requested_refund_due'`.

The consumer matches on that key exactly: `hearth-network/src/routes/stripe-webhook.ts:378-396` looks up `action = 'suggest'` **and** `detail->>event = 'cancel_requested_refund_due'` for the engagement. A slot cancellation writes `action = 'suggest'` (:122) but no `event`, so the lookup misses.

Since `cancel_engagement` now **dispatches** to `cancel_slot_booking` whenever a bound `card_slots` row exists (live :90-93), *every* slot-booking cancellation — app-originated included — takes the path that omits the key.

**Note what is NOT wrong, because it was checked and could easily have been mis-diagnosed:** the SQL comment at `cancel_slot_booking:117` says the refund "is issued by the Worker". No Worker code issues a refund off this imprint — `stripe-webhook.ts:378-396` only *reads* it as a provenance flag on the `refund_finalized` imprint. Refunds are issued by hand in the Stripe dashboard on both paths, so the app's "Refunds are processed manually" copy stays true. The comment overstates; the flag is the real defect.

### Solution

**Not applied.** Owed to hearth-network: add `'event', 'cancel_requested_refund_due'` to `cancel_slot_booking`'s imprint so the dispatch path is indistinguishable from the direct path to the consumer — the same reasoning that made the dispatch return `cancel_slot_booking`'s result unchanged ("no client needs to know the split"). Same-signature `create or replace`, so no grant block is owed. Whether historical rows are backfilled is a separate call.

### Cross-check Performed

- **Every writer of a `'suggest'` imprint the webhook consumes**: `cancel_engagement` (carries the key), `cancel_slot_booking` (does not — this entry). `slot-booking.ts:407` writes `slot_booking_refund_due` and `stripe-webhook.ts:165,183` writes/reads `duplicate_charge_refund_due`; both are self-consistent pairs and neither feeds the `prior_cancel_request` lookup.
- **hearth-pos side**: `EngagementScreen.tsx:305-307` passes only `p_engagement_id` and reads `refund_due` / `transaction_id` from the return; `cancel_slot_booking`'s return is a superset of `cancel_engagement`'s, so nothing in the app breaks and nothing in the app can fix this. **Confirmed out of scope.**
- **Out-of-scope-but-flagged:** `cancel_slot_booking:117`'s overstated "issued by the Worker" comment, which is what made the wrong diagnosis available in the first place.
