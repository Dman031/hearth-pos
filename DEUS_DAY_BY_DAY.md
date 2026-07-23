# DEUS — DAY-BY-DAY BUILD PLAN (with prompts)
### 7 days/week · relative days · finish = App Store submission, demo on the real app

*The single file to build from. Each day: read it, copy its prompt, paste into a FRESH
Claude Code chat (start with "Read CLAUDE.md first"), let it run its investigate→build→verify
flow, commit locally, then come back to the strategy chat to checkpoint. One chat per day/step.*

---

## Standing rules (true every day)

- **One Claude Code chat per day's step.** Fresh chat each time. Commit locally at the end;
  don't push unless told.
- **Start every chat with** `Read CLAUDE.md first, then this:` before pasting the prompt.
  CLAUDE.md carries the bug protocol + architecture so each fresh agent has standing context.
- **Migrations are review gates.** When a prompt says "propose, don't apply," the agent shows
  you SQL — bring it to the strategy chat before it touches the live DB.
- **After any applied migration**, drop the .sql into the repo's `migrations/` folder so the
  repo stays the source of truth.
- **Repos are still named `hearth-network` and `hearth-pos`** (renaming breaks Claude Code).
  "deus-network" in a prompt = your `hearth-network` repo.
- **Two parallel clocks** (don't consume build-days): pilot vendor (start Day 3), Apple review
  (after Day 33).
- **Test fixture, live:** entity "Blue Hour Coffee" (deus_id 184203), a presence card + a Menu
  card, cortado `available:false`.

**Where you are:** Days 1–19 complete and merged to main.
Phases 1–4 done. Phase 5 open: Step 5.1 (commerce toggle + Connect) shipped and
verified live 2026-07-13; Step 5.2 (process_payment) shipped and verified
2026-07-20. **Start at Day 20 (Step 5.3 · MCP Apps inline payment sheet), then Day 21
(Step 5.4 · engagement model).**

> Position claims in this file go stale. Verify against the repos before acting on
> them. Ground truth: live repos → this file → session decisions.

---
---

## ~~Day 1 — Step 2.1 · Protocol core~~ ✅ DONE (commit 353934e)
## ~~Day 2 — Step 2.2 · Read tools~~ ✅ DONE (commit 5151c65)

---
---

# DAY 3 — Step 2.3 · Routing tools  ◀ START HERE
*Repo: hearth-network. Also: send the pilot-vendor outreach today.*

```
Read CLAUDE.md first, then this:

You are in hearth-network. Read tools (Step 2.2) work. Build the ROUTING tools — these
WRITE. Full delayed/cross-time thread state (Durable Objects) is DEFERRED; build the
immediate path + a simple inbound record now.

0. PROPOSE (do not apply) a migration for:
   - inbound: id, to_entity_id, from_entity_id, card_id, kind (reach/booking/order),
     message, status (pending/accepted/passed), return_address jsonb, created_at
   - threads: id, participant_a, participant_b, last_message_at, state
   Show me the SQL and STOP for approval before applying.

After I approve the SQL:
1. src/tools/reach-entity.ts — {from_entity_id, to_entity_id, card_id, message, kind}:
   validate the target card's act_perm (allow anyone/verified for now; leave the same
   one-line widen TODO as allowedSeePerms); write an inbound row recording return_address;
   create/locate a thread; logAudit "suggest"; return {thread_id, status:'pending'}.
2. src/tools/resolve-contact.ts (readOnlyHint:true) — {caller_entity_id, name}: find
   connected entities (connections table) matching name; return {entity_id, deus_id,
   summary}; logAudit observe.
3. src/tools/respond-thread.ts — {thread_id, from_entity_id, body, decision?}: append to
   thread, update inbound.status if decision given, route reply to return_address;
   logAudit "confirm" on accept; return {delivered:true}.
4. Wire all three into the dispatcher.

Verify with curl: seed two connected entities; resolve_contact finds one by name;
reach_entity creates an inbound; respond_thread accepts and routes back. Show me the rows.
Commit locally. Do not deploy.
```
**Verify:** inbound created, response routes back, resolve_contact works.
**Then:** bring the proposed migration SQL to the strategy chat first; after applying, drop it
into `migrations/`.

---

# DAY 4 — Step 2.4 · Real OAuth 2.1 + PKCE
*Repo: hearth-network. The OAuth tables already exist — wire to them.*

```
Read CLAUDE.md first, then this:

You are in hearth-network. All tools work behind a temporary bearer stub. Replace it with
real OAuth 2.1 + PKCE. NOTE: mcp_oauth_clients and mcp_oauth_tokens tables ALREADY EXIST in
Supabase — use them, don't recreate.

1. src/oauth/pkce.ts — generateCodeChallenge (S256), verifyChallenge, via Web Crypto API.
2. src/oauth/client-registration.ts — POST /oauth/register (RFC 7591): issue client_id
   (+secret), store in mcp_oauth_clients.
3. src/oauth/handler.ts — GET /oauth/authorize (consent screen, store PKCE challenge, issue
   code); POST /oauth/token (exchange code, verify code_verifier; support
   grant_type=refresh_token); store tokens in mcp_oauth_tokens with expiry.
4. src/middleware/auth.ts — validate Bearer against mcp_oauth_tokens, check expiry + scope,
   attach caller entity + verification tier to context. Read tools need 'read'; reach/respond
   need 'write'.
5. WIDEN the query-layer permissions (the Step 2.2/2.3 TODOs): verified-tier callers also see
   see_perm='verified' cards; callers connected to the owner see 'contacts' cards;
   reach_entity honors act_perm by tier. Keep the service-role/query-layer model.
6. Update /.well-known/mcp.json with the real OAuth URLs.

Verify end-to-end locally: register a client, run PKCE to get a token, call query_cards,
confirm a verified token sees a verified card an anon call doesn't, confirm expiry rejects,
confirm refresh works. Show me the flow. Commit locally. Do not deploy.
```
**Verify:** PKCE flow works; tier enforcement correct; expiry/refresh work.

---

# DAY 5 — Step 2.5 · Deploy + connect to Claude  ★ PHASE 2 MILESTONE
*Repo: hearth-network. Then a manual step in Claude.*

```
Read CLAUDE.md first, then this:

You are in hearth-network. Everything works locally. Ship and prove it.
1. Confirm wrangler config: worker name + custom-domain route if the domain's ready. Report
   the deploy URL.
2. Confirm Cloudflare secrets are set (names only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
   OAUTH_SIGNING_KEY, + any others referenced.
3. wrangler deploy.
4. Verify live with curl: /.well-known/mcp.json (tools + OAuth URLs), the initialize handshake,
   query_cards returns Blue Hour Coffee.
Report the live URL + curl outputs.
```
**Then by hand:** Claude → Settings → Connectors → Add custom connector → paste the live
`mcp.<domain>` URL → OAuth consent → ask *"find me a coffee shop on Division."*
**Milestone:** Claude returns Blue Hour Coffee. **Phase 2 done.** (Deploy/connector friction may
eat the day — normal.)

---
---

# DAY 6 — Step 3.1 · Account spine + Deus ID
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Read the existing auth (useAuth, the Supabase client). The entities
table exists (one login = one entity, user_id unique).
1. On signup (existing email/password auth), create an entities row tied to auth.uid() via
   user_id. Collect display_name, email, phone.
2. Phone verification: SMS round-trip (reuse the existing SMS path if present; else
   Supabase/Twilio OTP). Mark phone confirmed on the entity.
3. Mint a 6-digit deus_id: unique, zero-padded, collision-checked, extensible past 1M. Store
   on the entity. Surface it ("this is you — 184203, save it").
4. A useEntity() hook returning the current user's entity + update fns.
Verify: sign up → entities row with user_id, phone confirmed, unique 6-digit deus_id shown.
Existing login still works. Commit locally.
```

---

# DAY 7 — Step 3.2 · ID verification (Stripe Identity)
*Repo: hearth-pos. stripe.ts is empty today — build it.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Stripe is config-only today (empty stripe.ts) — build it.
1. src/services/stripe.ts: initiate Stripe Identity hosted verification (doc + selfie). Store
   ONLY the verdict, never the document.
2. A Supabase Edge Function webhook receives the Identity result → set entities.id_verified
   = true.
3. Surface a "verified human" badge on the profile when true.
4. This is prompted just-in-time (when a user makes a card needing verified tier), NOT at
   signup. Build the flow; wire the trigger in Phase 4.
Verify: run Identity in test mode → webhook flips id_verified → badge appears. Commit locally.
```

---

# DAY 8 — Step 3.3 · Credential verification (tiered)
*Repo: hearth-pos. Also: confirm a pilot vendor is committed by end of today.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Business verification via Stripe Connect for business entities → set business_verified.
2. A license field + manual-verify path for regulated entities (doctor/etc.) → set
   credential_verified (API where one exists, manual queue otherwise).
3. Lock a card's higher permission (see/act = verified/anyone) until the card's
   verification_required is satisfied by the entity's matching verified flag.
Verify: a card with verification_required='license' can't go live until credential_verified.
Commit locally.
```
**Phase 3 done.**

---
---

# DAY 9 — Step 4.1 · App shell + navigation
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Reuse the existing theme/design tokens and Supabase client.
1. Four-tab nav: Profile / Incoming / Contacts / Identity (replaces old Home/Inbox/Jobs/Money).
2. Apply Deus brand: the carved wordmark over the existing dark-warm tokens.
3. Point the Supabase client at the card model (entities/cards). Client already exists.
Verify: app launches, four tabs navigate, brand applied, connects to Supabase. Commit locally.
```

---

# DAY 10 — Step 4.2 · Onboarding warm-up
*Repo: hearth-pos. Reuse the existing conversational UI; rewrite the script.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. REUSE the existing conversational onboarding UI (bubbles, thinking
states, pacing). REPLACE its template-classify logic with the card flow. This is a scripted
helper, NOT an agent — scripted questions, seeds cards, then disappears.
Flow:
1. Mission line first: "we built it to connect people — not replace them..."
2. Create the entity (email+phone, from Phase 3), mint + show the Deus ID.
3. Build the FIRST card: "what's one thing you'd want someone — or someone's assistant — to be
   able to find you for?" Their answer becomes a card (title + fields in their words). NO
   classification into a template.
4. Set who's allowed — framed as PRIVACY, not schema: "who can see this? who can act on it?"
5. Offer 1–2 more cards. Then hand off and never run again.
Verify: a new user finishes in ~3 min with 2–3 real cards + a Deus ID, having set permissions,
without the word "schema." Commit locally.
```

---

# DAY 11 — Step 4.3 · Profile tab — part 1
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Build the Profile tab, part 1 of 2.
1. Card list render: title, fields, two permission pills (see + act).
2. Card editor sheet: rename a card, add/name/remove user-named fields.
Verify: view your cards; create a card; rename it; add and remove fields. Commit locally.
```

---

# DAY 12 — Step 4.3 · Profile tab — part 2
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Profile tab, part 2 of 2.
1. Card flavors: capability / state / content / event (content shows media; event shows
   time+place).
2. Permission control: see (off/contacts/verified/anyone) + act (off/contacts/verified), with
   the verification lock (can't pick a tier the entity isn't verified for).
3. ⊕ add card; swipe-to-delete; identity block at top.
Verify: create cards of each flavor; set permissions; a verified-gated card is locked until
the entity is verified; add + delete work. Commit locally.
```

---

# DAY 13 — Step 4.4 · Availability / 86 toggle
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. On fulfillable cards (fields with an `available` flag — menus, services, slots), a per-item
   toggle: one tap marks sold-out / restores.
2. 86'd items grey out with an "out" tag. SOFT and reversible — a distinct gesture from delete
   (delete is a deliberate swipe-with-confirm).
Verify: tap an item → available flips in the DB; it greys out; one tap restores; the price is
remembered. Commit locally.
```

---

# DAY 14 — Step 4.5 · Menu upload → cards
*Repo: hearth-pos. Reuse the Edge-Function model-call pattern.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. REUSE the Edge-Function model-call pattern.
1. Upload a photo / PDF / link of a menu (or speak it).
2. Vision-model parse (server-side via Edge Function) → fields with names, prices,
   available:true. Produces the SAME fulfillable card a person would build by hand.
3. Confirm screen: owner reviews, fixes errors, sets who-can-order, publishes. SST: parse
   proposes, human commits — nothing publishes unread.
Verify: a photographed menu becomes a Menu card with priced fulfillable fields after the owner
confirms. Commit locally.
```

---

# DAY 15 — Step 4.6 · Stored-image content cards
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Supabase Storage bucket; access RLS tied to the card's see_perm.
2. Expo image picker + on-device resize/compress + upload (handle large files, retries).
3. Thumbnail grid on the content card + full-view tap.
4. Content cards return image URLs + describing fields in query results (images shown AFTER a
   match; matched on describing fields). Auto-description of images is DEFERRED.
Verify: upload images to a content card; they display in a grid; query returns the URLs +
describing fields. Commit locally.
```

---

# DAY 16 — Step 4.7 · Incoming tab (glass tiles)
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Realtime inbound feed (Supabase Realtime on the inbound table from Day 3).
2. Three tile types — Reach / Booking (teal/confirm) / Order — SAME accept/deny mechanic,
   different button labels (Start it·86 / Accept·Counter / Open·Pass).
3. Respond / Pass / Confirm → coral "receipt" on execute. SST: nothing auto-acts.
Verify: an inbound created via the network appears in Incoming within seconds; accept/deny
routes a response back. Commit locally.
```

---

# DAY 17 — Step 4.8 · Contacts + Identity tabs  ★ PHASE 4 DONE
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Contacts: saved entities (name + Deus ID + what-they-do), tap to view/reach. Backed by the
   connections table.
2. Identity tab: email, phone, Deus ID, verified badges.
3. Shareable verified-ID surface (QR / "present my Deus ID") — reveals the verdict, not docs.
Verify: add a contact; it appears and is reachable; identity tab shows badges; QR renders.
Commit locally.
```
**Phase 4 done — the app is whole.**

---
---

# DAY 18 — Step 5.1 · Commerce toggle + Connect  ✅ DONE (2026-07-13)
*Repos: hearth-pos (toggle UI) + hearth-network (charge logic).*

> **Closed.** Migration 0014 (price_cents / price_currency / commerce_terms +
> `set_card_commerce` SECURITY DEFINER RPC, gate = entity_stripe_accounts row AND
> entities.business_verified). Worker: commerce fields on `get_card_details`,
> `/connect/return` + `/connect/refresh` pages. hearth-pos: commerce section in
> CardEditorSheet, toggle is the Connect onboarding launch point, writes via RPC only.
> Verified live end-to-end: toggle → Express onboarding → return page → `account.updated`
> → webhook → `business_verified` → RPC-accepted enable → card d7b767e8 served
> `price_cents: 1250` to an external LLM over the live MCP server. Negative tests held
> (RPC refused every enable while unverified; zero grandfathered rows).
> See BUG-007 (esm.sh→npm: specifier) and BUG-008 (webhook endpoint created without
> Connect scope) in BUGS_AND_SOLUTIONS.md.

```
Read CLAUDE.md first, then this:

You are working across hearth-pos and hearth-network.
1. Per-card commerce toggle: off = declaration, on = transactable. (hearth-pos)
2. When toggled on, just-in-time Stripe Connect Express onboarding for the entity (hosted
   flow). Identity is already verified, so it's a short hop. Store the connect account id.
3. Price/terms fields surface on the card when commerce is on.
Verify: toggle a card on → Connect onboarding completes → account id stored → price fields
appear. Commit locally.
```

---

# DAY 19 — Step 5.2 · process_payment + imprint  ✅ DONE (2026-07-20)
*Repo: hearth-network.*

```
Read CLAUDE.md first, then this:

You are in hearth-network. Build the payment tool. Money NEVER touches Deus.
1. src/tools/process-payment.ts: create a Stripe PaymentIntent with amount,
   application_fee_amount (1.5%), transfer_data.destination (the entity's Connect account), an
   idempotency key, and a capture_method:manual option for deposits. Fire ONLY at
   confirmed-amount + confirmed-authorization.
2. transactions table (reuse the existing one) + write the Deus imprint to audit_log (full
   observe/suggest/confirm/execute provenance).
3. Human-confirm gate before any charge (SST two-gate). The PaymentIntent IS the "execute".
Verify (Stripe test mode): a confirmed booking charges, 1.5% fee taken, net routed to the
entity's Connect account, transaction + imprint recorded, idempotency prevents double-charge.
Commit locally.
```

**Design note (2026-07-20, informs Day 22):** Acceptance is per-inbound, not per-thread.
One thread carried three reaches — a hike (passed), and a catering order (accepted, paid).
`thread.state` stays `'open'` while individual inbounds resolve independently. The Day 22
engagement model must bind an engagement to a specific inbound (order/booking), so one
conversation can produce multiple independently-tracked engagements. `process_payment`
already gates on inbound status correctly. (An earlier BUG-009 suspicion was a misread of
thread-level state — investigated, not a bug; see the Day 19 note in BUGS_AND_SOLUTIONS.md.)

---

# DAY 20 — Step 5.3 · Inline payment sheet (MCP Apps)  ✅ SHIPPED [CLOSED 2026-07-22]
*Repo: hearth-network. Branch: day20-payment-sheet.*

> **What shipped (not what was planned — the plan forked twice on evidence):**
>
> **Fork verdict: BLOCKED.** Probe on Claude Desktop 2026-07-21 — script
> js.stripe.com LOADED, fetch api.stripe.com PERMITTED (HTTP 401), element
> mount BLOCKED, three securitypolicyviolation events reading
> `frame-src ← js.stripe.com`. Claude honors resourceDomains and
> connectDomains, NOT frameDomains. Payment Element cannot render in the
> sandbox; the sheet ships as LINK + QR.
>
> **Mechanism A replaced "hosted Stripe payment link."** No Stripe-hosted
> surface (Payment Link / Checkout Session) can attach to a pre-created
> PaymentIntent — since API 2022-08-01 their intent exists only after
> checkout completes — so the webhook's `stripe_payment_intent_id` match
> could not be satisfied. Shipped shape: intent-first (unconfirmed
> PaymentIntent at request time, ledger row written immediately) + a
> worker-served checkout page at `GET /pay/:transaction_id`.
>
> **Shipped:** `request_payment` (Day 19 guards reused verbatim via
> `payment-guards.ts`); the public `/pay` page with Stripe Payment Element
> (card data browser→Stripe, worker holds only intent id + client_secret);
> `ui://deus/payment-sheet.html` (link + QR, vendored qrcodegen MIT,
> ZERO external CSP domains); `_meta.ui.resourceUri` on request_payment;
> `structuredContent` on the tool result; an authorized additive 'execute'
> imprint in stripe-webhook.ts (payment_intent.succeeded branch only,
> non-fatal, fed by the existing row lookup); probe teardown; and a
> tool-description overhaul for agent legibility (buyer-voiced payment
> tools, thread_id provenance, grounding-source statements; rename
> request_payment→start_checkout DEFERRED with trigger — see DEFERRED.md).
>
> **Live verification:** request_payment fired on Grok and Claude; the same
> idempotency key returned an identical link and a single ledger row across
> both hosts; a human paid on /pay; the untouched webhook reconciled to
> succeeded in under a second; all three guard denials rejected before any
> Stripe call. Provenance ladder verified end to end on transaction
> 83fc28b8 — suggest 03:26:32 (requires_payment_method) → execute 03:27:23
> (succeeded), same intent, detail.tool 'request_payment' on both.
>
> **Commit chain:** fbe9828 → 63b7fcb → 5dbb2be → ea02c0a → 95e3048 →
> fc5ffe0 → a9bf478 → 42b58ac → b366dc1.

---

# DAY 21 — Step 5.4 · Engagement model + structured accept  [AMENDED 2026-07-21]
*Repos: hearth-network (schema, RPCs, writers) + hearth-pos (accept UI, tab).*

> **Was the ACP/AP2 interop buffer; now the engagement build.** Interop posture
> retained as a one-line stance: ACP/AP2/UCP all bind to MCP; integrate a
> specific protocol only when it becomes a real distribution channel. This day
> builds the commitment layer Day 19 proved missing.
>
> **STOP-0 DECISIONS (locked 2026-07-21 — do not re-litigate):**
> - **Separate `engagements` table** — NOT an extension of inbound. Decisive
>   reasons: (1) inbound's FKs are all ON DELETE CASCADE — deleting a card would
>   destroy paid commitments; converting the posture in place breaks the frozen
>   app contract. (2) An engagement needs an `agreed_price_cents` snapshot taken
>   at accept time — process_payment charges the card's CURRENT price_cents, so
>   a vendor price-edit between accept and payment silently diverges from what
>   was agreed; the knock record has nowhere to hold the snapshot. (3) Keeps
>   inbound.status single-writer instead of dragging the Stripe webhook into the
>   consent table. Engagement FKs are ON DELETE SET NULL — the commitment
>   outlives its referents, mirroring 0016's money-record posture.
> - **Created inside respond_to_inbound's accept branch**, same transaction,
>   strictly 1:1 with its inbound (`inbound_id UNIQUE`).
> - **States:** accepted → paid → fulfilled; cancelled terminal (from accepted;
>   from paid only via the refund policy below). `scheduled_for` is an
>   ATTRIBUTE (timestamptz), never a state — payment and scheduling have no
>   fixed order. Unpriced engagements skip paid (accepted → fulfilled). The
>   product flow is DEPOSIT-THEN-SCHEDULE.
> - **Kinds that spawn an engagement on accept: `booking` + `order` only.** A
>   plain accepted reach is promoted to an engagement later, only when a
>   schedule is attached — no auto-engagement for every hello.
> - **transactions gains `engagement_id`** (uuid, references engagements, on
>   delete set null). Engagement→transactions is 1:N (failed charge + retry;
>   deposit + balance under capture_method manual). The FK lives on
>   transactions; never a single transaction_id on the engagement. The
>   (thread_id, card_id) pair is NOT a sufficient join — threads_pair_unique
>   means a repeat order reuses the identical tuple.
> - **Cancellation & refund policy (verbatim):** An engagement requiring a
>   deposit may be cancelled by either party. Cancelled 14 or more days before
>   `scheduled_for` → deposit refunded in full (Stripe refund of the original
>   PaymentIntent, platform fee returned, engagement → cancelled). Cancelled
>   fewer than 14 days before `scheduled_for`, or with no `scheduled_for` set →
>   deposit non-refundable; engagement → cancelled, transaction stands.
>   Engagements without a deposit cancel at any time with no financial effect.
>   The 14-day boundary is evaluated at the moment the cancel request is
>   received, in the vendor's timezone.
> - **`completed_transaction_count`** (the Day-22 paywall feed; today has ZERO
>   writers) is incremented by the complete_engagement RPC on the fulfilled
>   transition.
> - **Vocabulary boundary:** "engagement" is INTERNAL ONLY (schema, MCP tools,
>   docs). The app never shows it. UI uses the kind noun — Order / Booking /
>   Plan (a scheduled accepted reach) / Trial (future). Vendor-side status
>   words: Accepted / Paid / Done / Cancelled. Never "fulfilled" or
>   "lifecycle" in the app.
> - **Surface:** the 5th bottom tab is **Engagement** — bottom bar becomes
>   Profile / Incoming / PlexChat / Engagement. A CALENDAR view lives INSIDE
>   the Engagement tab, rendering all engagements by scheduled_for. CONTACTS
>   and MONEY (balance / payouts / earnings / transaction history) both move
>   OFF the bottom bar into the top-corner cluster alongside Settings and
>   Sign-out. Money is a corner utility, not a tab.
> - **The Josh fix:** the structured Accept/Decline must ALSO appear as a
>   pinned, kind-aware banner INSIDE PlexChat on the relevant thread ("Accept
>   order — $12.50"), not only as a tile in Incoming. The Day-19 failure mode
>   was the accept control sitting in a different tab from where the vendor was
>   looking, so he answered in prose.
>
> **DAY 20 CLOSE-OUT EVIDENCE (2026-07-22) — what forces this day's scope:**
> - **Structured accept.** Thread 621e521a contains "I accept what's the
>   order" — an acceptance with no order in it. The payment guard passed on a
>   contentless acceptance. Acceptance must name what was accepted, quantity,
>   and total.
> - **Cold-start enumeration (PRIORITY).** An authenticated agent cannot list
>   its threads, pending inbounds, or accepted-unpaid orders without already
>   holding a thread_id. Verified 2026-07-21: the agent asked the user for
>   the reference and could not proceed. Descriptions cannot fix this; it
>   needs a read tool.
> - **Multi-item card pricing.** Cards carry one price_cents; Blue Hour's
>   Menu lists four priced items and is unpayable.
> - **Open question: seller-initiated payment does not exist** (caller is
>   always buyer, seller derives from the card). A seller billing a buyer
>   after accepting is arguably the more natural commerce flow.

```
Read CLAUDE.md first, then this. Build the engagement model. Rooted in
hearth-network; hearth-pos sibling at ../hearth-pos. Branch: engagements.
Build in stops; each stop ends with a report and Derrick's approval. Nothing
to main unverified. Derrick applies migrations, deploys, and pushes by hand.

STOP 1 — MIGRATION 0017 (file only; Derrick hand-applies).
  ls migrations/ first; confirm 0017 is next. House style + apply-once note
  per 0016. Contents:
  - engagements table: id uuid pk; inbound_id uuid UNIQUE references
    inbound(id) on delete set null; kind; buyer_entity_id / seller_entity_id /
    card_id / thread_id (all uuid, on delete set null — snapshot posture);
    agreed_price_cents integer null (null = unpriced, never a placeholder);
    currency text default 'usd'; status engagement_status not null default
    'accepted'; scheduled_for timestamptz null; fulfilled_at timestamptz null;
    cancelled_at timestamptz null; created_at / updated_at.
  - create type engagement_status as enum ('accepted','paid','fulfilled',
    'cancelled').
  - RLS: on; service-role backstop; vendor-side select policy so the pos
    Engagement tab can read own rows (either participant).
  - alter table transactions add column engagement_id uuid references
    engagements(id) on delete set null.
  - respond_to_inbound v3: accept branch, for kind IN ('booking','order'),
    inserts the engagement in the same transaction — snapshotting the card's
    current price_cents into agreed_price_cents at that moment.
  - Backfill: insert engagements for already-accepted booking/order inbounds
    (test-era rows, including c2ef5c08). Idempotent (on conflict inbound_id
    do nothing).
  Show the file. STOP. Derrick ls's, verifies, applies in the SQL editor,
  confirms applied.

STOP 2 — NETWORK WRITERS (hearth-network).
  - process_payment: it already resolves the exact accepted inbound row;
    resolve inbound→engagement (unique inbound_id) and stamp engagement_id on
    the transactions insert.
  - Payments webhook: extract one canonical markEngagementPaid(stripe_pi) that
    walks pi → transactions.engagement_id → engagement, advances accepted→paid.
    Never regress a terminal state (copy the discipline already in
    stripe-webhook.ts for transactions).
  - complete_engagement SECURITY DEFINER RPC: owner check (seller), sets
    fulfilled + fulfilled_at, increments completed_transaction_count.
  - cancel_engagement SECURITY DEFINER RPC: either participant. Enforces the
    refund policy: if agreed_price_cents is null → cancel free. Else if
    scheduled_for is set AND now() <= scheduled_for - interval '14 days' →
    full Stripe refund of the successful transaction (+ fee return) then
    cancelled; else cancelled with no refund. cancelled_at stamped.
  - Audit imprint on every transition. tsc clean. Show diffs. STOP.
  Derrick deploys.

STOP 3 — POS ACCEPT UI (the Josh fix).
  - InboundTile goes kind-aware: for booking/order fetch the card via
    inbound.card_id, show title + price_cents + terms; accept button reads
    "Accept order — $X" / "Accept booking — $X" (or no price when unpriced).
    Same respond_to_inbound RPC; pass explicit p_inbound_ids.
  - PlexChatScreen: pinned banner above the composer for pending inbounds on
    this thread addressed to me — kind-aware accept/decline in the
    conversation itself. After accept, the same slot shows the status chip
    (Accepted → Paid → Done).
  Bundle rebuild. Show diffs. STOP. Derrick device-verifies.

STOP 4 — POS ENGAGEMENT TAB + RELOCATIONS.
  - Bottom bar: replace Contacts with Engagement (Profile / Incoming /
    PlexChat / Engagement). Badge = engagements needing action.
  - Engagement tab: list view (Upcoming / Past filters; kind nouns Order /
    Booking / Plan; status chips Accepted / Paid / Done / Cancelled; schedule
    line when scheduled_for set; amount when priced, "No charge" when not)
    PLUS an in-tab Calendar view rendering all engagements by scheduled_for.
  - Top-corner cluster (with Settings + Sign-out): add Contacts AND a Money
    surface (available balance, pay out, earnings summary, transaction
    history — each line tracing to its engagement).
  Field palette throughout; reuse existing card/list styling. Bundle rebuild.
  Show diffs. STOP. Derrick device-verifies, then merges and pushes.
```

---

# DAY 22 — Step 5.5 · Money surface + paywall + branded checkout  ★ PHASE 5 DONE
*Repo: hearth-pos.*

The engagement model landed Day 21; this day ships the funds surface (top-corner Money: balance / payouts / earnings / history), the transaction-10 → $50/mo paywall — now actually fed by completed_transaction_count via the fulfilled transition — and branded checkout polish.

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Money tab: earnings summary, transaction history with fee breakdown, payout status.
2. completed_transaction_count → at 10, auto-activate a $50/mo Stripe subscription; notify with
   value proof.
3. Brand the Stripe-hosted Checkout page (amber/dark) — the fallback surface for Claude/SMS
   strangers where ACP/AP2 don't reach.
Verify: earnings display; transaction 10 triggers the subscription; the hosted page looks Deus.
Commit locally.
```
**Phase 5 done — entities are payable across surfaces.**

---
---

# DAY 23 — Step 6.1 · SMS gateway core
*Repo: hearth-network.*

```
Read CLAUDE.md first, then this:

You are in hearth-network. Build the SMS gateway. It is a SWITCHBOARD: it interprets only
enough to ROUTE; it never advises, plans, or recommends.
1. One inbound number (Twilio/SendBlue). Phone number → entity lookup (or "ghost" if none).
2. Intent parsing — scoped intents only (query / reach / book). Resolve who/what they want,
   route it, get out of the way. NOT arbitrary conversation.
3. Outbound routing + threaded replies from the same number (ties into the Day 3 thread model).
Verify: text "find a coffee shop on Division" → it queries the network → texts back Blue Hour
Coffee. It does NOT try to chat or advise. Commit locally.
```

---

# DAY 24 — Step 6.2 · Text-to-download funnel  ★ PHASE 6 DONE
*Repos: hearth-network + hearth-pos.*

```
Read CLAUDE.md first, then this:

You are working across hearth-network + hearth-pos.
1. Track free-interaction count per phone number.
2. After ~2 real replies, insert the download prompt: "add Deus so they can reach you" — value
   first, gate at peak interest. (Reachability is the mechanic AND the growth loop.)
3. Booking-by-text completes for immediate cases (Reply YES → done) without the app.
Verify: a stranger texts, gets value, then sees the download prompt at the right moment; an
immediate booking completes by text. Commit locally.
```
**Phase 6 done.**

---
---

# DAY 25 — Step 7.1 · End-to-end wiring — part 1
*Both repos.*

```
Read CLAUDE.md first, then this:

You are working across both repos. Wire the full immediate round-trip.
The flow: order/request in an agent → query_cards → reach/confirm → process_payment → imprint.
Coffee-style: the session stays open, the reply is the agent's next message. Pay INLINE via ACP
in ChatGPT.
Verify: the round-trip completes start to finish in one open session, money moves (test mode),
imprint recorded. Commit locally.
```

---

# DAY 26 — Step 7.1 · End-to-end wiring — part 2 (cross-LLM)
*Manual + both repos.*

```
Read CLAUDE.md first, then this:

You are working across both repos.
Manually connect the network to Claude + ChatGPT + Grok (custom connectors). Run the SAME flow
(query → reach/confirm → pay → imprint) through all three. Inline pay via ACP in ChatGPT;
Stripe link in Claude/Grok.
Verify: the same booking completes through three different agents; no double-charges; the
imprint is correct each time. Document any per-agent quirks. Commit locally.
```

---

# DAY 27 — Step 7.1 · The integration wall
*Both repos. This day exists because this ALWAYS overruns.*

```
Read CLAUDE.md first, then this:

You are working across both repos. Hunt and fix the integration-wall bugs:
- OAuth token expiry mid-flow
- webhook double-fire
- idempotency on retried payments/bookings
- race conditions (two agents hitting the same card/inbound)
Go through the full round-trip repeatedly under each failure condition and fix what breaks.
Verify: the loop survives token expiry, duplicate webhooks, and retries without double-charging
or corrupting state. Commit locally.
```
**If this day comes in clean, you're a day ahead. It usually doesn't — that's why it's here.**

---

# DAY 28 — Step 7.2 · Pilot vendor live run
*Not a coding day — a real-world day. The vendor you started talking to on Day 3.*

- Onboard the real Portland vendor onto the live app, watching, in person if possible.
- Build their real cards (a menu via upload is the strong demo).
- Run 3–5 real test orders/bookings through the live loop with them.
- Log every friction point; fix the small ones same-day.

---

# DAY 29 — Step 7.2 · Record the demo  ★ THE FUNDABLE ARTIFACT
*Recording day.*

- Record the clean end-to-end: real verified vendor, an agent query → book → pay → imprint,
  ideally across two-three agents (the cross-LLM proof).
- This is the artifact the raise rests on. Get a clean take. Get a vendor quote if you can.

**Phase 7 done — the demo exists.**

---
---

# DAY 30 — Phase 8 · Pre-flight for the App Store
*Repo: hearth-pos. Apple Developer account must be active — start it days before if not.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos. Prepare the app for App Store submission (build config + assets, not
features).
1. App icon (the Deus carved mark), splash screen, app.json / eas.json config, bundle identifier.
2. Privacy labels content: enumerate exactly what data is collected (email, phone, the
   ID-verification verdict) — be accurate.
3. Final UX pass: empty states, loading states, error states everywhere; run the full
   onboarding on a real device once.
Verify: tsc clean, app builds, icon/splash/config correct, privacy data inventory accurate.
Commit locally.
```

---

# DAY 31 — Phase 8 · EAS production build + TestFlight
*Repo: hearth-pos.*

```
Read CLAUDE.md first, then this:

You are in hearth-pos.
1. Run `eas build --platform ios --profile production`.
2. Upload to TestFlight.
3. Install on a real iPhone; run a full flow on the physical device (onboarding → build a card
   → menu upload → receive an inbound → a test payment).
4. Fix whatever only shows up on-device.
Report the build result + what the on-device run surfaced. Commit fixes locally.
```

---

# DAY 32 — Phase 8 · Slack / on-device fixes
*Buffer day. If TestFlight was clean, you're a day ahead.*

Use this for whatever Day 31's device run surfaced. No new prompt unless there are bugs — if
so, give Claude Code the specific bug with repro steps and let it run the bug protocol.

---

# DAY 33 — Phase 8 · App Store submission  ★ THE FINISH LINE
*App Store Connect (mostly manual) + final build.*

- App Store Connect listing: name, subtitle, description, screenshots (Profile, a built card,
  the menu-upload flow, the Money tab), category (Business or Lifestyle), support URL.
- Attach the production build. **Submit for review.**
- **Then the parallel clock you don't control:** Apple review — typically a few days, can bounce
  back for fixes. Respond fast to any reviewer feedback. Not a build-day.

**Finish line for building: the Deus app is submitted to the App Store, and the demo runs on
that real app.**

---
---

## The arc

| Days | Phase | Lands on |
|------|-------|----------|
| 3–5 | 2 · Network | Claude returns Blue Hour Coffee live |
| 6–8 | 3 · Identity | signup → verified entity + Deus ID |
| 9–17 | 4 · App | the app is whole |
| 18–22 | 5 · Payments + ACP/AP2 | entities payable inline across agents |
| 23–24 | 6 · SMS | any phone reaches the network |
| 25–29 | 7 · Demo | the fundable recording |
| 30–33 | 8 · Ship | submitted to the App Store |

**~31 build-days from Day 3 → ~4.5 weeks at 7/week**, then Apple's review clock. Plan for slip
into a Week 6 — the slack is at Day 27 (integration wall) and Day 32 (on-device bugs).

**The two clocks no building speeds up:** the pilot vendor (start Day 3, need them Day 28) and
Apple review (after Day 33). Start the vendor conversation the same day you start Day 3.

*Deus · Day-by-Day with prompts · one chat per day · finish = App Store submission.*
