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
