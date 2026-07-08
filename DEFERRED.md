# DEFERRED.md — deferred features & polish

Single source of truth for "not now, but don't lose it." Every item agreed to be
deferred during a build session lands here, mapped to the roadmap step where it gets
built. Read before any polish / pre-launch pass.

Convention: when an item is built, move it to "Done" with the commit hash. Don't delete.

---

## Scheduled — mapped to a roadmap day

### Identity tab  → FOLDS INTO PROFILE at DAY 17 (no standalone tab)
Decided 2026-06-25 (Day 16a). Identity does NOT get its own tab. It becomes a "My ID"
section/button inside Profile at Day 17. **16a's nav is FOUR tabs: Profile / Incoming /
PlexChat / Contacts** — 16a removes the placeholder Identity tab and adds PlexChat. Do NOT
create a 5th Identity tab.

### PDF menu upload  → DAY 14.x (deferred from Day 14 — Step 4.5 menu→cards)
Day 14 ships PHOTO-only menu parse. PDF is a deliberate follow-on. Of the three seams, two are
nearly free and ALREADY designed for both file types:
- **Seam 2 (parse-menu function):** branch on file type — PDF → `{type:"document", source:{type:"url", url}}`,
  image → `{type:"image", source:{type:"url", url}}`. The public `card-media` URL works as the
  source for BOTH. Same parse prompt, same output shape, same server-side validation downstream.
  A few lines; does not fork the function.
- **Seam 3 (confirm screen):** ZERO change — PDF items land as the same `{label, value, available}`
  FieldEntry[] in the same seeded `CardEditorSheet`, same `createCard` write path.
- **Seam 1 (upload) is the real cost and the reason it's deferred:** `expo-image-picker` can't pick
  PDFs (images/videos only) → needs **`expo-document-picker`** (new native dep → Expo
  prebuild/rebuild; heed AGENTS.md's SDK 55 caution). And `src/services/storage.ts` is image-locked
  AND shared (hardcoded `image/jpeg` + `.jpg`, 10 MB cap; used by onboarding / profile / card-media
  via `CardEditorSheet`) → needs a SEPARATE `uploadDocumentAsset` path + a larger size ceiling, NOT
  an in-place widen (widening regresses the image-only paths). Lands clean later: add
  `expo-document-picker`, build the document-upload path, flip the one parse-menu branch. Do NOT
  bolt onto Day 14 — it expands the demo-critical photo path's risk surface with a native dep + rebuild.

### Link menu parse (paste a URL)  → DAY 14.x (after PDF)
Server-side fetch of a menu page + HTML→text extraction, then the same parse → confirm → publish
spine. A separate, bigger surface (fetch + parse + sanitize untrusted HTML); not demo-critical.
Build after PDF. Seams 2/3 reuse identically (URL content block / same field shape).

### Voice menu entry ("or speak it")  → LATER (no roadmap day yet)
Speak a menu instead of photographing it. NO voice/TTS surface exists in the app today (CLAUDE.md
B.3 is awareness-only). A later step once a voice surface is introduced; out of Day 14 entirely.

### "Plex Capture" — brand for the GENERALIZED capture feature  → WHEN BREADTH IS REAL (not before)
The vendor-facing entry point ships as **"Scan a photo"** (mechanism-honest, deliberately NOT a brand
name) with loading copy **"Reading your photo…"**. Under the hood the parse PROMPT stays **menu-tuned**
— it's a way station, not a card-type-aware extractor. **"Plex Capture" is the brand name reserved for
the GENERALIZED (card-type-aware) feature.** It graduates from "Scan a photo" ONLY when the breadth is
real — i.e. the prompt actually handles multiple card types, not just menus — NOT before. Applying the
brand to a menu-tuned tool over-promises. As of Day 14.x the user-facing COPY is already generic; what
remains for "Plex Capture" is the **prompt generalization** (the deferred work) plus the rename. The
relocation of the entry point into the CardEditorSheet create flow ("or scan a photo to fill this card")
is a SEPARATE, still-pending step — it's a data-flow re-architecture (seed-from-parent → self-parse-and-
mutate), not a clean copy move, so it was split out rather than risk the working parse path.

### "Scan a photo" entry point — RELOCATE into the card-creation flow  → OWN FOCUSED STEP (deferred)
The **"Scan a photo"** button is correctly NAMED but mis-PLACED: it sits on the Profile tab "Your
cards" row, when conceptually it belongs in the card-CREATION flow (it builds a card, it's not a
profile action). Moving it into `CardEditorSheet` create mode is **more than a move — it changes the
data flow**:
- **Today (seed-from-parent):** `ProfileScreen` parses, hands a finished `createSeed` to
  `CardEditorSheet`, applied **once on open**.
- **In-sheet:** the editor must **scan-and-mutate its own live state mid-session** — needs a **2nd
  `useMediaUpload` wiring** (the existing one writes `media_url`, NOT fields), in-sheet parse/error
  UI, a **MERGE-VS-OVERWRITE decision** when the editor already has content, and unwinding ~50 lines
  of now-orphaned `ProfileScreen` state.
- **Open design question to answer FIRST:** when the user hits "scan" mid-edit, does the parse
  **REPLACE** the current fields or **MERGE** into them? Decide before building.
Cleanly separable; do as its own focused step. Part of the **card-creation-flow polish cluster**
(alongside suggested-fields-per-card-type, content-card render, and eventually the Plex Capture
generalization above — they all touch how a card gets BUILT).

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

### Group / multi-party PlexChat threads  → FUTURE (own migration, post-V1)
V1 PlexChat is PAIRWISE by design — threads have participant_a / participant_b (canonical
pair-ordering + unique constraint), and the read_at single-timestamp model assumes exactly two
participants. Group threads (3+ participants — e.g. property-manager + tenant + plumber, or a
caterer + couple planning together) are a genuine re-architecture, NOT an extension:
- threads needs a participants model (join table) instead of two columns
- RLS shifts from "a or b = me" to "I'm in the participants set"
- read_at single-timestamp breaks → needs per-participant read state (a message_reads table)
- the two RPCs (respond_to_inbound, post_message) need participant-set logic
Conscious omission, not oversight. Build when a real group use-case lands (B2V dispatch threads
are the likely first driver — a property manager coordinating tenant + vendor in one thread).
Until then, pairwise covers the dinner-text, the reach-response, and the 1:1 booking flows.

### 16b push notifications  → BLOCKED on Apple Developer account + ops gate
16b push notifications — **storage half is now ON MAIN** (Day-17 close-out merge `44c103f`):
`0011 device_tokens` + the `usePushTokenRegistration` capture hook, **guarded on a missing
`projectId`** (no-ops cleanly until EAS is initialised, so it's safe on main un-configured).
Remaining, all blocked on the Apple Developer account + ops gate:
- **`eas init` → `projectId`** (unblocks the guarded hook — the token capture starts working),
- **APNs key** (iOS) + FCM (Android) credentials,
- **`expo-notifications` config plugin + prebuild/native rebuild** (new native module — heed
  AGENTS.md SDK-55 caution; a rebuild is required), then
- the **send trigger** (server-side push on new inbound/message, reads `device_tokens`) + the
  **receive handler** (foreground/background notification → deep-link into the thread).
Bites at: first real external recipient / first live demo. Log any native-config (app.json
plugins, prebuild) changes here while parked so the eventual push prebuild stays a bounded change.

### QR-to-CTA deep link  → DAY 24 (build adjacent to the text-to-download funnel)
Decided 2026-07-04. Day-17A's Identity QR encodes the **bare `deus_id` (display only** —
scanning it routes nowhere; it's a "read my address off a screen" affordance, nothing more).
Target: the QR resolves to a **CTA landing page** (open-in-app / get-the-app / connect-your-
assistant). BLOCKED/DEFERRED behind three prerequisites:
- a **public entity-resolve route on hearth-network** (does one exist? **UNCONFIRMED** — verify
  before scoping),
- a **custom domain**, and
- **hearth-pos universal-link setup** (`associated-domains` entitlement + AASA file → native
  config, prebuild/rebuild).
Build **adjacent to the Day-24 text-to-download funnel**, NOT at Day 17 — same universal-link +
landing-page surface, so they share the native-config cost.
⚠️ **OPEN CONSENT QUESTION (decide BEFORE building):** does a scan-to-reach page **bypass the
directional-contacts gate**? Day-17A's rule is that saving a contact grants NO reach. A QR that
routes a stranger straight to reach would puncture that. Resolve **per-entity** — a
`display+download-only` QR vs. a `reach-capable` QR — consistent with the node-controlled,
consent-first grammar. Do not ship a reach-capable QR by default.

### Glass-tile / card-surface styling  → PENDING INVESTIGATION (design-consistency, not yet scoped)
Surfaced during Day 17. Several card surfaces render as **flat panels**, not the **"glass tiles"**
the canonical design implies (`docs/deus-prototype.html` — the surface treatment behind the SEE/ACT
card model and the trust-tier screens). Observed at least on: **Profile cards**, **PlexChat
thread-list rows**, and the **account-menu rows** (Day-17A surfaces). This is a **design-consistency
task, NOT yet scoped** — investigation is queued to (a) inventory every surface that should read as
a glass tile vs. a flat panel, (b) confirm the exact treatment against the prototype (blur/tint/
border/elevation tokens), and (c) decide whether it's a shared surface component or per-screen
styling before any code. Do not spot-fix one screen ahead of that inventory — piecemeal styling is
how the surfaces drifted apart in the first place. Not blocking; a visual-polish item (candidate to
fold into the DAY 30 polish pass, but logged here so it isn't lost before then).

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

## Brand — Teleoplexy (name DECIDED/locked; visual system → DAY 30 polish)

- **Name: Deus → Teleoplexy (LOCKED).** Resolves the class 9/42 trademark conflicts that
  killed "Deus." Etymology carries the thesis: *tele-* (the line drawn between two not-yet-
  connected people) + *-plexy* (a weaving that thickens the more it's woven into) = "reach that
  compounds," encoded in the name. `APP_NAME` is centralized → the rename is a one-line change.
  ⚠️ **PENDING — trademark check on "Teleoplexy" in classes 9 + 42 BEFORE flipping `APP_NAME`.**
  Don't repeat the Deus mistake; renaming twice is the disaster. (Note: `APP_NAME` constant does
  not exist yet — see CLAUDE.md; the rename lands when the constant does, gated on the TM check.)
- **Visual system → implement at the DAY 30 polish pass.** The full **Teleoplexy Brand Field
  Guide v1.0** is the canonical reference (supersedes docs/deus-prototype.html for the cosmetic
  layer). Implement as ONE coherent sweep (~2–3 focused days), NOT piecemeal mid-build. Static
  orb is sufficient (motion orb stays in the deferred WebGL chunk). **Every cosmetic complaint
  logged to date — oversized photo buttons, fonts, badge match, etc. — resolves to "implement
  per field guide"** (the Polish pass items below all roll up into this single sweep). Scope:
  three color worlds (Stone / Soil&Ember / Field), Teleo typeface (a geometric-sans stand-in is
  acceptable until the real Teleo file exists), node/line iconography, wordmark lockups,
  sentence-case + tight-tracking type rules.
- **Strategic note — two registers, one company.** The field guide's co-op/populist frame
  ("the large cooperation not the large corporation," "nobody in Silicon Valley takes a cut") is
  the **USER/VENDOR-facing** register; the "agent broadband / supply-side infra" story stays the
  **INVESTOR-facing** register. Same company, two faces — the guide's Stone / Soil&Ember / Field
  worlds already encode this split. Be deliberate about which face shows to whom.
- **App color mapping (Stone world = the PRODUCT-SURFACE register).** Of the three worlds, the
  app surface uses **Stone**; Soil&Ember = marketing, Field = community/local. Reconcile the
  guide's light-drawn Stone with the app's dark-first reality (this is the "darker and warmer"
  direction):
  - **Background:** `#050505` (cold) → **Ink `#23201A`** (warm near-black). This IS "darker and warmer."
  - **Surface / cards:** a warm step above Ink (Slate `#4A4438` low-opacity, or `#111111` warmed).
  - **Primary text:** Paper `#ECE4D3` / Clay `#E3D8C2` (≈ current `#F5F0E8`, warmer).
  - **Muted text:** Stone `#857B6A` (≈ current sage `#A5A99A`).
  - **ONE brand accent:** Stone accent **`#A86B43`** (≈ current amber `#D4A574`, more clay/terracotta).
  - **Guide rule — ONE accent, never two.** The app currently has 4 (amber + teal + red +
    amber-warning). Resolve: clay `#A86B43` = the single brand accent; **teal/red stay as
    FUNCTIONAL semantic signals** (success / danger / sold-out), used sparingly, NOT brand-level.
  - **Ember `#BC4A24`** = high-energy accent for **ACT / convert moments** (publish, accept job,
    convert-to-paid CTA) — louder than the clay base accent.
  - **Field moss `#5C6B36` / Sage `#73785C`** = community/local register (ENV.Food.Local
    vertical, "keep it local" surfaces) — specific contexts, NOT app-wide.
  - **Single highest-impact change:** cold `#050505` → warm Ink `#23201A` + one-accent discipline
    = ~80% of the field-guide feel. (Both are `theme.ts` token changes — the Day 30 sweep, not
    piecemeal; `theme.ts` is on the DO-NOT-TOUCH list mid-build.)

---

## Polish pass — DAY 30 (Pre-flight for the App Store)

> All cosmetic items below roll up into the single Teleoplexy field-guide sweep (see Brand
> section above) — they are not independent fixes. Don't patch them piecemeal mid-build.

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
- **Card editor — field-entry UX (Option 2)** — "+ Add a field" currently gives a blank
  self-named row (flexible but blank-slate friction). Better: suggested/placeholder fields per
  card type (capability → "what you do / where / rate"; event → "when / where") tappable to add
  pre-named, custom fields still allowed. Serves "vendor shouldn't think like a developer." Part
  of the card-editor-feel pass (alongside content-card distinct render).

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
- **Swipe-to-delete is an UNBUILT Day 12 deliverable** — `ProfileScreen.tsx` still carries the
  `{/* TODO(Day 12+): swipe-to-delete lands here. */}` seam and there is NO `deleteCard` in
  `CardContext` (confirmed `git log -S deleteCard` across all branches: nothing). The deliberate
  delete gesture (swipe + confirm) was never shipped. When it's built: it must COEXIST with the
  Day 13 one-tap 86 toggle on the SAME item row — **tap = 86 (light, no confirm); swipe = delete
  (deliberate, confirm)**. Don't let the swipe handler swallow the tap, and don't let the 86 tap
  trigger delete. Both gestures live on the fulfillable item row.
- **`updateCard` re-embeds unconditionally** — `CardContext.tsx` calls `triggerEmbedCard` on EVERY
  edit, including non-text edits (permission tiers, and the kind label) that don't change
  embedding text. Day 13's availability flip already routes around this via the dedicated
  non-embedding `setFieldAvailability`. Efficiency cleanup (separate scope): gate
  `updateCard`'s re-embed on whether title/field-content/kind actually changed, so a
  permission-only edit skips the wasted Cloudflare embed call. Low risk, pure optimization.
- **Card media + gallery are public-read (unguessable path) regardless of the card's see_perm** — a
  card gated to contacts/verified still has its IMAGE(S) publicly accessible to anyone with the URL
  (`card-media` bucket is `public = true`; see `supabase/migrations/0002_card_media_storage.sql`).
  Day 15 galleries reuse the SAME bucket and inherit the same tradeoff. Acceptable now (portfolio
  content is meant to be seen; no enumeration via unguessable paths). **Follow-on — see_perm-gated
  image access (cross-repo):** if private-card images become a requirement, move to a PRIVATE bucket
  + signed URLs (time-limited, minted on authorized card view). This is NOT single-repo: the
  hearth-network read path (`query_cards` / `get_card_details`) would have to MINT signed URLs at
  query time for the `media_url` / `gallery_image` values it returns, since the raw object paths are
  no longer publicly fetchable. Scope it as a deliberate cross-repo step, not a POS-only change.
  Logged, not built.
- **Gallery drag-to-reorder** — Day 15 supports add (appended in selection order) + remove; images
  display in stored order. Reordering existing gallery photos (drag handles) is deferred — a UI-only
  add (the data model is already an ordered `gallery_image[]`, so reorder is just rewriting the array
  order on save). Low priority; the vendor can remove + re-add to reorder today.
- **Gallery/media Storage orphan cleanup** — removing an image in the editor drops the
  `gallery_image` / `media_url` entry from the card's `fields` but does NOT delete the underlying
  Storage object (same as the Day 12.5 media-remove behavior). Orphaned objects accumulate under
  `card-media/{entity_id}/`. Acceptable now (storage is cheap, paths unguessable). Later: a reap on
  card save/delete (diff old vs new URL set → `storage.remove` the dropped ones) or a periodic sweep.
- **Fulfillable item price — UX + data shape (card-editor polish + Phase 5 prep)** — Day 13 ticks
  a field "Orderable item," but the value input still reads "value (in your words)" (describing-
  field language) and the price stores as FREE TEXT. A vendor building a menu isn't guided to
  enter a price, and "$16.15" persists as an unparseable string. Two linked pieces:
  (1) **UX** — when Orderable is on, relabel value → "Price" with a currency/number input +
  validation (numeric, sensible bounds). (2) **Phase 5 dependency** — payments need a STRUCTURED
  numeric price (minor units / decimal + currency) so Stripe can charge it; you cannot charge the
  string "$16.15". Design the structured price shape ONCE, properly, when wiring payments — don't
  bolt a parser onto free text later. Until then the 86 toggle works fine (availability is
  independent of price format). Part of the card-editor-feel pass; gates the Phase 5 order path.

---

## Done (move items here with commit hash when built)

- **Day 15 / Step 4.6 — Stored-image gallery content cards** — built across `35836be` (search
  hygiene: reserved-field embed exclusion + force-all backfill; [[BUG-006]]), `eea6d9e` (gallery
  data model: `gallery_image` reserved-field helpers), `964859e` (multi-image pipeline:
  `useGalleryUpload` + `expo-image-manipulator` compress + `uploadImageFromUri`), `b9b24a8` (UI:
  `GalleryGrid` + `ImageViewer` + editor/card wiring). **Option A** — repeated
  `{label:'gallery_image', value:<url>}` entries in the existing `fields` jsonb; ZERO
  hearth-network change (the network returns `fields` wholesale; gallery reconstructed by label
  filter). Count cap 12, on-device resize (longest edge 1600) + JPEG 0.7, take-what-fits at the cap.
  **Ops (Derrick):** (1) `npx expo prebuild` + rebuild the dev client — `expo-image-manipulator` is
  a NEW native module; (2) redeploy `embed-card` + `backfill-embeddings`; (3) run backfill
  `{ force_all: true }`, paging `next_cursor` until null, to clean existing `media_url`-polluted
  vectors. Deferred follow-ons logged above (see_perm-gated access, drag-reorder, orphan cleanup).
- **Day 12.5 — Real media upload for content cards** — built in `78e48e6`. Picker
  (expo-image-picker) → `card-media` Storage bucket (owner-writes-own RLS keyed by
  `{entity_id}/` path, public-read) → public URL written into the existing `fields.media_url`
  entry; render side unchanged. URL paste kept as a secondary fallback. Upload logic is reusable
  (`src/services/storage.ts` + `src/hooks/useMediaUpload.ts`) for Day 14. Indeterminate
  "Uploading…" spinner (no % — supabase-js upload has no progress callback). Ops: apply
  `supabase/migrations/0002_card_media_storage.sql` (`supabase db push`).
