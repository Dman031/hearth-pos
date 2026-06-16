# DEFERRED.md — deferred features & polish

Single source of truth for "not now, but don't lose it." Every item agreed to be
deferred during a build session lands here, mapped to the roadmap step where it gets
built. Read before any polish / pre-launch pass.

Convention: when an item is built, move it to "Done" with the commit hash. Don't delete.

---

## Scheduled — mapped to a roadmap day

### Live "watch an AI find you" reach demo  → DAY 29 (Record the demo / fundable artifact)
The onboarding payoff in its full form: a user's freshly-created card actually surfaced
via query_cards on the live network and reached by an agent — ideally cross-LLM.
Depends on the card→network read path being proven (Days 25–27, the integration wall).
Day 10 ships only a STATIC closing beat ("you're now findable…"); the live version is
this. Note: Day 29's "agent query → book → pay → imprint" already covers this — make sure
the *card-reach moment* is shown explicitly, since reach is the product.

### Contextual just-in-time nudges  → DAYS 11–17 (as each tab is built)
Tiny hints surfaced at the moment of relevance, NOT front-loaded:
- First time on Profile with one card → soft "add another thing people can find you for" (Day 11–12)
- First item in Incoming → one line "this came because of your card" (Day 16)
Build each nudge when its surface is built. Progressive disclosure (Linear/Arc pattern).

### Optional skippable explainer video  → DAY 30 pre-flight OR marketing (not onboarding)
A short "learn more" video for people who want it — lives on Identity/Profile as optional,
NEVER a mandatory onboarding gate. Also doubles as a sales/investor asset. Build only if
time; it's a nice-to-have, not a blocker.

---

## Pre-launch architecture decisions (locked)

Locked design calls that aren't built yet but constrain how the unbuilt piece gets built.
Distinct from polish — these are architecture, decided, not up for re-litigation.

### Caller-side verification — "Model B" (anonymous-search → verify-at-action → app node) → PRE-LAUNCH
DECISION (Derrick, locked). How a CALLER (demand side — e.g. an office admin connecting Deus to
their ChatGPT/Claude to search + act) is verified. **Distinct from card-OWNER verification** (the
Day-12 editor lock / `entityIsVerified`). Designed when real connector auth replaces the current
**trust-on-type** placeholder (type a `deus_id`, no real auth — the entity-binding step of the
network `/oauth` flow). Build that replacement AS this flow.

The flow:
1. **Connect + SEARCH = zero friction, anonymous.** A connected caller queries all
   `see_perm='anyone'` cards with NO signup/verification. Discovery is the hook; it must cost
   nothing. (Maps to the network's existing `anonymous` caller tier — `auth.ts`, no `entity_id`
   bound.)
2. **ACT (reach / order / book) = requires verification.** At the moment of FIRST action, the
   caller is prompted to **download the app** and verify (~3 min). The app is REQUIRED to act, by
   design. (Acting needs a bound, verified entity → network `verified` tier.)
3. **Rationale for app-required (not web-verify):** every actor becomes a NODE. Acting pulls the
   caller into the network as a full participant (app installed, verified, can post their own
   cards). The act-to-verify moment doubles as supply-side acquisition. "Accelerate together."

Why verify-to-act is a FEATURE, not friction:
- **"The safest network — everyone who can act on you is a verified human."** A quality guarantee
  SOLD to the supply side, not a tax. Verified actors = vetted, high-intent. A vendor prefers 10
  verified requests over 1,000 anonymous tire-kickers.
- **Never ask for verification before the caller has gotten value.** 3 min is nothing AT THE
  MOMENT OF ACTION (peak motivation — they've already found what they want). Upfront gates kill
  adoption; just-in-time-at-action converts.

Two independent safety mechanisms (complementary, different coverage — need BOTH):
- **VERIFICATION = accountability** (we know who the actor is). The UNIVERSAL floor for ALL
  actions. The ONLY thing protecting non-payment actions (reach / message / book) from spam.
- **PAYMENT-UPFRONT = skin in the game.** Additional gate for TRANSACTIONAL actions (orders). A
  bot placing paid fake orders is paying real money — that's revenue, not spam; payment
  self-solves order-spam. But payment does NOT cover reach/messaging.
- ⚠️ Do NOT drop the verification floor on the payment argument alone — reach (the core
  primitive) has no payment to gate it.

**HARD TARGET (acceptance criterion, not aspiration):** full caller onboarding — download →
verified → can act — must complete in **UNDER 3 MINUTES**, benchmarked to ChatGPT/Claude Pro
setup. This number is load-bearing: the app-required choice ONLY holds if onboarding is genuinely
this fast. **MEASURE IT** — stopwatch test on a real device, cold (fresh install, new user). Over
3 min = a bug to fix, not "good enough."

Cross-repo: spans hearth-pos (app download, caller verify, caller-as-new-owner) AND hearth-network
(connector OAuth replacing trust-on-type, anonymous-search gating, act-tier enforcement). Status:
**NOT built.**

---

## Polish pass — DAY 30 (Pre-flight for the App Store)

- **Verified-human badge design** — match docs/deus-prototype.html. Current = plain amber
  text pill (functional placeholder). Real home is the Identity tab.
- **Top pill segmented tab control + amber Incoming badge** — prototype's nav style.
  Currently using bottom tab bar (shell). Build the pill in this pass; Incoming badge needs
  the real unread-count logic to exist first (Day 16).
- **Tab bar icons** — currently labels-only (tabBarIcon: () => null). Add icons.
- **Custom fonts** — Instrument Serif etc. vs current Georgia fallback.
- **Auth dev-error banner** — console.error → console.info (dev-only red banner; won't ship,
  but clean it up).
- **Badge auto-refresh timing** — verified badge needed a logout/login to show; refresh-on-
  focus timing should catch it without that.
- **Stripe return deep-link** — add app.json custom scheme (e.g. deus://) so Identity +
  Connect verification auto-return to the app instead of manual switch-back. Affects both the
  Identity and Connect flows.

---

## Enforcement seams (revisit — not blocking)

- **Verified-tier lock is UI-only at the editor / add-card surfaces** — Day 12 enforces the
  "'verified' see/act tier requires the owner to be verified" rule in
  `CardEditorSheet` (PermissionPicker disables the tier + `handleSave` double-guards), NOT in the
  shared `createCard`/`updateCard` write path. This was deliberate: gating the shared path would
  regress onboarding (which writes cards for an unverified fresh user). To fully honor the
  PROMPT-CODE CONTRACT, later move the lock into the write boundary so onboarding and any future
  writer are covered too — while keeping onboarding's own writes legal. Seam: `src/context/
  CardContext.tsx` (createCard/updateCard) ↔ `src/components/CardEditorSheet.tsx`.
  "Owner is verified" = `entityIsVerified` (ANY of `id_verified` / `business_verified` /
  `credential_verified`), matching the network's verified-tier derivation
  (hearth-network `src/middleware/auth.ts:78`) — NOT `id_verified` alone, so a
  business-verified-only vendor isn't wrongly blocked.
- **`isHigherSee` (clamp predicate) still treats 'anyone' as gated** — `src/services/
  card-gating.ts` `isHigherSee` returns true for BOTH `'verified'` and `'anyone'`, so the gate's
  clamp logic would clamp an `'anyone'` see tier when verification is unsatisfied. Day 12's
  editor lock uses the NARROW `seeTierRequiresOwnerVerification` (=== `'verified'`) instead,
  because findable-by-anyone is the network's baseline reach. Revisit whether the clamp predicate
  is too broad and reconcile the two predicate families (it touches the createCard write path, so
  it was left alone tonight).

## Logged bugs / cleanups (not blocking)

- **Onboarding classifier bug ("teacher" wouldn't classify)** — RESOLVED BY DESIGN at Day 10
  (Step 4.2 removes classification entirely; card flow replaces it). Old classifier.ts +
  classify-business edge fn left cleanly orphaned — retire/delete in a later cleanup.
- **VendorContext / AuthContext share the same isInitializing-vs-isLoading conflation** that
  caused the ProfileScreen blank-render bug (fixed in EntityContext). Not reachable today (no
  in-tab screen calls their refresh), but apply the same split if/when one does.
- **cards table RLS policies not in repo** — confirm the owner insert/select policy exists;
  if a card write silently zero-rows, that's the cause. Add an explicit migration if needed.
- **Card media is public-read (unguessable path) regardless of the card's see_perm** — a card
  gated to contacts/verified still has its IMAGE publicly accessible to anyone with the URL
  (`card-media` bucket is `public = true`; see `supabase/migrations/0002_card_media_storage.sql`).
  Acceptable now (content media is meant to be seen; no enumeration via unguessable paths). If
  private-card media becomes a requirement, move to a private bucket + signed URLs (time-limited,
  generated on authorized card view) — touches the render side. Logged, not built.

---

## Done (move items here with commit hash when built)

- **Day 12.5 — Real media upload for content cards** — built in `78e48e6`. Picker
  (expo-image-picker) → `card-media` Storage bucket (owner-writes-own RLS keyed by
  `{entity_id}/` path, public-read) → public URL written into the existing `fields.media_url`
  entry; render side unchanged. URL paste kept as a secondary fallback. Upload logic is reusable
  (`src/services/storage.ts` + `src/hooks/useMediaUpload.ts`) for Day 14. Indeterminate
  "Uploading…" spinner (no % — supabase-js upload has no progress callback). Ops: apply
  `supabase/migrations/0002_card_media_storage.sql` (`supabase db push`).
