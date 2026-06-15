# DEFERRED.md — deferred features & polish

Single source of truth for "not now, but don't lose it." Every item agreed to be
deferred during a build session lands here, mapped to the roadmap step where it gets
built. Read before any polish / pre-launch pass.

Convention: when an item is built, move it to "Done" with the commit hash. Don't delete.

---

## Scheduled — mapped to a roadmap day

### Day 12.5 — Real media upload for content cards  → NEXT STEP after Day 12
Day 12 ships content-card media as a **URL only** (pasted image link, stored in the card's
`fields` jsonb under the reserved `media_url` entry — see `src/utils/card-fields.ts`). Day 12.5
replaces the paste-a-URL input with a real upload, at the `TODO(Day 12.5)` seam in
`src/components/CardEditorSheet.tsx`. Scope:
- Image picker (expo-image-picker) on the editor's "add media" affordance.
- Supabase **Storage bucket + RLS** (owner-writes-own, public-read for content media).
- Client-side validation (type/size) and upload **progress + error states**.
- The resulting Storage URL flows into the content card's **existing `media_url` field** —
  nothing downstream assumes the URL was user-typed, so the URL path keeps working too.

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

---

## Done (move items here with commit hash when built)

- _(empty — first entries land here as deferred items get built)_
