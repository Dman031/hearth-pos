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

> **STOP numbering amended 2026-07-23** — catch_me_up inserted at 3, POS stops
> shifted to 4/5. Any prompt citing "roadmap STOP 3" before this date means the
> POS accept UI.

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
>   [AMENDED 2026-07-24 — STOP 5 vocabulary ruling] The tab is called
>   **Engagement**; "engagement" is the product noun and may appear in UI
>   strings. The internal-only rule NARROWS to MCP/protocol language —
>   inbound, thread_id, RPC, kind, entity_id — which never appear in
>   anything a user reads. Status words unchanged: Accepted / Paid / Done /
>   Cancelled; never "fulfilled" in the app.
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

> **STEP 0 RULINGS (locked 2026-07-23 — do not re-litigate):**
> - **(a) ENUMERATION TOOL — name `catch_me_up`**, not get_my_threads: the
>   tool exists because agents failed to navigate to state, so its name is the
>   phrase users say. Description in the Day 20 legibility voice, opening
>   "YOU, the caller, ask this for your own current state on the network",
>   listing trigger phrases: 'catch me up', 'what's waiting for me', 'my
>   threads', 'my orders', 'did they accept', 'pick up where I left off'.
>   Ships at STOP 3, AFTER 0017, so the engagement field is in v1 rather than
>   a retrofit. Identity-only: no required args, optional limit (default 50,
>   clamped per get_messages). Anonymous token errors per resolve_contact
>   precedent. readOnlyHint.
>
>   Return shape, ordered by last_message_at desc:
>   ```
>   { count, threads: [{ thread_id, state, established, last_message_at,
>     peer: { entity_id, display_name, deus_id, entity_type,
>             id_verified, business_verified, credential_verified },
>     pending_inbounds: [ ... ],    -- ARRAY, not a single newest
>     engagements:     [ ... ] }] } -- ARRAY, not a single row
>   ```
>
>   [AMENDED 2026-07-24] Peer block widened from four fields to seven.
>   Verification flags are already public via ENTITY_PUBLIC_SELECT and
>   get_card_details; withholding them left an agent deciding whether
>   to surface a stranger's knock on a display name alone. No new leak
>   surface — these are the remaining columns of an allow-list this
>   tool already reads.
>
>   [AMENDED 2026-07-24] pending_inbounds direction: addressed-to-me only
>   (to_entity_id = caller, status = 'pending'); the caller's own
>   sent-and-still-pending reaches appear as bare threads. Rationale: this
>   is what Incoming shows, and the consent standard is that enumeration
>   shows the caller what its own app already shows it.
>
>   ARRAYS ARE LOAD-BEARING. The Day 19 design note in this file is locked:
>   acceptance is per-inbound, not per-thread; one live thread carried three
>   reaches (hike passed, catering accepted and paid) and one conversation can
>   produce multiple independently-tracked engagements. A singular "newest
>   pending" under-reports exactly that thread.
>
>   PER-ITEM HANDLE. Each pending inbound carries a stable handle so an agent
>   can accept a NAMED item. Today respond_thread resolves the target
>   internally as newest-pending-wins (respond-thread.ts:85-137), which is
>   what produced "I accept what's the order" on thread 621e521a. Under 0017
>   that heuristic now picks which engagement gets created and which price is
>   snapshotted — on a multi-reach thread an agent can accept the hike and get
>   an engagement for the catering, and the re-anchored guard 3 passes cleanly
>   because an accepted engagement with a non-null agreed_price_cents exists.
>   The guard hardens against contentless accepts, not mis-targeted ones. POS
>   already passes explicit p_inbound_ids; the agent surface must be able to
>   do the same.
>
>   THREAD-KEYING CAVEAT (STEP 0 query, answered 2026-07-23): every inbound
>   row is born with a non-null thread_id — the single insert site
>   (reach-entity.ts:253) runs after locateOrCreateThread and no migration RPC
>   inserts inbound rows. But inbound.thread_id is ON DELETE SET NULL
>   (0001:51), so a pending inbound CAN be orphaned by a thread deletion —
>   schema-possible, code-impossible today (nothing deletes threads).
>   catch_me_up may key on threads; it must not assume thread_id is non-null
>   forever.
>
>   CONSENT STANDARD (keep this sentence in a code comment at the handler):
>   enumeration shows the caller what its own app already shows it — nothing
>   pre-consent. A thread exists only because a reach already passed the
>   directional contacts gate; a pending inbound is already rendered to this
>   same entity in Incoming. Service-role client, participant gate in the
>   query layer (participant_a = me OR participant_b = me), same model
>   get_status/get_messages use. No RLS change, no definer RPC, no migration.
>
>   MUST NOT LEAK: non-participant threads (filter in the query, never
>   post-hoc); peer fields beyond the public five (never email, phone,
>   user_id); read_at; message bodies other than the pending inbound's own
>   knock text (this is an index, get_messages is the transcript); anything in
>   the forbidden financial set; and no entity discoverable through it that
>   the contacts gate protects.
> - **(b) GUARD 3 RE-ANCHOR** — resolve inbound → engagement (inbound_id is
>   unique), require engagement.status = 'accepted' AND agreed_price_cents IS
>   NOT NULL, validate the amount echo against engagement.agreed_price_cents —
>   the snapshot, never the card's live price. Guard 2 keeps card-exists /
>   commerce_enabled / no-self-pay and LOSES amount authority. Both payment
>   tools' amount_cents descriptions name the snapshot as authority, same
>   commit. Unpriced engagements remain unpayable by this path — correct, not
>   a gap.
> - **(c) SELLER-INITIATED PAYMENT** — consciously deferred. See DEFERRED.md.

```
Read CLAUDE.md first, then this. Build the engagement model. Rooted in
hearth-network; hearth-pos sibling at ../hearth-pos. Branch: engagements.
Build in stops; each stop ends with a report and Derrick's approval. Nothing
to main unverified. Derrick applies migrations, deploys, and pushes by hand.

STOP 1 — MIGRATION 0017  ✅ APPLIED 2026-07-23 (afeb490; backfill 2,
  priced 1 — the unpriced row is Blue Hour's multi-item Menu card,
  price_cents null, the known Day 20 finding, not a data error).
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

STOP 2a — NETWORK WRITERS, TS ONLY (hearth-network). No migration.
  Deployable and verifiable on its own.
  - Guard re-anchor per STEP 0 ruling (b): guard 3 resolves inbound →
    engagement (unique inbound_id), requires status 'accepted' AND
    agreed_price_cents IS NOT NULL, validates the amount echo against the
    snapshot. Guard 2 keeps card-exists / commerce_enabled / no-self-pay,
    loses amount authority.
  - engagement_id threaded through the ledger (TransactionRow /
    TRANSACTION_SELECT / insertTransactionRow).
  - process_payment: it already resolves the exact accepted inbound row;
    resolve inbound→engagement (unique inbound_id) and stamp engagement_id on
    the transactions insert. request_payment stamps identically.
  - Payments webhook: extract one canonical markEngagementPaid(stripe_pi) that
    walks pi → transactions.engagement_id → engagement, advances accepted→paid.
    Never regress a terminal state (copy the discipline already in
    stripe-webhook.ts for transactions).
  - Both tools' amount_cents manifest descriptions → snapshot authority,
    same commit.
  tsc clean. Show diffs. STOP. Derrick deploys.

STOP 2b — MIGRATION 0018 (file only; Derrick hand-applies).
  - complete_engagement SECURITY DEFINER RPC: owner check (seller), sets
    fulfilled + fulfilled_at, increments completed_transaction_count.
  - cancel_engagement SECURITY DEFINER RPC: either participant. Enforces the
    refund policy: if agreed_price_cents is null → cancel free. Else if
    scheduled_for is set AND now() <= scheduled_for - interval '14 days' →
    full Stripe refund of the successful transaction (+ fee return) then
    cancelled; else cancelled with no refund. cancelled_at stamped.
  - Audit imprint on every transition. (See STOP 2 RULINGS below for refund
    execution, timezone, counter-skip, currency.)
  Show the file. STOP. Derrick applies in the SQL editor, confirms.

STOP 3 — catch_me_up (the cold-start fix). WAS the POS accept UI.
  STEP 0 ruling (a) above is the spec: identity-only read tool returning
  threads + pending_inbounds[] + engagements[] for the token-bound entity.
  Ships AFTER 0017 so the engagement field is in v1. tsc clean. Show diffs.
  STOP. Derrick deploys and re-auths a host (hosts cache tools/list).

STOP 4 — POS ACCEPT UI (the Josh fix). Was STOP 3.
  - InboundTile goes kind-aware: for booking/order fetch the card via
    inbound.card_id, show title + price_cents + terms; accept button reads
    "Accept order — $X" / "Accept booking — $X" (or no price when unpriced).
    Same respond_to_inbound RPC; pass explicit p_inbound_ids.
  - PlexChatScreen: pinned banner above the composer for pending inbounds on
    this thread addressed to me — kind-aware accept/decline in the
    conversation itself. After accept, the same slot shows the status chip
    (Accepted → Paid → Done).
  Bundle rebuild. Show diffs. STOP. Derrick device-verifies.

STOP 5 — POS ENGAGEMENT TAB + RELOCATIONS. Was STOP 4.
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

> **STOP 2 RULINGS (locked 2026-07-23 — apply to STOP 2a/2b above):**
> 1. **REFUND EXECUTION.** plpgsql cannot call Stripe. cancel_engagement
>    finalizes free-cancel paths itself; on the refund-due path it makes NO
>    state change and returns `{ refund_due: true, transaction_id,
>    stripe_payment_intent_id }`. The webhook gains charge.refunded handling
>    that marks the transaction refunded and finalizes the engagement to
>    cancelled. Refund initiation on Day 21 is the Stripe dashboard by hand.
>    REQUIRED: the refund-due return writes an AUDIT IMPRINT, so a cancel
>    request that never gets refunded is not invisible. Do not add an enum
>    state — the status enum is locked by STOP-0.
> 2. **TIMEZONE.** No timezone column exists in either repo. The 14-day
>    boundary evaluates in UTC as interim. DEFERRED entry names the column's
>    future home as entities, NOT vendor_profiles — engagements carry
>    seller_entity_id, and hanging it on vendor_profiles makes every boundary
>    evaluation a three-hop cross-repo join.
> 3. **WEBHOOK ORDERING.** markEngagementPaid MUST run on the already-applied
>    path. DO NOT RESTRUCTURE the early return. stripe-webhook.ts is CLOSED
>    and was touched inside 24h. Insert the call ABOVE the short-circuit,
>    between the transaction lookup and the already-applied check at 147-149.
>    It is idempotent and only advances from 'accepted', it keys off the
>    payment_intent.succeeded event rather than the transaction row's status,
>    so it does not need the update at 167 to have happened. The existing
>    transaction writer's control flow stays byte-identical; the diff is one
>    insertion. Show before/after of that block specifically.
> 4. **COUNTER SKIP.** Missing vendor_profiles row for the seller: skip
>    without failing the fulfill — but record an AUDIT IMPRINT, not a RAISE
>    NOTICE. Day 22's paywall is fed entirely by completed_transaction_count;
>    a silent no-increment means the paywall never fires and it surfaces a
>    month late. ALSO REPORT at the STOP 2b gate: a count of sellers with
>    engagements who have no vendor_profiles row. If nonzero today, the
>    counter's location is a Day 22 prerequisite, not a footnote.
> 5. **CURRENCY.** Charge currency from engagement.currency (snapshot), not
>    live card.price_currency. Consistent with the posture.
>
> **BACKFILL CAVEAT (recorded here, it is easy to lose):** 0017's backfill
> snapshots each card's CURRENT price_cents, which is not the price that was
> agreed at accept time. Those values are reconstructed, not agreed, and are
> test-era rows only. Do not later treat them as evidence.

---

# DAY 22 — Step 5.4b · Commerce model — locked ruling  [WRITTEN 2026-07-28]
*Repos: hearth-network (order payload, accept message, webhook, successor migration) +
hearth-pos (buyer-side cancel surface). Roadmap only — no build prompt has been issued
against this block. The prior occupant of this slot ("Money surface + paywall + branded
checkout") is RELOCATED intact to Day 22B below, text unchanged.*

Day 21 built the engagement layer. Derrick has now ruled the commerce model that sits
on top of it. Several Day 21 assumptions are superseded by this ruling, and per the
canon hierarchy ("a ruling is not a ruling until it is in the roadmap") they are
written down here before any code is built against them. Day 21 is closed history:
nothing in its block is edited — every supersession lives here, in Day 22.

> **THE MODEL (locked 2026-07-28 — Derrick's ruling, do not re-litigate):**
> 1. **SEQUENCE.** Buyer asks → seller accepts → buyer pays. The engagement exists
>    from the seller's yes. It is not closed until paid.
> 2. **THE ACCEPT CARRIES THE PAYMENT CALL.** Accepting generates a structured
>    message into the thread naming the amount and the action — "Accepted. $12.50
>    to book." The buyer's agent already holds request_payment; the accept is what
>    cues it. Auto-generated from the engagement so it cannot be vague, with the
>    seller's optional note appended. This is the direct fix for the 2026-07-24
>    failure where a seller replied "Approved" and nothing structured happened.
> 3. **NOTHING IS RESERVED UNTIL PAID.** An accepted-unpaid engagement holds no
>    slot. The seller's yes opens the door; payment walks through it. No expiry
>    mechanic, no scheduler — deliberately deferred until a real seller reports a
>    held-slot problem.
> 4. **THE DATE IS A CONTRACT TERM.** scheduled_for cannot be null on any paid
>    engagement. It arrives with the order.
> 5. **THE DATE CANNOT BE MOVED.** To change a date the buyer asks the seller to
>    cancel, which refunds, and the buyer places a new order.
> 6. **CANCEL SPLITS BY ACTOR.** Seller cancels: always refunds, any time,
>    regardless of the 14-day boundary. Buyer cancels: refund only more than 14
>    days before the scheduled date; inside the window, cancellation without
>    refund.

> **SUPERSESSIONS (each cites what it overrides; the overridden text stays where
> it is — Day 21 and applied migrations are history, this block is the ruling):**
> 1. **0017's design comment "scheduled_for is an ATTRIBUTE, never a state"**
>    (0017:22-24 header comment; 0017:66 column comment `-- attribute, never a
>    state`) is SUPERSEDED by decision 4. On any paid engagement scheduled_for is
>    a contract term and cannot be null; "payment and scheduling have no fixed
>    order" (Day 21 STOP-0) no longer describes the model. The 0017 schema stands
>    as applied — what is superseded is the comment's claim, not the column.
> 2. **0018's cancel tree applies one 14-day test to both parties**
>    (0018:240-242 — cancel_engagement is either-participant with a single
>    boundary; likewise the Day 21 STOP-0 policy text "may be cancelled by either
>    party"). SUPERSEDED by decision 6: seller-cancel always refunds, any time;
>    buyer-cancel refunds only more than 14 days out. 0018 IS APPLIED
>    (2026-07-24) — a SUCCESSOR MIGRATION IS REQUIRED (build item below). It is
>    not written yet; do not write it from this block.
> 3. **0019 (set_engagement_schedule) is HELD, NOT APPLIED** — file only,
>    migrations/0019_engagement_schedule.sql, commit be7ffda — and is
>    SUPERSEDED-PENDING-REVIEW by decision 5: nobody moves a date under this
>    model. The date arrives with the order and changes only by
>    cancel-and-reorder. The file is NOT deleted; its status is recorded here.
> 4. **Guard 3 (status='accepted' + non-null agreed_price_cents permits payment —
>    Day 21 STOP 2a, STEP 0 ruling (b)) is UNCHANGED and CORRECT under this
>    model.** Decision 1's sequence is exactly what the guard enforces: payment
>    only after the seller's yes. Stated explicitly so it is not re-litigated.
> 5. **Day 21's five STOPs all stand.** Nothing in Day 21 is edited —
>    supersessions live here, in Day 22.

> **BLOCKING DEPENDENCY — STRUCTURED ORDERS. The whole model is blocked on this.**
> reach_entity carries no order payload, so a date named in prose cannot reach the
> engagement — src/tools/reach-entity.ts:254 is the only inbound writer, and it
> writes no structured terms. Decision 4 makes the date a contract term, so nothing
> in this model ships until orders carry structure. This PROMOTES the DEFERRED
> entry **"Repeat orders into an established thread degrade to prose"** (DEFERRED.md,
> Day 21 STOP 4 finding, commit b62406a — the "orders arrive as prose" problem)
> from parked-with-trigger to Day 22 scope. The entry is cited here as promoted,
> not deleted; it moves to Done when the structured order payload lands.

**REQUIRED BUILD ITEMS (unordered — sequencing into STOPs is ruled separately; do
NOT treat list order as build order, do NOT issue a build prompt from this list):**
- Structured order payload (migration + reach_entity + respond_to_inbound).
- Accept-generated payment call message into the thread (decision 2).
- charge.refunded webhook handler — HANDLED_EVENTS (stripe-webhook.ts:47) is
  payment_intent.succeeded and payment_intent.payment_failed only, so BOTH cancel
  paths dead-end today (matches the DEFERRED entry "charge.refunded webhook
  finalizer does not exist").
- Actor-split cancel: successor migration to 0018 (decision 6).
- Buyer-side cancel surface in hearth-pos — none exists; the Engagement tab's only
  action today is the seller-only Done.
- Seller-side cancel surface in hearth-pos — decision 5 makes seller-cancel the
  only date-change mechanism and decision 6 makes it the only in-window refund
  path, but no surface exists: the Engagement tab's seller rows have Done only.
  Seller rows gain Cancel beside Done, confirm copy per the seller cases
  (always-refund), same RPC, same refresh chain.
- Paid-requires-date guard: decision 4's invariant (scheduled_for cannot be null
  on a paid engagement) is enforceable only at payment time. A null-scheduled_for
  refusal belongs alongside guard 3 in payment-guards.ts. Not built.
- Positive service-role assertion in the dual-actor writers — the open half of
  BUG-009, which 0025 mitigated but did not fix. post_message (0004:183),
  respond_to_inbound (0009:50), and cancel_engagement (0024:86) decide "this is
  the Worker" by testing auth.uid() is null. That is an inference from absence,
  and the anon role satisfies it too — which is how BUG-009 became a live
  impersonation path: an anon caller supplying p_from_entity_id could act as any
  entity. 0025 revoked anon EXECUTE, so nothing anonymous can reach these
  functions today, but the bodies still trust a null uid, and default privileges
  re-mint anon on every CREATE. The system is safe by one grant, not by design.
  Fix: assert the service-role identity positively in the else-branch —
  current_setting('request.jwt.claim.role', true) = 'service_role', or an
  equivalent that PROVES the caller rather than inferring it — instead of
  accepting any caller with no session. One successor migration covering all
  three functions in one file, so the three cannot drift apart. Not built.
  Trigger: before Day 28's pilot vendor, or before any non-Derrick user,
  whichever first. BUG-009's mitigation is a grant, and grants are re-minted by
  default privileges on every new function — the standing CLAUDE.md grant-block
  rule is what holds the mitigation, and this item is what removes the
  dependency.

---

# DAY 22B — Step 5.5 · Money surface + paywall + branded checkout  ★ PHASE 5 DONE
*Repo: hearth-pos.*
*[RELOCATED 2026-07-28 — this block was Day 22; the commerce-model ruling above
displaced it. Body text unchanged.]*

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

# DAY 22C — Step 5.6 · Display stack (CardView + three tiers)  [WRITTEN 2026-08-13]
*Repo: hearth-network. Roadmap ruling from the 2026-08-13 display-stack investigation.
Docs only — no code, no migration. Not built; the build prompt follows separately.*

**THE PROBLEM IT SOLVES.** Card tool results today are JSON.stringify'd into a single
text block (`src/tools/shared.ts:17-19`). The host must paraphrase to show a human
anything. On 2026-07-24 an agent described Josh's Breakfast Menu in its own words and
invented "$12 each, $96 food, $100 minimum" — none of it on the card. An authored text
card removes the paraphrase step: the host cannot improvise facts it was handed verbatim.

**THE MODEL — template once, project three ways.** One CardView object, three
serializers, all shipped in every card-bearing result. The host renders the richest
tier it supports.
- **TIER 1 — MCP Apps sheet** (`ui://deus/card-sheet.html`), extending the Day 20
  payment-sheet pattern: inline HTML, zero external origins, registered once and served
  via `resources/read`. Per-result cost is a URI string, not the template.
- **TIER 2 — structuredContent JSON:** the shape an agent reasons over.
- **TIER 3 — the authored text card:** fixed format, written not improvised. This is
  the anti-invention guarantee and it ships everywhere.

**LOCKED DECISIONS**
1. **Tier 1 on get_card_details ONLY.** `_meta.ui.resourceUri` binds per-tool, so a
   query_cards sheet would be one sheet rendering a whole result list. Search results
   get Tier 2 + Tier 3. The anti-invention guarantee comes from Tier 3, not the sheet.
2. **Compact card excludes commerce.** query_cards returns no price. This preserves the
   grounding contract — get_card_details is the price authority
   (`src/capabilities/manifest.ts:49-53`), and a price in a search result is a price an
   agent can quote without grounding.
3. **The null-price string is load-bearing.** An unpriced card's text card says payment
   cannot be started from it, explicitly. That sentence is the authored replacement for
   the improvised "$100 minimum."
4. **Host probe — logging first.** Add per-client logging on `resources/read`
   (`src/routes/mcp.ts:222`). A host that never reads the card sheet URI is not
   rendering it — a definitive negative from traffic already flowing. An in-sheet
   beacon only if the logs are ambiguous. Known today: Claude honors resourceDomains
   and connectDomains, NOT frameDomains, and blocks nested iframes (Day 20 probe).
   Grok and ChatGPT: unknown, assumed nothing.
5. **Golden files.** The serializers are pure functions; snapshot them plus the Tier 1
   HTML template under `test/golden/`. CI fails on drift; intentional changes are
   reviewable diffs.

**SIZE — recorded because it reverses the obvious assumption.** Tier 1 ships once, not
per result. Three compact cards with all tiers is ~2.2 KB against today's ~1.6 KB —
1.4×, not 3×.

**SCHEMA GAPS — record, do not solve:** no image or media column; no location column
(query_cards accepts a `location` arg it does not apply); no card-level description;
no line items. Tier 1 renders without avatar or photo tiles in v1.

**CROSS-REFERENCE:** multi-item pricing stays deferred (DEFERRED.md, Day 20 close-out
findings). An authored card makes the gap MORE visible — vendor-authored item prices
render in fields while the commerce line says unpriced — which is the useful direction.
The DEFERRED trigger is unchanged.

**SECOND ITEM (recorded with this ruling; unrelated to the tiers).**
PLEXMED_CARE_LOOP_BUILD.md and GROUP_THREADS_BUILD.md are build specs that exist only
in project knowledge and are invisible to every agent working in the repo — same class
as rulings living in chat. Either commit them to the repo or write their sessions into
this roadmap. Not built.

---

# DAY 22D — Step 5.7 · Order quantity  [WRITTEN 2026-08-17]
*Repos: hearth-network (reach validation, respond_to_inbound successor, accept message) +
hearth-pos (accept tile shows the computed total). Roadmap ruling.
Docs only — no code, no migration. Not built; the build prompt follows separately.*

**THE BUG, with evidence.** A card carries one `price_cents`; an order carries prose. An
order for eight settles for the price of one.
- 2026-07-24 — an agent invented "$12 each, $96 food, $100 minimum" for Josh's Breakfast
  Menu. None of it was on the card.
- 2026-08-13 — an eight-sandwich order accepted at $12.50. The accept message read
  "$12.50 to book", which sounds like a deposit and is not: guard 3b
  (`payment-guards.ts:465`) refuses any second charge, so paying it settles the
  engagement in full and the vendor is owed the rest.

Every layer is internally consistent and collectively wrong — the card is right about the
card, the engagement is right about the card, and nothing knows the order was for eight.

**THE RULING — quantity, not line items, not vendor-typed totals (locked 2026-08-17):**
1. **inbound gains a `quantity` integer**, following scheduled_for's proven pipeline
   exactly (0020): validated at reach, stored on inbound, copied to the engagement at
   accept, enforced at payment. Positive integer, booking and order only, optional
   (absent means one).
2. **THE BUYER NEVER AUTHORS A PRICE.** They choose a count. The server computes
   `agreed_price_cents = quantity × cards.price_cents` at accept, inside
   respond_to_inbound's existing transaction. The snapshot stays vendor-authored, which
   is the entire security property of the payment path — guard 3 validates the echo
   against agreed_price_cents and needs NO change, because multi-item is an accept-time
   problem, not a payment-time one.
3. **THE POS ACCEPT TILE SHOWS THE COMPUTED TOTAL** for a one-tap confirm. The vendor
   confirms without typing. Human arithmetic at accept is what option (c) would have
   reintroduced and is explicitly rejected.
4. **THE ACCEPT MESSAGE CHANGES IN THE SAME WINDOW.** It must name the multiplication
   and the completeness — shaped like "Order accepted — 8 × Breakfast sandwich, $100.00
   to book." Shipping a new total without the new message means the anti-invention
   machinery authoritatively states a wrong amount, which is worse than the vagueness
   it replaced.

**REJECTED (recorded so they are not re-litigated):**
- **(a) Line items** — buyer names items, server prices them. Rejected for now:
  per-item prices do not exist. Blue Hour's "$5.25" is display text inside a value
  string (`shared.ts:171-174` coerces every value to string). Pricing from that means
  parsing dollars out of vendor prose, which breaks silently on "market price".
  Structured item prices are a hearth-pos authoring change first.
- **(c) Vendor types the total at accept** — rejected: it puts arithmetic and typos in
  the exact place the generated message was built to remove, changes an auth-critical
  RPC signature (re-minting the anon ACL, full grant block required), and leaves the
  order entirely unstructured.

**WHAT THIS DOES NOT SOLVE — recorded plainly.** Blue Hour stays unpayable. A four-item
card genuinely has no single price, and its DEFERRED trigger stays fired-in-waiting.
Deposits and partial payment do not exist — agreed_price_cents settles once. Modifiers,
delivery fees, and tax are unaddressed.

**THE HALFWAY TRAP — a warning to whoever builds this.** Quantity accepted at reach but
not multiplied at accept reproduces the eight-sandwich failure with MORE confidence: the
count is visible everywhere while the engagement still prices ×1. And a mispriced
engagement has no in-band remedy — 3b blocks a second charge and dates cannot move, so
it resolves only by cancel, refund, reorder. A halfway build manufactures refund
traffic.

**PLACEHOLDERS (recorded with this ruling; not built):**
- **Media fields on the network side.** hearth-pos ships a full image pipeline
  (card-media bucket, picker, camera, 12-image galleries) storing URLs in fields under
  `media_url` and `gallery_image`. The MCP side neither renders nor filters them, so a
  media-bearing card prints "- media_url: https://…" as a literal text row today. Two
  halves: filter the reserved labels out of the text tiers, and render images in the
  sheet — which requires declaring the storage origin in resourceDomains, ending the
  zero-external-origins property, and an img-src probe (Day 20 proved script-src and
  connect-src only).

  **IMG-SRC VERDICT, 2026-08-20: LOADED.** Probed live on the card sheet with a Supabase
  Storage object; Claude rendered it and the verdict line read LOADED. Day 20 proved
  script-src and connect-src; this closes the third arm — the host honors
  resourceDomains for img-src. The transport for card images exists.

  Still open, and each is a ruling before any image build:
  - **The public-bucket posture.** card-media is public by construction, so a
    contacts-gated card's image is fetchable by anyone holding the URL (already ledgered
    in hearth-pos DEFERRED). Rendering it makes the accepted exposure more visible, not
    larger.
  - **Bucket-only vs a proxy origin.** CSP origins are enumerated once at resource
    registration, so an allowlist covers the storage bucket and nothing else —
    vendor-pasted links (a live card carries a picsum.photos URL) would never render. A
    proxy covers both at the cost of serving third-party bytes under our own origin,
    which is a product posture, not just a security one.
  - **Declaring any origin ends the zero-external-origins property** the sheets
    currently audit on. That is deliberate, and the comment that makes it auditable must
    change with it.

  The probe branch (`probe/img-src`) was deployed, read, reverted, and deleted (was
  `46755e8`); production returned to `03c984e`.

- **list_entity_cards.** No tool returns one entity's cards — get_card_details takes
  one id, query_cards accepts an entity filter it never applies (`query-cards.ts:335`).
  An entity's catalogue as a tile grid needs this tool plus its own grid resource. It
  reverses NO locked decision: resourceUri binds per-tool, so a new tool gets its own
  binding and Day 22C's decisions 1 and 2 stand untouched. Full CardViews keep prices
  grounded the same way get_card_details does.

---

# DAY 22E — Step 5.8 · Card retire + delete  [WRITTEN 2026-08-19]
*Repos: hearth-network (retired_at migration + read-path filter sweep) + hearth-pos
(editor controls, retired sheet, delete guard). Roadmap ruling.
Docs only — no code, no migration. Not built; the build prompt follows separately.
Evidence base: the 2026-08-19 card delete/retire investigation (accepted).*

**THE GAP, recorded plainly.** Day 12 specced "⊕ add card; swipe-to-delete" and its
verify line claimed "add + delete work." Delete was NEVER BUILT — **a verify line passed
on unbuilt work.**
- `ProfileScreen.tsx:287` still carries the `{/* TODO(Day 12+): swipe-to-delete lands
  here. */}` seam; `CardContext`'s full API has no `deleteCard`; no
  `.from('cards').delete()` exists anywhere in the app.
- Logged 2026-06-16 (hearth-pos DEFERRED.md, commit `ebd1650`). The trigger re-fired
  2026-08-19 when Derrick tried to remove a card and could not — a fired trigger left
  fired for two months, against canon rule 4.
- Promoted to CLAUDE.md rule on 2026-08-20 (PROCESS-001).

**THE RULINGS (locked 2026-08-19):**
1. **CARD-LEVEL DELETE, not item-level.** Day 12's spec sits under "⊕ add card"; the
   DEFERRED entry's item-row framing is a different feature, and per-field Remove
   already exists in the editor.
2. **RETIRE IS A `retired_at timestamptz` COLUMN**, not the composite of
   `see_perm='off'` + `commerce_enabled=false`. The composite destroys the card's
   permission state — un-retiring cannot restore see_perm 'contacts' because the retire
   overwrote it, so it needs a shadow column to remember, which is retired_at in
   disguise. It also cannot distinguish retired from deliberately-private, which the
   count and the list both depend on, and carries no date. Cost accepted: a migration
   plus a network-side filter sweep. Every reader of cards excludes retired —
   query_cards (semantic AND substring paths), get_card_details, card-view,
   request_payment's title lookup. The app's own fetch KEEPS retired rows and
   partitions them.
3. **"PAST ORDERS" COUNTS ENGAGEMENTS, not settled transactions.** Readable today
   through `engagements_select_participant` (0017:89-93) with no new helper. An order
   placed is history whether or not it settled.
4. **THE RETIRED LIST IS A SHEET, not a screen.** CardEditorSheet is already a
   pageSheet Modal owned by ProfileScreen; a pushed screen would need a stack around
   Profile, which does not exist.
5. **PLACEMENT.** Retire sits in the editor header, opposite Save — both are exits from
   the sheet, one keeps the card, one shelves it. Delete sits at the very bottom of the
   editor body, red, past every field. Reversible actions live where you leave from;
   irreversible ones live where you arrive deliberately. The editor has no footer today
   — both controls are new, and both are edit-mode only, the same gate Commerce already
   uses (CardEditorSheet.tsx:651).
6. **RESTORE HAS NO CONFIRM.** Putting a card back is not destructive, and confirming
   reversible actions trains people to tap through the irreversible ones.
7. **DELETE REFUSES ON A CARD WITH ORDER HISTORY and points at Retire.** One meaning
   per control — Delete never silently performs a retire.

**RECORD, do not solve:**
- **BUG-011** (inbound.card_id cascade → set null, migration 0029, applied 2026-08-19)
  was the precondition for delete: before it, deleting a card cascade-destroyed its
  inbound rows and nulled kind / scheduled_for / quantity out of the money history.
  Retire does not depend on it; delete does.
- **hearth-pos DEFERRED.md's swipe-to-delete entry is SUPERSEDED by rulings 1 and 5:**
  no swipe, card-level not item-level. It moves to Done when this ships.

**WHAT THIS DOES NOT SOLVE — recorded plainly.** NO ACCOUNT DELETION EXISTS ANYWHERE.
The only account exit is signOut; Apple guideline 5.1.1(v) requires in-app account
deletion for App Store approval, and card delete is a strict subset of it. Logged
2026-08-19 as its own hearth-pos DEFERRED entry (trigger: App Store submission — a hard
blocker).

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

---
---

# REGISTRY SEEDS (parallel track)  [WRITTEN 2026-08-10]
*Runs PARALLEL to the core build. Does not renumber or displace the Day sequence — Day 23
(SMS gateway) remains the next core action.*

**Thesis:** public government registries → Tier-1 cards. One entity per dataset, one card
per record, keyed to the registry's native ID. Same pipeline as the Providence trials seed:
pull → normalize → generate → migrate → backfill embeddings.

- **Instance 1 — Providence clinical trials. ✅ DONE.** Entity 526982, 67 cards, live.
- **Instance 2 — Grants.gov federal opportunities. IN PROGRESS.**
  - New entity: deus_id 300200, display_name "Grants.gov", entity_type business, all
    verification flags false.
  - The entity insert lives IN the migration (0026) this time — not hand-typed.
  - Pull posted + forecasted, no eligibility filter — filtering happens at query time.
  - Zombie rule: empty-closeDate records get a self-describing stale status string, not
    dropped.
- **Instance 3 — SAM.gov federal contract opportunities. PLANNED.** Same pipeline, new
  entity, new mapper.

**Standing rule for this track:** each seed carries a forever-refresh obligation —
scheduled re-pull → upsert by native ID → re-embed changed — or the cards go stale. A stale
card is worse than no card.

---

## LEDGER — 2026-08-20
- 0030 card_retired_at: CONFIRMED APPLIED (column verified live; commit 0f14f75's
  "NOT applied" is stale as of today).
- 0031 schema_migrations: APPLIED by hand from strategy chat; repo file written same day
  by Derrick (commit a923f26). Ledger is authoritative for apply state from this point
  forward.

## RULINGS — 2026-08-20 (credential verification, pre-build)
R1: PSV path v1 = direct sources: NPPES + Oregon board lookups + OIG
    LEIE. No vendor. PSV vendor is a post-sprint upgrade; interface
    unchanged (verifications.source / .method carry the distinction).
R2: We never store legal name or DOB. Identity amendment stores the
    Stripe Identity verification session id only (server-readable,
    never client-readable). Verified name fetched server-side at
    concordance time, compared in memory, discarded; persist only
    outcome + SHA-256 of the normalized name.
R3: Concordance v1 = normalized-name exact match, license number as
    discriminator. DOB is not a concordance input on the direct-source
    path (no source exposes it); DOB read in memory solely to
    disambiguate OIG LEIE hits, persisted nowhere; DOB becomes a
    concordance input only under source vendor:*.
R4: One active verified row per registry_ref network-wide (partial
    unique index: status='verified' and voided_at is null). Second
    claimant on a bound license lands in manual_review, structurally.
    No override path exists.

## RULINGS — 2026-08-20 (retrieval hygiene, approved for 0032)
R5: match_cards gains the kinds predicate AND retired_at filtering SQL-side (0030's
    deferred follow-on ruling, now made). filterRetired dies on the semantic path.
R6: Registry seed rows (0015 trials, 0026 grants) re-kind to 'content'.
    Informational content, not capabilities; the seeding kind was the
    error. No enum change.
R7: Trials seed entity id_verified resets to false. No recorded origin;
    no identity check ever ran. Stamps mean a check happened.
R8: Embedding assembly = DENYLIST + 400-char per-field cap (skip set +=
    eligibility, url, contact, cfda, opportunity id, opportunity number,
    nct id), NOT allowlist. Embed kind now to avoid a second re-backfill.
R1-CONFIRMED (2026-08-20, evening): all three v1 Oregon boards are
    electronically verifiable free of charge — OMB's public portal is
    board-stated primary source verification (omb.oregon.gov/search;
    legacy verification.aspx and daily-updated DocFinder as fallbacks);
    OBLPCT and Board of Psychology both run on Thentia Cloud
    (oblpct/obop.us.thentiacloud.net), public lookups are SPA-over-REST.
    Exact endpoint shapes to be captured in CRED S2 investigation (devtools
    network capture; quote method, URL pattern, response fields). Vendor
    remains post-sprint. Confirms R1 (line 1362); vendor still deferred.

## RULINGS — 2026-08-21 (identity-flow amendment, approved for pos-0003)
R3-AMENDED: Stripe gates verified_outputs.dob behind a restricted key with a
    48-hour window after verification (IP-restricted keys lift the window;
    our edge/Worker runtimes have no fixed egress IP, so that variant is
    unavailable). The in-memory DOB read for OIG LEIE disambiguation works
    only inside that window. Outside it, or when the session is redacted,
    an ambiguous exclusion hit lands in manual_review — structurally: never
    a guess, never an in-app DOB prompt. Name-only concordance (secret key,
    no window) is unaffected.
R2-ADDENDUM: We do NOT call the Identity redact endpoint. Unredacted
    sessions are what make re-bind (listing by metadata.entity_id) and
    re-verify possible. Post-concordance redaction is DEFERRED with the
    re-bindability tradeoff noted (DEFERRED.md 2026-08-21).
R-LEDGER: hearth-pos migrations receipt as 'pos-NNNN' in the shared
    schema_migrations ledger (bare numeric ids are hearth-network's
    sequence); pos-0001/pos-0002 catch-up rows ride in pos-0003. Rule text
    lives in CLAUDE.md MIGRATION LEDGER (both repos).
R-GAP: six id_verified=true entities predate the binding. Four with logins
    re-bind via the one-time ops script (scripts/rebind-identity-sessions);
    two without (deus_id 184203 Blue Hour, 100001 Derrick Wilson — hand-set
    flags, no session ever existed) are reset to id_verified=false by the
    script's guarded final step (R7: stamps mean a check happened).

## RULINGS — 2026-08-22 (display stack: S0 collisions resolved + three amendments, approved for S1)
Source: DISPLAY_STACK_BUILD.md Session 0 report (main @ 66f4162). "ALL RULINGS
APPROVED" = the confirmation spec's direction wins each S0 collision below; the
three amendments narrow R2/R7 and add R8. deus-card-spec-confirm.html is NOT in
either repo (searched 2026-08-22): the S1 proposal drafts governance/kind text
for approval and marks it DRAFT until the page is checked in beside this file.
R1: Three tiers on EVERY card-bearing result. Day 22C locked decision 1 (Tier 1
    on get_card_details only) lifts. HOW query_cards renders Tier 1 (one list
    sheet vs per-card) is Session 2 item 3's proposal, not assumed here.
R2 (AMENDED 2026-08-22): compact results DO carry a price chip for priced
    cards, sourced from cards.price_cents — the same column as the full view,
    so chip and snapshot cannot disagree. Day 22C locked decision 2 narrows to:
    the engagement snapshot (engagements.agreed_price_cents) remains the
    transactional price authority; display is no longer suppressed in lists.
    Rationale: with several clinicians in one result set, price is a selection
    criterion. Chip order: availability, price, modality; ≤4 total.
R3: The action zone ships. The 2026-08-14 no-action-button ruling (card-sheet
    header, src/capabilities/ui-resources.ts) lifts CONDITIONALLY: Session 2
    must verify the ext-apps 2026-01-26 view→host tool-call bridge against the
    spec text (ext-apps is not in node_modules) before any button promises a
    tool; an unverified wiring renders the approved v1 fallback, never a dead
    control.
R4: The governance line is per-KIND verbatim text from a constants module, in
    all three tiers. The per-permission-pair sentences (GOVERNANCE_SENTENCES,
    nine templates, Tier 1 only) retire when the constants land — one source.
R5: The seven card_kind enum values map onto the spec's display kinds through a
    constants-module mapping proposed in S1; the enum does not change.
R6: query_cards' structuredContent envelope key becomes `cards` (matching
    list_entity_cards), wrapped as ResultEnvelope {guidance, cards}; `results`
    retires. Agent-facing wire change, recorded as such.
R7 (AMENDED 2026-08-22): the state band ships in COMPACT results too, batched —
    ONE lookup across the result set's owner ids per call, never per card.
    inbound.from_entity_id gains an index (0034, hand-applied by Derrick;
    SQL proposed in S1). Measured 2026-08-22 on the dev DB (inbound = 18 rows):
    batched lookup 60–122 ms across three runs, the same order as the
    contacts-gate subrequest query_cards already pays (71 ms) — not material.
    Re-measure if inbound passes ~10k rows. Per-owner vs per-card semantics:
    S1 proposes and argues; evidence rules.
R8 (NEW 2026-08-22): FOLLOW-UP OFFER — guidance.ts gains one reviewed string,
    shipped in SERVER_INSTRUCTIONS: after a booking or order is submitted the
    assistant tells the person they can be notified when its status changes
    and offers a scheduled follow-up check where the host supports automations
    (e.g. scheduled tasks polling get_status); hosts without the feature simply
    won't act on it. Exact sentence drafted in S1 for approval. get_status must
    remain polling-safe — one read, honest pending states, no side effects —
    confirmed in S1 against src/tools/get-status.ts.
R9: "Verified Clinician" is the user-facing designation constant; it lives in
    the same constants module as the governance lines and guidance strings.

## RULINGS — 2026-08-22 (display stack S1 proposal, six decisions + one correction, approved for 1-BUILD)
CORRECTION (binds R5/R9): display_kind NEVER derives from credential_verified.
    `practice` maps ONLY from the future 'practice' enum kind (Day 7 / PLEXMED
    S5); until it exists no card renders as practice — correct, none exist.
    Mapping: civic→civic; content→listing; every other enum kind → business
    when entity_type ∈ {business, organization}, else person. Stamps carry
    verification; display_kind never does.
S1-1 GOVERNANCE: the five drafted sentences approved EXCEPT practice — the
    leading "Verified Clinician." is struck (a stamp claim inside a kind
    sentence; the stamp row says it, and a lapsed license must not leave the
    sentence lying). Practice line: "Booking through this card is a request
    the clinician accepts or declines — nothing is charged until they accept."
S1-2 SUMMARY: derivation approved (description field, else first two fields
    as "label: value" joined by " · ", 140-char word-boundary cap with …).
    Full-mode field rows render INSIDE the Tier 3 box between offer and chips.
S1-3 GUIDANCE: care-seeking term list approved as drafted (false positives are
    harmless — safe advice; civic-present triggers it anyway). R8 FOLLOW-UP
    RULE sentence approved verbatim (text lives in guidance.ts). get_status
    KEEPS its per-poll observe imprint — exempting it would create a silent
    observation channel; ~192 rows/day per watcher is cheap honesty. get_status
    is NOT widened to carry engagement_status: the poll-then-get_messages
    handoff is correct v1 (DEFERRED, trigger "first host automation in
    production").
S1-4 CARD FACTS: option (a) — one batched cards select (id, act_perm,
    commerce_enabled, price_cents, price_currency) by card id on the compact
    path. No match_cards re-mint for this.
S1-5 WITHDRAW: action is NONE when band = pending. The state band already says
    "Request sent · awaiting their reply"; a tool-less action labeled "Request
    sent" duplicates it and teaches agents that actions can be inert. The
    withdraw-tool DEFERRED entry stands (trigger: first user asks to cancel a
    pending request).
S1-6 TWO MODULES: approved — src/capabilities/card-copy.ts (human copy:
    governance lines, action/state labels, civic lines, VERIFIED_CLINICIAN,
    display-kind map, chip-label sets) + src/capabilities/guidance.ts
    (assistant directives: composer strings, FOLLOW_UP_OFFER). The import-graph
    auditability argument wins.
1-BUILD sequencing: branch feat/card-object; 0034 (inbound_from_entity_idx)
    written to migrations/ and STOPPED for hand-apply before any code depends
    on the band lookup; then CardView + serializers + envelope, the nine
    per-pair sentences retired, goldens for all seven enum kinds × states incl.
    the civic full card and the guidance-envelope cases (care-seeking →
    civic-first line; neutral → no line, asserted); tsc clean; both verify
    scripts pass. No push.

## RULINGS — 2026-08-22 (credential S2 proposal, seven flags ruled, approved for 2-BUILD)
Source: CREDENTIAL S2-INVESTIGATE report (main @ 3ac7eef); endpoint capture recorded in
docs/CRED_S2_CAPTURE.md (netlog-evidenced; UNOBSERVED items marked there, never inferred).
F1 CEREMONY TRIGGER: cron drain. No /credential route, no index.ts route touch, no token-
    plane change. A Cloudflare Cron Trigger drains verifications.status='pending' every
    minute; the app polls get_my_verifications(). (Plane 2 stays "/money/* only".)
F2 SOURCE ACCESS: browser User-Agent v1 on the Thentia REST calls (403 otherwise) and the
    Referer + session cookie + md5(fields+s) ceremony on OMB. Honest-access inquiries to OMB
    (their advertised bulk-data channel) and OBLPCT/OBOP are Derrick's errand this week.
    DEFERRED: per-board switch to a `Deus-PSV/1.0` UA as each board grants it.
F3 DISCIPLINE PARSE: safe default — discipline.observed = null (OMB HTML parse failure, or
    any unseen Thentia publicNotices shape) → manual_review. Derrick owes two captures in
    parallel (an OMB VerificationDetails.aspx with board actions; a Thentia registrant/get
    with populated publicNotices); the parser hardens when they land.
F4 SCHEMA: `pending` is the fourth credential_verification_status (the ceremony is
    asynchronous to the RPC; no pg_net/http extension exists in either repo), and
    verifications.registry_ref for type='license' is board-qualified
    ('<ST>:<board>:<number as issued>') so R4's single-column partial unique index is
    unambiguous across boards and, later, states. Approved as proposed.
F5 OVERRIDE PATH: pos-0004 drops approve_credential_request() and the
    credential_verification_requests queue (hearth-pos 0001) and repoints the app's submit
    path to request_credential_verification. Separate hearth-pos session; MUST precede
    CRED S4 (proof-standard assertion 3 cannot pass while the function exists).
F6 LEIE: ingest script approved (scripts/ingest-leie.ts, service role), Derrick-run,
    monthly, into public.oig_leie; check_exclusions reads the mirror only — never
    oig.hhs.gov at query time.
F7 DOB: the Stripe Identity restricted key (R3-AMENDED window) is deferred to S3. S2
    ships name-only concordance; an ambiguous LEIE name hit → manual_review.
2-BUILD sequencing: docs commit first (this block + docs/CRED_S2_CAPTURE.md, mirrored
    byte-identical to hearth-pos); branch feat/credential-verifications; 0035 written and
    STOPPED for hand-apply; then src/credential/* (fetch, shape, ceremony, four sources,
    vendor-md5), scripts/ingest-leie.ts, the cron drain, tsc clean, both verify scripts
    pass, plus scripts/verify-credential covering NPPES hit, Thentia hit, OMB hit, R4
    collision → manual_review, no-session-row → identity_not_verified. No push, no deploy.

## RULINGS — 2026-08-23 (credential S3 proposal: binding algorithm, cold-flow copy, claim convergence, three amendments, approved for 3-BUILD)
Source: CREDENTIAL S3-INVESTIGATE report (main @ 960e163). Binds CREDENTIAL_VERIFICATION_BUILD.md
Session 3. Prior rulings unchanged: R2, R3-AMENDED, R4, F1, F3.
S3-1 BINDING ALGORITHM — approved as specified, replacing the MINIMAL concordance S2 shipped
    (src/credential/shape.ts namesConcord/normalizeNamePart). Normalization N1 Unicode fold
    (NFKD + strip combining marks + uppercase); N2 explicit map for non-decomposing letters
    (L-stroke, O-slash, D-stroke, Thorn, AE, OE, sharp-s) applied BEFORE N1; N3 apostrophes
    deleted within a token; N4 hyphen/space/slash are TOKEN SEPARATORS (the S2 change — S2
    deleted them and destroyed the structure); N5 residual punctuation dropped; N6 suffix and
    credential-token strip, only if a token survives; N7 placeholder purge (N/A, --, UNKNOWN).
    Surname comparison S1 equal-join, S2 particle tolerance, S3 component subset, S4 other[]
    expansion (full join AND last token), S5 no cross-field match. Given-name comparison
    F1 primary-token equality, F2 initials NEVER match, F3 NO nickname expansion
    (JENNY != JENNIFER — the registries' own search is fuzzy, ours is not), F4 compound given
    names by the same form-set rule, F5 middle name never required (Stripe verified_outputs has
    no middle_name field — checked in the SDK type, so the source middle name is recorded for
    the receipt and never compared). X missing data on either side -> manual_review.
    S3's subset rule is deliberately coupled to F1/F3: a component-subset surname match is only
    safe because the given name must match exactly. No scoring, no thresholds, no tie-breaks;
    every ambiguity is manual_review. Persisted (R2): name_hash = sha256(surnameJoin|firstJoin),
    nothing else; names never leave the ceremony's stack frame.
S3-2 COLD-ARRIVAL COPY — approved VERBATIM, all states S0-S7c, including S7b: a collision
    (R4, licence already bound elsewhere) renders copy IDENTICAL to S6 manual_review, so a
    second claimant cannot learn that the licence is bound. S6 offers no retry button. Light
    Field palette (hearth-pos src/styles/theme.ts). Discipline rule 7 holds: no protocol words,
    no vendor names, "the Oregon licensing board" / "the U.S. provider registry".
    The screens are a SEPARATE hearth-pos session; hearth-network emits the copy as
    docs/CRED_S3_COLD_FLOW_SPEC.md for that session to consume.
S3-3 CLAIM CONVERGENCE — invariant 2 approved: THE RECORD ENTITY SURVIVES. The deus number is
    the record's public address and may already be seeded, printed or linked, so it never moves;
    the claim transfers user_id + the entity_identity_sessions row onto the record entity and
    deletes the claimant's provisional entity. The freshness guard stays STRICT: the merge is
    permitted only if the provisional entity has zero cards, threads, inbound rows and
    transactions — otherwise manual_review. Convergence requires a live verified license row
    (no separate approval); the card flips record -> practice in the same transaction; idempotent.
    card_kind gains 'record' and 'practice' in a future migration; displayKindFor already maps
    practice (src/capabilities/card-copy.ts) and 'record' correctly falls through to person/
    business until claimed.
A1 MANUAL FALLBACK (phone binding) — approved in DESIGN ONLY. NOT built this session; it ships
    with S5 (monitoring) and stays DRAFT until deus-credential-verification-v1-phone.html is
    checked into the repo (it is in neither repo today). The recorded design: migration 0036 adds
    credential_fallback_challenges(verification_id, nonce, phone_called, issued_at, echoed_at,
    issued_by) and public.record_manual_fallback(p_verification_id, p_nonce, p_phone_called,
    p_reviewer_entity), service_role ONLY, with five SQL-enforced guards — (a) the row's
    snapshot.reasons[] must be a SUBSET of the identity-ambiguity set {name_mismatch,
    identity_name_unavailable, exclusions_ambiguous, exclusions_unavailable}, so a row failing
    for not_found / not_active / status_unknown / discipline_observed / R4 collision can NEVER be
    fallback-verified; (b) p_phone_called must appear in that row's OWN stored snapshot (the
    boards publish practice phones), anchoring even the manual path to primary-source data;
    (c) the nonce must have been issued at least a minute earlier and echoed back; (d) the write
    records method='manual_fallback' + reviewed_by + the challenge id, permanently
    distinguishable from psv_api; (e) the R4 unique index still binds. Standing honesty: this is
    not an approve button and there is none, but service_role bypasses RLS by design, so a hand
    UPDATE at the SQL console remains possible and cannot be revoked without breaking the Worker
    — the design constrains and audits the only legitimate use of it rather than pretending
    otherwise.
A2 LIVEMODE — fixed in the S3 build, not deferred. entity_identity_sessions.livemode has been
    stored since pos-0003 and never read; dev and production share one Supabase project, so a
    TEST-mode identity session is today indistinguishable to the ceremony from a live one and
    could bind a real stamp. The ceremony now asserts the session's livemode matches the Stripe
    key in use; a mismatch is manual_review with reason livemode_mismatch, and verify-credential
    covers it.
A3 PROOF ASSERTION 1 — the name-as-search-key resolution is approved: run ONE test-mode identity
    session, read what verified_outputs actually contains, then find the REAL holder of that exact
    name in NPPES or the three Oregon boards and submit their number, so both sides of the
    concordance remain real facts. A dev-only name override is forbidden permanently — it would be
    the override path this feature exists to refuse. If no exact holder exists, the build STOPS and
    reports; that is Derrick's ruling to make, never an agent's workaround.
3-BUILD sequencing: docs commit first (this block, roadmap synced to hearth-pos); branch
    feat/credential-binding; shape.ts + ceremony.ts carry S3-1 and A2; verify-credential extends
    to the full rule matrix (one case per rule, against the real licensees captured in
    docs/CRED_S2_CAPTURE.md) plus assertions 1 and 3 with all four force-approve failures;
    docs/CRED_S3_COLD_FLOW_SPEC.md emitted for the hearth-pos session; hearth-pos NOT touched;
    tsc clean; prior verify scripts pass. No push, no deploy.

## RULINGS — 2026-08-23 (credential S3 close-out)
S3-A1 ASSERTION 1 — do NOT pursue a live-mode identity verification for this proof; the real
    clinician arrives with Film #3 in week 3. The check ruled in its place could not be performed
    as premised: the network holds NO legal name for entity 225606, or for anyone. All five
    entities with id_verified = true are bound to Stripe TEST-mode sessions, and every one of them
    carries Stripe's fixture identity "Jenny Rosen" (verified by retrieval on 2026-08-23 for
    225606, 746005 and 237698; entity_identity_sessions holds 5 rows, livemode=true on ZERO).
    There is therefore no name to match against NPPES, and the already-proven fact stands that no
    NPPES individual named Jenny Rosen exists (exact query, use_first_name_alias=false →
    result_count 0) nor any such licensee at the three Oregon boards. Film #1 accordingly ships
    with the MECHANISM demonstrated and the stamped end-state honestly captioned as awaiting a
    real licensee. Nothing was invented and no dev-only override was written.
S3-A2 CONSEQUENCE (new, needs its own ruling): entities.id_verified = true currently rests on a
    test fixture for all five verified entities, and that flag is what CardView renders as the
    `id` stamp. This is the R-GAP principle again — stamps mean a check happened. The A2 livemode
    assertion built this session refuses such a session at CONCORDANCE time under a live key, but
    it does not retroactively clear the flag. Options are the R-GAP treatment (reset to false
    pending a real verification) or a live-mode re-verify; NOT decided here.
S3-A2 RULED — LAUNCH GATE (2026-08-23, resolves the "needs its own ruling" item above).
    At production cutover, every entity whose bound entity_identity_sessions row has
    livemode = false must have id_verified reset to false before any live traffic. All five
    current identity sessions are test-mode Stripe fixtures (Jenny Rosen); the flag truthfully
    records a test-mode check and stays as-is on dev. This is the R-GAP principle applied at the
    boundary rather than retroactively: the A2 concordance assertion refuses a test-mode session
    under a live key going forward, and this gate clears the stamps minted before it existed.
    Neither of the two options floated above is taken standalone — the reset is scoped to
    cutover (not now), and a live-mode re-verify is the entity's own path back to the stamp.
S3-A3 UNACCENT — SUPERSEDED, see S3-A3 RE-RULED below. (Original text, kept for the record:
    accepted as a real false-clear class. Fix as migration 0036 in the NEXT session: unaccent
    (or an equivalent immutable fold) inside the oig_leie generated column expressions, a full
    re-ingest so stored rows are recomputed, and a verify case on a real accented LEIE surname.
    MUST land before Film #1, which asserts on camera that exclusions work. Logged in DEFERRED.md
    with that trigger.)
S3-A3 RE-RULED — MIGRATION 0036 DROPPED (2026-08-23, on evidence; the premise was wrong).
    THE EVIDENCE, recorded here so the accent theory is never re-derived:
      (a) The OIG source carries ZERO non-ASCII bytes. `LC_ALL=C grep -c $'[\x80-\xff]'` over
          UPDATED.csv returns 0 across all 15,578,603 bytes / 83,842 rows (last-modified
          2026-08-10, matching the mirror's stamp and its exact row count). OIG transliterates
          at the source.
      (b) The mirror agrees, under a POSITIVE-CONTROLLED filter: lastname / firstname / busname /
          address `match [^ -~]` each return 0, while the controls `lastname match [^A-Z]` → 2,488
          and `lastname match ^GONZ` → 268 prove the operator works. The zero is a real zero.
      (c) The premise case DOES NOT REPRODUCE. Live lookup: "NÚÑEZ","JOSE" → lastname_n=NUNEZ →
          2 hits, identical to "NUNEZ","JOSE" → 2 hits. normalizeNamePart's NFKD fold maps an
          accented QUERY into exactly the ASCII form OIG already stores, so the asymmetry is
          self-cancelling. unaccent on ASCII input is the identity function: 0036 as scoped was
          a no-op against real data.
    THE REAL BUG, found in the same investigation and live today: rule N2 was missing from
    normalizeNamePart (src/credential/shape.ts). NFKD does not decompose Ø Æ Œ Ł Đ Þ Ħ Ŧ, so the
    LOOKUP side DELETED them while OIG transliterates them. Demonstrated against real rows:
    "SØRENSEN","VICKIE" → lastname_n=SRENSEN → 0 hits → CLEAR, against a stored VICKIE DAWN
    SORENSEN, NPI 1366680761, 1128a2, excluded 2019-01-20 — a real excluded party with a real NPI,
    cleared by a native-orthography spelling. Same for "ØSTERGAARD","MARY" (STERGAARD vs
    OSTERGAARD) and "ŁUKASZEWICZ","GERARD" (UKASZEWICZ vs LUKASZEWICZ).
    THE FIX (approved, built on feat/n2-lookup-fold): normalizeNamePart applies the EXISTING
    NON_DECOMPOSING map before NFKD — rule N2, already ruled in the S3-1 binding algorithm and
    already used by normalizeName. No migration. name_hash / canonicalNameKey are unaffected
    (they call normalizeName, which already had N2), so no stored hash is invalidated.
    WHY NO MIGRATION HARDENS THE STORED SIDE: on guaranteed-ASCII data a SQL fold adds nothing,
    and it would create a second fold implementation in a second language whose lockstep with
    shape.ts nothing can enforce — the exact drift the file's own comment warns about. Instead
    scripts/ingest-leie.ts ENFORCES the invariant: any non-ASCII byte in the download refuses the
    load loudly, before the first insert, leaving any previous complete mirror intact.
    UNACCENT, for the record (not needed, but asked and answered): extension availability was NOT
    confirmable from the session — PostgREST exposes only public / graphql_public (406 PGRST106 on
    Accept-Profile: pg_catalog; 404 PGRST202 on rpc/unaccent), and there is no DB password or PAT.
    unaccent(text) is STABLE, not IMMUTABLE, so a generated column would have required an
    IMMUTABLE wrapper over the two-arg regdictionary form — an ASSERTED immutability that silently
    stales stored values if the dictionary changes. Pre-PG17 a stored generated column's expression
    cannot be altered: the route is DROP + re-ADD, whose table rewrite recomputes every existing
    row automatically, so a re-ingest would NOT have been required for correctness; oig_leie_name_idx
    drops with the column and must be recreated in the same migration.
S3-A4 INCIDENT (verify-credential wiped the loaded LEIE mirror on 2026-08-23) — accepted, closed.
    Self-reported, restored by re-running scripts/ingest-leie.ts (83,842 rows, source
    2026-08-10 — identical), and section G rewritten NON-DESTRUCTIVE (stubbed unfit branches,
    read-only real-mirror fit path). No ledger entry required; no further action.

## RULINGS — 2026-08-23 (credential S4 proposal, six ruled) — BUILT
S4-1 DERIVED STAMPS — approved as proposed. id/biz keep the entity flags (identity lives in
    entity_identity_sessions, not verifications — R-GAP; no verifications type exists for
    business); lic/npi derive from LIVE verified rows only. fetchStampDetails is a third
    batched read keyed by owner, sibling to fetchCardFacts and fetchBands — one subrequest
    per 50 owners, never per card. Assertion 4 is structural, not promised: the read filters
    status='verified' AND voided_at IS NULL, so a voided row stops matching and the stamp is
    gone on the next query with no read-path change.
S4-2 VOID PATH — option (a): voiding goes THROUGH record_verification_outcome so
    entities.credential_verified recomputes in the same call. The assertion-4 demo voids the
    way production voids. STANDING FOR S5: its auto-voider uses the same writer.
S4-3 MONITORING COPY — enrollment-only, approved verbatim. S5 CHECKLIST ITEM: upgrade
    'Enrolled for re-checks' to 'Re-checked {checked}' when monitoring ships. Until then
    'Re-checked monthly' would be a false claim — the no-plausible-placeholder rule applies
    to sentences, not only to numbers.
S4-4 HONORIFIC — option (a): ONE sanitizer in shared.ts (renderDisplayName) applied at EVERY
    display-name render, not card-view only. A stripped honorific on the card and an
    unstripped one on the pay page would teach that the gate is cosmetic. 'Dr.' survives only
    where a live verified licence row is classified doctoral. The classifier keys on
    (source, category), NEVER on the board alone — OBOP licenses both 'Psychologist'
    (doctoral) and 'Psychologist Associate' (not), and the Oregon Medical Board licenses
    physician assistants and acupuncturists beside its MDs. NPPES never classifies: its
    credential field is provider-attested at enumeration, which is the very kind of
    self-assertion this gate exists to stop honouring.
S4-5 RECEIPT WORDING — approved verbatim EXCEPT receipt 3's manual_review line. 'Names did
    not match' names a cause that may be false (an ambiguous exclusion, an unreadable
    discipline section and an R4 collision all land in manual_review too). Replaced with
    "This didn't settle automatically" / "Nothing is stamped until it does."
S4-6 MIGRATION — one migration, 0036, section-commented, full grant block on both functions,
    receipt as the final statement. Applied 2026-08-23; record_verification_outcome verified
    as exactly one function, pronargs 9.
S4-BUILD NOTE (2026-08-23): the Tier 3 stamp line takes the VERTICAL form (one stamp per
    line) whenever any stamp carries detail. ' · ' separates stamps from each other AND the
    parts within one stamp's detail, so a single joined line became unreadable the moment
    dates arrived. Bare stamps keep the compact joined line. This is the layout the S4
    proposal showed; it is recorded here because it was not called out as a decision.


## RULINGS — 2026-08-24 (credential S5 proposal, nine ruled) — BUILT
S5-1 ADVERSE-ONLY VOIDING — confirmed. Expired, not-active, board action observed, exclusion
    hit void. Unreachable source, unknown status vocabulary, unreadable discipline section,
    unfit mirror and unparseable stored dates NEVER void: they keep the stamp, log, retry.
    "We could not check" is not "it is not true" — the false-VOID inverse of BUG-014, and
    worse, because it takes credentials from people who still hold them.
S5-2 NEWLY-AMBIGUOUS EXCLUSIONS — leave-and-log, never downgrade to manual_review. A stamp
    earned on evidence is not revoked by a later ambiguity. Surfaced in the sweep report.
S5-3 EXCLUSION HIT — voids the LICENSE row with reason exclusion_match; the exclusions row
    records the finding.
S5-4 SCHEDULING — one handler, pending-first, 2 rows/tick. No wrangler.jsonc change. A
    second cron expression was rejected: it would concentrate board load into a burst,
    where a trickle is the politer thing to point at a state board.
S5-5 CADENCE — 30 days, matching the LEIE's monthly publication and the YYYY-MM the card shows.
S5-6 name_hash COALESCE in 0037 — yes. Logged as BUG-015: the 0036 writer force-wrote it, so
    the first passing re-check would have erased a live stamp's R2 fingerprint silently.
S5-7 catch_me_up BLINDNESS — accepted for lite; DEFERRED entry with the trigger "first owner
    reports missing a void notice".
S5-8 NOTICE COPY — all four variants approved verbatim. "This is what the board publishes,
    not a decision made here" is NOT to be softened: it is the sentence that stops the
    network being read as the authority that took the stamp away.
S5-9 monitor_checked_at — confirmed as the receipt's truth condition. Closes the S4-3
    checklist item.
S5-BUILD NOTE (2026-08-24, AGENT'S MECHANISM — NOT RULED): how S5-2's "surfaced in the
    sweep report" is implemented. An ambiguous re-check does NOT bump checked_at, so the row
    stays at the head of the queue and is seen every tick rather than once. The ruling said
    leave-and-log and surface it; choosing queue position as the surfacing mechanism was a
    build decision. It first appeared inside the S5-2 ruling text, which was wrong — a
    mechanism is not a ruling — and was moved here on correction. It carries a cost, logged
    in DEFERRED: inconclusive rows behave the same way and MONITOR_BUDGET is 2, so two stuck
    rows occupy the entire monitoring queue.
S5-BUILD NOTE (2026-08-24): APPLY SHAPE. The two-block-in-one-file migration does not
    survive the Supabase SQL editor, which wraps a paste in one transaction. 0037 was
    hand-split at apply time and the repo now matches: 0037a (the enum line) + 0037b
    (begin->commit, receipt final), sharing one ledger id '0037'. Promoted to the CLAUDE.md
    SPLIT-ENUM RULE; 0004 and 0033 are grandfathered with reasons.

## SPRINT AMENDMENT — 2026-08-24 (both films move post-sprint)
FILM-1 FILM #1 and FILM #3 both move to a SINGLE post-sprint production session against the
    finished system. The sprint's Day 6 and Day 10 evening slots become RUN AND REPORT, not
    shoot. Recorded in PLEXMED_10_DAY_SPRINT.md (Day 6, Day 10, and its own amendment block).
FILM-2 REASON — filming against a half-built stack produces footage that gets reshot anyway.
    Film #1 on Day 6 would have been shot before the clinician card, the availability chip,
    Ask-first, the wrap and the superbill existed, every one of which appears on screen in
    Film #3's path. Two shoots against two different half-systems cost a sprint day and yield
    nothing that survives.
FILM-3 THE PROOF STANDARD'S "AND FILMED" CLAUSE BECOMES "RUN AND REPORTED".
    docs/CRED_PROOF_STANDARD.md is the ARTIFACT OF RECORD — full transcript, tally, and the
    standing gaps stated in the artifact rather than in a chat message. Amended in
    CREDENTIAL_VERIFICATION_BUILD.md's DEFINITION OF DONE and its Prompt 5-BUILD line, which
    is where the clause actually lived (neither file named in the amendment prompt — flagged
    and edited, because leaving "film it" in the build doc would have contradicted this).
FILM-4 UNCHANGED — build order, session scope, and what must be true before the Portland
    seed. The system still has to work and "verified clinician" still rests on the proof
    standard passing. Only the moment the camera runs moved.
FILM-5 TRIGGER HYGIENE — DEFERRED carried "BEFORE Film #1" on the N2 lookup fold + ingest
    ASCII guard + SØRENSEN verify case. That work SHIPPED (BUG-014, merge 0e5be5e) before this
    amendment, so the trigger fired and was satisfied; the entry moved to DEFERRED's Done
    section with its hash rather than being left pointing at an event that has moved. No other
    DEFERRED entry references a film.

## RULINGS — 2026-08-25 (visit lifecycle, PLEXMED S5) — approved for 5-BUILD
Source: PLEXMED S5-INVESTIGATE report (main @ baed6bc), which found these five rulings
ABSENT FROM CANON — they had been ruled in strategy chat and never written down, and the
soft hold contradicted a locked block. That is the failure the canon hierarchy exists to
catch ("A RULING IS NOT A RULING UNTIL IT IS IN THE ROADMAP"), caught by the agent rather
than by a build that shipped against a fiction. Written here before 5-BUILD is issued.
Binds PLEXMED_CARE_LOOP_BUILD.md Session 5.

VL-1 SOFT HOLD. A booking request on a practice-kind slot claims it atomically, held until
    min(24h from request, slot start − 60min). This SUPERSEDES Day 22 ruling 3
    (roadmap:795-798) NARROWLY: a hold is not a reservation — it is a bounded exclusivity
    window on a practice-kind slot, expiring by predicate (held_until <= now()), with no
    scheduler, no cron, and no background state write. Day 22's deferral trigger ("until a
    real seller reports a held-slot problem") is FIRED by clinical booking, where a patient
    losing a requested time minutes before it starts is a product failure. Day 22 ruling 3
    STANDS UNCHANGED for every non-practice kind.
VL-2 LEAD TIME. Nothing books inside 60 minutes of slot start.
VL-3 SETTLE ON ACCEPT — CONFIRMS Day 22 decisions 1-2, not new: a request moves no money;
    acceptance settles payment. A lapsed hold therefore never touches refunds.
VL-4 EXPLICIT ZONE. All times stored UTC; every rendered time carries an explicit zone;
    each party reads their own wall clock. The server NEVER emits relative time — "today"
    is a client rendering, which is also what Session 5 already said ("derives client-side
    from slots", PLEXMED_CARE_LOOP_BUILD.md:319-320) and what the DATE/TIME rule requires.
VL-5 ATOMIC CLAIM. One UPDATE with the hold conditions in the WHERE. Zero rows = refused
    (the SUPABASE WRITE RULE already classes that as failure). Never SELECT FOR UPDATE
    then write.

S5-1 CANCEL DOES NOT AUTO-REOPEN. A cancelled visit's time does not return to the card by
    itself — it may not be re-offerable, and that is the clinician's call. The open-times
    board offers "Re-open this time".
S5-2 set_engagement_schedule (0019) IS REFUSED on a slot-bound engagement. A seller moving
    scheduled_for underneath a bound slot would desynchronise the row from the contract
    term. The board is the reschedule surface.
S5-3 BOOKINGS PAUSE WHEN THE STAMP VOIDS. The card stays kind 'practice' — the kind never
    rewrites history, the card IS the offer — but its slots stop being eligible while the
    owner has no live verified licence row. The offer survives; bookability tracks
    licensure. Routes into the same auto-pause path as an empty board: no new state, no
    new copy. (The lic stamp stays the OWNER's; the card is the offer.)
S5-4 ZERO CLAIMABLE SLOTS → ACTION NONE. "Auto-pause knocks when empty" is literal. The
    compact chip reads "No open times" and no booking action renders. Degrading to
    ask_connect was rejected: a practice card with no times is paused, not converted into
    a message surface.
S5-5 QUANTITY IS REFUSED on a practice booking — refused, never silently dropped (mirrors
    the existing scheduled_for refusal, reach-entity.ts:188). A REAL DEFECT found in
    S5-INVESTIGATE: the accept branch snapshots price_cents × coalesce(quantity,1)
    (0028/0033), so a quantity on a practice booking would mint "2 × $95" against ONE
    slot. Ledger it if it is ever observed in the wild; here it is closed before it can be.
S5-6 'record' KIND DEFERRED to the claim-convergence build. S3-3 (roadmap:1587) says
    card_kind gains 'record' AND 'practice'; 0038a adds only 'practice'. Deliberate scope,
    not a half-executed ruling. The convergence flip record→practice composes with S5-8's
    trigger — convergence already requires a live verified licence row.
S5-7 DOUBLE-HOLD IS ALLOWED in v1. A patient holding two times while deciding is
    reasonable, and the clinician sees both on their board. DEFERRED entry with the
    trigger "first clinician reports a serial holder".
S5-8 LICENSED STATES ARE READ-ONLY, derived from live verified rows only. A self-asserted
    state list sitting inches from a stamp that says "verified" is a plausible placeholder
    in sentence form (ruling 3 of CRED S5 already settled that the rule covers sentences).
S5-9 THE PRACTICE-KIND CREATION GATE IS A TRIGGER, NOT AN RPC. hearth-pos writes cards
    directly under RLS with a client-supplied kind (CardContext.tsx:346,403), so an
    RPC-only gate is bypassable by the same client that already writes the column. This
    governs who may SET the kind — an authoring permission. It does NOT make display_kind
    derive from verification: the 2026-08-22 CORRECTION stands, display_kind maps from the
    enum alone.

S5-10 THE BOOKING KEY IS THE INSTANT, AND THERE IS NO SECOND KEY (ruled 2026-08-25,
    after 0039). A practice booking is reach_entity(kind 'booking') with scheduled_for set
    to one of the card's open times, copied exactly as the card gives it. reach_entity
    gains NO slot_id parameter — not now, not as an optional alternate.
    WHY THE INSTANT IS SUFFICIENT: card_slots_card_start_uniq (0038b) is a partial unique
    index on (card_id, starts_at) where released_at is null, so an instant names exactly
    one live row on a card. The Worker's instant→row lookup is advisory; the claim's own
    WHERE decides (VL-5), so a resolution that goes stale loses the race rather than
    booking the wrong thing. Proven end to end before this was ruled
    (scripts/verify-slots.mjs R5/R9).
    WHY A SECOND KEY IS REFUSED: two accepted identifiers for one row is the ambiguity the
    single-canonical-write-path rule exists to prevent — the day they disagree (an id from
    a stale list, an instant from a fresh one) the server has to pick a winner, and every
    such choice is a bug waiting for a reason. It also puts an opaque id back in the agent
    surface that discipline rule 10 keeps out.
    WHAT slot_id IS FOR: 0039's list returns it as CORRELATION DATA — the clinician's own
    board, and the audit imprint claim_slot_and_knock already writes. It is deliberately
    NOT carried in any MCP payload: present in the row an agent could see would be an
    invitation to try booking with it.
S5-11 THE PREDICATE HAS ONE DEFINITION (recorded 2026-08-25, 0039 SECTION 1). 0038b
    defined eligibility inline inside open_slots_for_cards; 0039 lifts it into
    public.eligible_card_slots and rewrites open_slots_for_cards as a projection over it,
    same signature and same return columns. Standing rule for anything that reads open
    times: READ THE HELPER, NEVER COPY THE PREDICATE. A second copy that drifts means a
    card offers a time the claim refuses, which is the failure this whole feature is shaped
    to prevent. claim_slot_and_knock's own WHERE is NOT a copy and must stay separate — it
    is the authority (VL-5), not a reader.

5-BUILD sequencing: docs commit first (this block, roadmap synced to hearth-pos, DEFERRED
timezone entry re-homed); branch feat/practice-card; 0038a (the enum value alone, no
receipt) + 0038b (card_slots, entities.timezone, the claim/release/read RPCs, the clinician
RPCs, the practice trigger, respond_to_inbound v8, receipt '0038' as the final statement)
written to migrations/ and STOPPED for hand-apply — two whole files, pasted each in one
go, no hand-splitting at the console (SPLIT-ENUM RULE). Then the Worker code, the authoring
spec into docs/, and scripts/verify-slots.mjs proving concurrent-claim, expiry, accept-binds,
decline-releases and the expired band. tsc clean, proof standard still green. No push.

## RULINGS — 2026-08-25 (PLEXMED S6 proposal, clinical incoming — six ruled, approved for 6-BUILD)
Source: PLEXMED S6-INVESTIGATE report (main @ 105b417). Binds PLEXMED_CARE_LOOP_BUILD.md
Session 6. Prior rulings unchanged: CRISIS_RULE / SYMPTOM_RULE / ROUTING_RULE, VL-1..VL-5,
S5-10, S1-3 (get_status is not widened).

S6-1 THE DISCLAIMER CHIP READS "NOT TRIAGED · IN THEIR OWN WORDS", unconditional on every
    practice request. THIS SUPERSEDES the build doc's "NON-ACUTE · SELF-DESCRIBED (always,
    verbatim)" — PLEXMED_CARE_LOOP_BUILD.md Session 6 item 1, edited in the same commit so
    the doc cannot keep calling superseded copy verbatim.
    WHY: "NON-ACUTE" is a bare clinical adjective in the LEADING position. A clinician
    scanning a queue reads it as a determination and may deprioritize — a verdict this
    network never made, on the one axis where being wrong costs most. "SELF-DESCRIBED" was
    meant to defuse it, but a qualifier trailing a verdict is exactly the shape S1-1 already
    struck when "Verified Clinician." came off the practice governance line: a claim inside a
    sentence, outliving its truth. The replacement asserts only what is true — nobody
    assessed urgency, and the words are the patient's own.
    UNCONDITIONAL, and that is load-bearing: this chip is a disclaimer about the NETWORK, not
    a fact about the person. A disclaimer that renders sometimes is a verdict by another name.
    Standing note: assistants are instructed to route crises to 988 instead of booking
    (CRISIS_RULE), and that instruction is NOT a check. No copy anywhere may imply it is.
S6-2 NO RESIDENCY CHIP, AND NOTHING REPLACES IT. Its impossibility is proven, not assumed:
    entity_identity_sessions stores session id, report id, livemode and timestamps and
    nothing else (hearth-pos 0003_identity_session.sql:35-45, "Never store name/DOB here"),
    which is R2; and R3-AMENDED gates Stripe's verified_outputs behind a 48-hour restricted-key
    window that an Incoming tile renders long outside. A "location not checked" chip is also
    REFUSED: a second disclaimer beside S6-1 dilutes the one that matters.
S6-3 THE HISTORY CHIP IS NETWORK-SCOPED AND SAYS SO. Expanded text must contain "on this
    network" and must never imply a care relationship. "New patient" appears NOWHERE:
    new-versus-established is a billing distinction (CPT) the network cannot make, and S7's
    wrap will surface new/follow-up from the clinician, who can. Derivation is
    threads.established_at on the pair thread, which flips after ANY accepted reach and not
    only after a visit — stated in the copy rather than left to inference.
S6-4 ASK-FIRST IS THE ABSENCE OF A STATE. inbound.status stays 'pending', card_slots is not
    touched, and the hold therefore keeps running with no code saying so. No thread_state
    value is added: S1-3 already ruled the poll-then-get_messages handoff correct, and it
    carries ask-first unchanged. THE GATE IS ASYMMETRIC — the RECIPIENT of a pending request
    may write; the SENDER may write only once the recipient has. Consent flows from the
    question, so a stranger cannot talk their way in pre-accept. Bound: the sender may not
    post twice in a row (one EXISTS on the last message's author).
S6-5 A QUESTION DOES NOT EXTEND THE HOLD. VL-1's window exists because a patient losing a
    requested time minutes before it starts is a product failure — THE HOLD PROTECTS THE
    PATIENT. Extending it on the clinician's question converts a patient protection into
    clinician optionality, paid for by the patient waiting and by everyone else who cannot
    have that time. A lapse mid-conversation is therefore a real state and not an edge case:
    the conversation survives, nothing can be booked through it, the band reads 'expired', and
    the resolution is the patient asking again — possibly for the same time, if it is still
    open, on a fresh hold.
S6-6 THE CHIPS READ RETURNS EXACTLY THREE FLAGS per pending request — sender identity
    verified, first contact, question asked — and nothing else. No display_name, no deus_id,
    no other verification flag. PRE-ACCEPT ANONYMITY IS 0007'S DESIGN AND IT HOLDS:
    get_my_thread_peers requires established_at, so a clinician answering a knock does not
    learn who is knocking, and a chip surface grows to fit whatever its read returns.
6-BUILD sequencing: docs commit first (this block + the Session 6 edit, both synced to
hearth-pos); branch feat/clinical-incoming; 0040 written to migrations/ and STOPPED for
hand-apply. Then the RPCs, respond_thread's fallback branch, the chips read, the copy into
docs/PLEXMED_S6_INCOMING_SPEC.md (carrying the useInbound scheduled_for gap and the messages
realtime gap as app-side items), and scripts/verify-inquiry.mjs. tsc clean, proof standard
still green. No push.

## RULINGS — 2026-08-25 (PLEXMED S7 + S8, Today · Visit · Wrap · Superbill — approved for 7-BUILD)
Source: PLEXMED S7-INVESTIGATE report (main @ dede80f), plus five decisions ruled the same
day. Binds PLEXMED_CARE_LOOP_BUILD.md Sessions 7 and 8 (S8 scoped to SUPERBILL +
visit-summary export only; private notes are post-sprint per the sprint CUT LIST). Prior
rulings unchanged: CRISIS_RULE / SYMPTOM_RULE / ROUTING_RULE, VL-1..VL-5, S5-1..S5-11,
S6-1..S6-6, S1-3 (get_status is not widened).

S7-1 TODAY IS SELLER-SIDE, DATED, AND LIVE — AND IT DOES NOT HIDE HALF THE DAY. The set is
    seller_entity_id = me, status in ('accepted','paid'), scheduled_for inside the requested
    window, ALL KINDS — not practice-only. A clinician who also sells a non-practice thing has
    that commitment on the same day, and a Today that renders only practice rows is a calendar
    that lies by omission. Practice-card rows carry the visit and wrap affordances; other dated
    rows render as plain commitments with neither. Order: scheduled_for asc, tiebreak
    created_at asc.
S7-1a AMENDED AT BUILD TIME — THE DAY INCLUDES WHAT HAS ALREADY BEEN WRAPPED (ruled
    2026-08-25, after 0041 was written and before it was applied; 0041 applied
    2026-08-26T05:53:55Z carrying the amended form). S7-1 as first ruled set the WHERE to
    `status in ('accepted','paid')`. get_my_day includes 'fulfilled'. 'cancelled' stays OUT.
    DERRICK'S REASONING, RECORDED AS GIVEN: "a derived state the read cannot produce is
    internal evidence the WHERE was too narrow, and a visit vanishing from the clinician's day
    at wrap time is the same lie-by-omission S7-1 rejected for practice-only filtering.
    'cancelled' stays out; the board is where a cancelled time is re-offered."
    The unreachable state is S7-8's `wrapped` (fulfilled_at not null): under the original WHERE
    nothing could ever return a row in it, so a 9am visit wrapped at 9:30 left the day at 9:30.
    'cancelled' is excluded on S5-1 — a cancelled time does not auto-reopen, and the open-times
    board is the surface that re-offers it. Found by the agent while implementing S7-8, flagged
    in 0041's header rather than shipped silently, and ruled before apply.

S7-2 THE DAY WINDOW IS COMPUTED CLIENT-SIDE AND PASSED IN AS TWO UTC INSTANTS. VL-4 forbids
    the server emitting relative time and the DATE/TIME rule forbids TZ-implicit server
    formatting, so the read takes p_from/p_to timestamptz exactly as get_my_card_slots already
    does (0038b:565-568). The app computes "today" from entities.timezone, falling back to UTC
    WITH AN EXPLICIT UTC LABEL — never a guessed local zone (0038b:164-166). The zone is the
    CLINICIAN'S: Today is the clinician's day; the patient's zone is their assistant's problem
    and always has been.
S7-3 THE ROOM IS MINTED AT T-60 BY THE WORKER'S EXISTING SCHEDULED HANDLER, AND NOWHERE ELSE.
    RULED HERE BECAUSE IT WAS NEVER IN CANON: the strategy-chat phrase "per canon" covered a
    timing and a channel that a grep of the roadmap, the sprint file, the build doc, docs/ and
    DEFERRED could not find — the only prior text is PLEXMED_10_DAY_SPRINT.md:42-48 (Daily.co
    prebuilt rooms, free tier, BAA before any real patient, tap-out) and
    PLEXMED_CARE_LOOP_BUILD.md:475 (tap-out room). Caught by the S7 agent, not by a build that
    shipped against a fiction — the same catch as VL-1's.
    MECHANISM: the Worker already runs a per-minute cron (wrangler.jsonc:37-39, src/index.ts:72,
    src/credential/ceremony.ts:337). The visit sweep rides it under the pattern CRED S5 ruling 4
    already fixed (ceremony.ts:322-335): one handler, pending-first, each sweep budgeted, each
    wrapped so one failure cannot starve the other. NO new cron expression, NO wrangler.jsonc
    change, therefore no `npx wrangler types`.
    WHY NOT AT ACCEPT: accept runs app-side through respond_to_inbound (0038b:651), a Supabase
    RPC. The Worker is not in that path and the app cannot hold a video-vendor API key. Minting
    from two places is two write sites for one row — single-canonical-write-path, verbatim.
    WHY T-60 IS THE RIGHT NUMBER AND NOT A ROUND ONE: VL-2 says nothing books inside 60 minutes
    of slot start, so at T-60 the hour's roster is final BY CONSTRUCTION. It also means a visit
    cancelled before T-60 never mints a room at all — no vendor object to revoke, no orphan link
    in a thread, no cleanup path to get wrong.
    EXPIRY, TWICE: the room is created with a vendor-side expiry at slot ends_at + 30 minutes
    grace (Daily's `exp`; LiveKit's token TTL) — the expiry that matters, because the party
    running the media enforces it. Ours is nothing: the message stays readable forever and
    should. The copy says the room closed, never that the link vanished. room_url is never
    nulled after the fact — it is a receipt of what was created.
S7-4 THE LINK ARRIVES AS A THREAD MESSAGE ON THE ENGAGEMENT'S THREAD, WRITTEN AS
    origin = 'system'. Both parties see it (messages_select_participant, 0004:77) and the
    patient's assistant reads it through the existing get_messages with NO tool change and no
    new agent surface. RULED HERE FOR THE SAME REASON AS S7-3 — the channel was never written
    down either.
    THE GAP THIS CLOSES: no 'system'-origin writer exists anywhere. post_message hardcodes
    'human' (0004:203) and derives the actor from the caller, so a Worker posting the link would
    post AS THE CLINICIAN — a lie about authorship on a clinical surface. post_visit_link(...)
    is service-role only (the 0032:102 grant variant) and writes the row with origin = 'system'
    and engagements.room_url in one transaction. message_origin's third value finally acquires
    the writer it was declared for at 0004:29.
S7-5 THE PLAN IS APPEND-ONLY. A CHECK-OFF IS A NEW MESSAGE, NEVER AN EDIT. Plan tiles are
    thread messages (messages gains nullable `kind text` + `payload jsonb`; NOT a new table, as
    Session 7 asked). The design is decided by one constraint and not by taste: get_messages is
    a `since` cursor on created_at (src/tools/get-messages.ts:118-121), so AN IN-PLACE jsonb
    UPDATE ON THE PLAN MESSAGE IS INVISIBLE TO EVERY CURSOR READER — the patient's assistant
    would poll forever and never learn an item was checked. Bumping created_at to force
    visibility would reorder the transcript and rewrite history. So: one 'plan' message, and
    each check-off a small 'plan_item' row; readers fold. Messages stay immutable and the audit
    trail gains who checked what, when — worth more on a clinical surface than a compact blob.
    The plan message's BODY carries a complete human-readable rendering composed in SQL (the
    shape the accept message already uses, 0038b:826-834), so an assistant that knows nothing
    about `payload` still reads the plan correctly. get_messages therefore gains NOTHING in v1 —
    zero widening of the agent surface.
S7-5a get_messages GAINS `kind`, AND `plan` ON PLAN MESSAGES ONLY (ruled 2026-08-26).
    THIS SUPERSEDES S7-5's closing sentence — "get_messages therefore gains NOTHING in v1 —
    zero widening of the agent surface." Everything else in S7-5 stands; the append-only
    design is what made the plan foldable at all.
    WHY IT HAD TO GIVE: a plan the patient cannot check off is a plan they cannot
    participate in, which defeats the reason the plan is a two-sided thread message rather
    than a clinician's note — and Film #3's patient is an MCP entity. Checking an item off
    means naming WHICH visit and WHICH item, and an assistant could learn neither: the
    get_messages allow-list (src/tools/get-messages.ts:110) carries no kind, no payload and
    no engagement_id; get_status returns three fields and S1-3 forbids widening it; get_my_day
    is authenticated-only. A tool alone would have been a button with no label.
    WHAT IS ADDED, AND NOTHING MORE: `kind` on every message (null on every row that exists
    today and on every pre-0041 writer's output), and on a kind='plan' message only,
    `plan: {items:[{n, text}]}` read straight from payload. n is 1-BASED — the tool's `item`
    argument is the number a person would say, and the 0-based index the SQL takes is
    converted in the handler, in one place, never shown to a model.
    FOLDED done-STATE IS DELIBERATELY NOT ADDED. DERRICK'S REASONING, RECORDED AS GIVEN:
    "idempotent writes mean the assistant does not need authoritative done-state to act
    correctly, and B would put a TypeScript fold beside the SQL fold in get_my_day — the
    drift S5-11 outlawed for slot eligibility. If folded done-state proves necessary later it
    earns 0042 and the plan_state() lift then, with a real trigger." DEFERRED entry opened
    with that trigger. State is still legible without it: each check-off is its own readable
    message in the same transcript ("Done: …"), which is what append-only bought.

S7-6 THE CODES ARE THE CLINICIAN'S RECORD, NOT A THREAD MESSAGE, AND THEY GET THE ONE NEW
    TABLE. The plan is a conversation and belongs in the thread; a diagnosis code is not
    something to hand a patient inside a chat, and the superbill needs it structured.
    public.visit_wraps — engagement_id unique, visit_kind text check in ('new','follow_up'),
    cpt_code, icd_codes text[], duration_minutes, patient_name_for_billing, patient_dob,
    wrapped_at. RLS ON WITH ZERO POLICIES, definer RPCs only, table grants revoked — the
    card_slots posture verbatim (0038b:140-148).
    visit_kind is the CLINICIAN'S pick, which is exactly the resolution S6-3 promised when it
    struck "New patient" off the chip. Never suggested, never ranked: the CPT short list is a
    static reviewed constant, not model output (PLEXMED_CARE_LOOP_BUILD.md:460, :443).
S7-7 WRAP OFFERS A TIME; THE PATIENT TAKES IT. Session 7's "follow-up booking = existing
    engagement creation with price snapshot" reads as though the CLINICIAN creates it. THEY
    CANNOT: every path that mints an inbound derives the sender from the caller (reach_entity →
    claim_slot_and_knock, 0038b:224), and a clinician minting a request FROM the patient would
    fabricate consent — against doctrine (PLEXMED_CARE_LOOP_BUILD.md:456-458, "Patient asks →
    network answers → humans accept, every time"). So wrap's follow-up action calls the existing
    post_card_slots (0038b:407) to put the offered time on the board and drafts a thread message
    naming it; the patient or their assistant books on the existing rails with THE INSTANT as
    the key (S5-10), which snapshots the price at accept exactly as it does today. Two-sided by
    construction, and it needs no new booking path at all.
S7-8 IN_VISIT AND WRAPPED ARE ATTRIBUTES, NOT STATES (decision 1, ruled 2026-08-25). Session 7
    item 3 asked for two new engagement_status values; that would have SUPERSEDED A LOCKED BLOCK
    (0017:26 "States: accepted → paid → fulfilled … scheduled_for is an ATTRIBUTE, never a
    state"; 0022:57 "no enum change — the status enum is locked by STOP-0"). Refused, and the
    argument that decides it is the broken writers, not the aesthetics: complete_engagement
    (0018:134), cancel_engagement (0018:229) and its 0022/0024 successors (0018:268) ALL gate on
    status in ('accepted','paid'), so an 'in_visit' engagement would silently fail to complete
    AND fail to cancel; EngagementScreen's Upcoming/Past split is status-based by ruling
    (hearth-pos EngagementScreen.tsx:39-41) and would drop those rows out of both sections.
    INSTEAD: engagements.visit_started_at timestamptz (nullable), wrapped stays status
    'fulfilled' via the existing seller-only complete_engagement (0018:93), and the tile state is
    DERIVED — the discipline get_my_card_slots already uses (0038b:594-601):
      cancelled_at not null → cancelled; fulfilled_at not null → wrapped;
      visit_started_at not null → in_visit; else → scheduled.
    Writer: start_visit(p_engagement_id) — definer, seller-only (0018:117-120's actor check),
    idempotent, refuses cancelled/fulfilled, audit-imprinted. CONSEQUENCE FOR NUMBERING: 0041
    adds no enum value and stays a SINGLE FILE (see 7-BUILD sequencing).
S7-9 ICD IS FREE TEXT, CLINICIAN-TYPED — NO LOOKUP, NO AUTOCOMPLETE (decision 3). No short list
    of diagnosis codes is honest across specialties, and any list we author is a suggestion by
    another name — which is the line PLEXMED_CARE_LOOP_BUILD.md:460 draws ("auto-coding …
    never"). CPT keeps its static reviewed short list (S7-6); ICD gets a text field and nothing
    else. A clinician-authored SAVED list is DEFERRED, not rejected.
S7-10 BUILD IT UNPROVISIONED (decision 4). The Daily.co account is Derrick's errand and the
    build does not wait on it. DAILY_API_KEY goes in Bindings but NOT in REQUIRED_KEYS
    (src/utils/env.ts:37 — the precedent for an optional binding is already at :27). Absent key:
    the sweep logs once and no-ops, room_url stays null, the Today tile says there is no room
    yet, and NOTHING ELSE DEGRADES. Only the room beat of the end-to-end walk waits on the
    account. The vendor is behind an interface (createRoom({engagementId, notBefore, notAfter})
    → {url, provider, expiresAt}) with a deterministic room name derived from the engagement id,
    so a retried tick returns the same room and LiveKit is a second file, not a rewrite.
S8-1 THE SUPERBILL IS A SUPABASE EDGE FUNCTION, NOT A WORKER ROUTE. Two of its four required
    inputs are SEALED to the client by ruling — transactions (0016:77-82; 0023 returns a boolean
    on purpose) and verifications (0035, re-asserted 0036) — so the client cannot honestly
    compose the PDF and generation is server-side, full stop. It is not a Worker route because
    token-planes canon fixes the Worker at exactly two planes and says a third "is a ruling, not
    a diff"; a superbill is agent-facing on neither. The in-family precedent is
    create-identity-session / create-connect-account / stripe-identity-webhook: authorize on the
    caller's own session JWT, read the sealed tables with service-role. PDF via pdf-lib on
    esm.sh, in the edge function ONLY — never in the Worker bundle.
    STAMPS ARE SNAPSHOTTED AT ISSUE, live rows only (status='verified' and voided_at is null —
    the verifications_live_stamp_idx predicate, 0036:155-157). A licence voided next month must
    not retro-edit an issued receipt, and the PDF must state what was true on the day it issued.
    LANDS IN A PRIVATE BUCKET, `superbills` — card-media is PUBLIC-READ (hearth-pos
    services/storage.ts:129) and must not be the pattern for a document carrying codes and a
    patient name. Access via a definer RPC returning a short-lived signed URL to participants
    only. The announcing thread message carries the SUPERBILL ID, never a raw expiring URL — a
    link that 403s next week reads as a broken product. HONEST LIMIT, stated up front: an MCP
    client cannot fetch from Supabase Storage, so the assistant-visible artifact in v1 is the
    visit-summary TEXT and the PDF is an app-side download; both are composed by the SAME
    serializer so they cannot drift.
S8-2 THE PATIENT'S NAME AND DOB ARE THE CLINICIAN'S ASSERTION, NOT THE NETWORK'S (decision 5).
    Both are clinician-typed at wrap and both are stored on visit_wraps. RULED VERBATIM:
      "a superbill is useless for reimbursement without the name and DOB the insurer holds, and
       the network cannot supply either (R2 — we store neither, by design). So the clinician
       asserts them. The schema comment and the PDF must both make the split legible: the stamps
       are the network's claim, the patient's name and DOB are the clinician's. Storing them is
       safe precisely because they make no verification claim — but they are PHI, so visit_wraps
       stays RLS-on with zero policies and definer-only access."
    The impossibility is proven, not assumed: entities holds display_name and nothing else
    (0000:42-60), and S6-2 established that name/DOB are never stored (hearth-pos
    0003_identity_session.sql:35-45, "Never store name/DOB here"). display_name PREFILLS the
    name field and is corrected by the clinician; nothing derives, infers or verifies a patient
    identity, and no copy may suggest the network did.

S8-3 THE SUPERBILL IS ISSUED ONCE (ruled 2026-08-26). superbills.engagement_id is UNIQUE
    (0041), and that stays the whole correction policy for v1: a second call returns the
    existing row, the existing path and the existing file. THE AGENT'S REASONING, ADOPTED AS
    THE RULING: "a corrections flow designed before anyone has needed one usually gets the
    shape wrong."
    CONSEQUENCE, STATED RATHER THAN DISCOVERED: a clinician who types the wrong CPT code has
    NO path to a corrected superbill in v1. The alternative — void-and-reissue — needs the
    UNIQUE relaxed to a partial index plus a voided_at column, i.e. a migration and a larger
    surface, and it can be built the day someone actually asks. DEFERRED entry with that
    trigger.
S8-4 NO SUCCEEDED CHARGE, NO SUPERBILL (ruled 2026-08-26). A superbill is a receipt for money
    that moved; printing one with a zero on it would be a document that misstates its own
    subject. The function refuses BY NAME. DERRICK'S REASONING, RECORDED AS GIVEN: an unpaid
    or cash-outside-the-network visit wants "a visit summary, a different document, not a
    superbill with a zero on it." DEFERRED entry opened for that document with the trigger
    "first clinician asks for a summary on a visit with no succeeded charge".
    Two further gates ride with this one and are ruled here so they are not left to the code:
    SELLER ONLY (a superbill is the clinician's statement about their own services; a buyer
    issuing one would be a patient authoring a provider's billing document) and WRAPPED ONLY
    (the codes live in visit_wraps; no wrap row, no superbill).
S8-5 STORED, NOT REGENERATED — AND THE VOID PROOF IS THE ASSERTION OF RECORD (ruled
    2026-08-26). 0041 already committed to this with `storage_path text not null`; it stands.
    WHY STORED: a re-render under a newer pdf-lib, a different font metric or a layout tweak
    produces a DIFFERENT FILE, and the clinician may already have handed this one to a patient
    who forwarded it to a payer. A receipt that changes is not a receipt.
    WHY THE SNAPSHOT IS KEPT ANYWAY: it is the auditable record of what was printed, and it
    can re-render the document if the object is ever lost. It is read INSTEAD OF
    `verifications`, never beside it.
    THE PROOF, WHICH DERRICK NAMED AS THE ONE HE CARES MOST ABOUT AND WHICH MUST BE LOUD:
    issue → void the licence → confirm the stamp is gone from a LIVE card read → re-call →
    identical superbill_id, identical storage_path, identical snapshot, and IDENTICAL SHA-256
    OF THE BYTES. That test is the receipt's integrity. Structural rather than careful: with
    engagement_id UNIQUE there is no code path that reaches the renderer twice.
S8-6 THE BUCKET IS A MIGRATION, NOT A DASHBOARD CLICK (ruled 2026-08-26). DERRICK, VERBATIM:
    "a dashboard-created bucket is infrastructure with no file describing it." pos-0005 creates
    it and its policies in the pos-0002 shape (bucket insert + storage.objects policies, RLS
    already on). Private, application/pdf only, participant-scoped SELECT for authenticated,
    and NO insert/update/delete policies — only the edge function writes, under service-role.
S8-7 THE SUPERBILL'S HEADER AND FOOTER ARE APPROVED VERBATIM (2026-08-26). A screen or a
    renderer may not paraphrase them. THE ROADMAP IS THE SOURCE OF RECORD for this copy rather
    than card-copy.ts, because the renderer is a Deno edge function in hearth-pos and cannot
    import the Worker's constants module; the function holds it as a constant pointing back
    here.

      HEADER
        SUPERBILL
        A statement of services for insurance reimbursement.
        Issued <date> · not a claim, and not a bill.

      FOOTER
        Where each fact on this page comes from. The provider's name, licence and NPI were
        confirmed with the issuing registries on the dates shown, and the amount was recorded
        when it was paid — those are the network's statements. The patient's name and date of
        birth, the codes, and the visit length were entered by the clinician; the network holds
        no patient identity and checked none of them. The clinician is responsible for their
        accuracy.

        This is not a medical record and not an insurance claim. Nothing about this visit was
        recorded or transcribed.

    THE LAST SENTENCE OF THE CLINICIAN PARAGRAPH IS DERRICK'S ADDITION, and it is the reason
    the paragraph works: "Naming who owns the assertion protects both parties." Without it the
    footer says only what the network did not do; with it, the document says who stands behind
    what it asserts. The first sentence is S8-2 in a form a claims adjudicator can act on.
    NO GLYPHS ANYWHERE IN THE PDF: WinAnsi has no checkmark, and one that renders as a hollow
    box on somebody's printer is worse than none. Provenance is carried by a hairline rule down
    the verified block, ALL-CAPS source headers, and a per-line "— verified with … on <date>"
    suffix that appears ONLY on verified facts. The AMOUNT sits with the stamps, not with the
    clinician's assertions: the network observed the payment.

8-BUILD sequencing: docs commit first (this block + the two DEFERRED entries); branch
feat/superbill; 0042 (issue_superbill — service-role only, the 0032:102 grant variant,
inserting the superbills row AND posting the kind='superbill' message in ONE transaction so a
message can never name a row that does not exist) and pos-0005 (bucket + policies) written and
STOPPED for hand-apply — each pasted whole, no hand-splitting; neither adds an enum value, so
NO SPLIT-ENUM pair (messages.kind already carries 'superbill' in 0041's CHECK, which is why
that vocabulary was written as text). After the apply: the edge function
(hearth-pos/supabase/functions/superbill, verify_jwt = true, the create-connect-account auth
split), the pdf-lib renderer, and scripts/verify-superbill.mjs with the S8-5 proof as its
loudest assertion. tsc clean, proof standard still green. No push, no deploy.

DECISION 2 (S7-3 and S7-4 into canon before 7-BUILD) IS SATISFIED BY THIS BLOCK. Derrick:
"I said 'per canon' and the timing and channel were never in canon." That is the failure the
canon hierarchy exists to catch, caught for the third sprint running by the investigating
agent rather than by a build — see the VL block's identical note.

7-BUILD sequencing: docs commit first (this block + the Session 7/8 supersession edits, both
synced to hearth-pos, + the two DEFERRED entries); branch feat/plexmed-today-wrap; 0041
written to migrations/ and STOPPED for hand-apply — ONE file, no SPLIT-ENUM pair (S7-8), carrying
BOTH the schema AND every RPC (start_visit, post_visit_plan, set_plan_item,
set_thread_cadence, wrap_visit, post_visit_link, get_my_day, get_my_followups_due), with the
receipt as its final statement, RLS enabled on visit_wraps and superbills before any policy,
the full grant block on every function (service-role variant for post_visit_link), and
hearth-pos BUG-009's publication one-liner folded in (Today's liveness depends on it and it has
been diagnosed-but-unapplied since 2026-07-27). CORRECTED 2026-08-25 at build time: this line
first read "Then get_my_day + the wrap/visit RPCs" AFTER the stop, which would have described
an apply that never happened — the RPCs are in 0041 and land with it. What comes after the
stop is WORKER code only: the vendor interface with the Daily adapter behind S7-10's absent-key
no-op, the sweep inside credentialDrain, the copy constants,
docs/PLEXMED_S7_TODAY_WRAP_SPEC.md as the hearth-pos contract (carrying the display_name-is-not-a-legal-name limit and the messages.origin gap as
app-side items), and scripts/verify-today-wrap.mjs. tsc clean, proof standard still green.
No push.

## STATE OF THE BUILD — 2026-08-26

WHAT THIS BLOCK IS. A dated bookmark of FACT, with hashes, so a later session does not have
to reconstruct it from merge subjects. It carries NO decisions and supersedes nothing: canon
rule 1 still governs — ground truth for what EXISTS is code plus applied migrations, and if
this block ever disagrees with those, the code wins and this block is the bug. Every hash
below was read from `git log` at write time; the ledger line was read live from
`public.schema_migrations`.

### SHIPPED

  S1  RETRIEVAL HYGIENE — `180f456`, migration 0032. filters.kind honoured server-side,
      sort_key 'verified' wired to real ordering, embedding input reduced. The prerequisite
      every other vertical was waiting on.
  --  IDENTITY-FLOW AMENDMENT — network `9da6dd6` (R3-AMENDED 48h window, R2-ADDENDUM,
      R-LEDGER, R-GAP); hearth-pos `df31856` + pos-0003 via `7bea103` (entity_identity_sessions,
      service-role only, ids behind id_verified). `afd2d54` adds the S3-A2 PRODUCTION-CUTOVER
      LAUNCH GATE — every entity whose bound session has livemode=false has id_verified reset
      before any live traffic. THAT GATE IS STILL OWED and is not part of anything below.
  S2  CIVIC CARD CLASS — `de5e0b4`, migration 0033. The 988 lane, free by structure: no
      engagement or payment RPC can name a civic card, enforced at the data layer.
  S4  DISPLAY STACK S1 — `3ac7eef`, migration 0034. Seven-zone CardView, Tier 2/3
      serializers, the guidance envelope. (Tier 1 interactive sheet stays CUT per the sprint.)
  S3  CREDENTIAL CHAIN, five sessions —
        S2 `5de43fd` (0035, PSV modules, ceremony, cron drain, LEIE ingest)
        S3 `d344fd2` (binding + livemode assertion + cold-flow spec)
           `0e5be5e` (BUG-014: rule N2 in normalizeNamePart + LEIE ASCII guard; 0036 dropped
           on evidence, S3-A3 re-ruled)
        S4 `d328ce5` (0036, stamps + receipts + the honorific gate)
        S5 `e2ef07c` (0037a/0037b, monitoring-lite: sweep, auto-void, owner notice)
      PROOF STANDARD GREEN — 198 passed, 0 failed across three scripts, re-run 2026-08-26 at
      the time this block was written. Assertion 1 remains a standing ruled gap (S3-A1); the
      HTTP+OAuth layer remains unexercised on the `.dev.vars` gap. Both stated in the artifact.
  S5  PRACTICE CARDS — `105b417`, migrations 0038a/0038b/0039. kind 'practice' behind a
      licence trigger, open times with the VL-1 soft hold, the availability chip, one
      eligibility predicate with one definition (S5-11).
  S6  CLINICAL INCOMING — `dede80f`, migration 0040. The three honesty chips, ask-first as
      the ABSENCE of a state (S6-4), and the chips read that returns five columns and no more.
  S7  TODAY + VISIT + WRAP — `95ce94c`, migration 0041. get_my_day, start_visit, wrap_visit,
      the append-only plan, cadence, post_visit_link at T-60 on the existing cron, and
      hearth-pos BUG-009's publication one-liner finally applied. `c1bd604` adds S7-5a —
      update_plan_item over MCP and numbered plan items in get_messages.
  S8  SUPERBILL — `86c7ba7`, migration 0042 + pos-0005 (hearth-pos `851a0b9`). Edge function,
      pdf-lib renderer, private bucket, the two-provenance-class page. Hardened in
      `a5aa44a` / hearth-pos `f00b7bc` + `6f7c093` after BUG-016: stat-after-upload,
      guarded re-issue, snapshot recovery, and the layout fix that binds each verified-with
      suffix to its own value.

  LEDGER AT WRITE TIME (live read, newest first): pos-0005, 0042, 0041, 0040, 0039, 0038.
  Files reconcile: hearth-network migrations/ tops at 0042, hearth-pos supabase/migrations/
  tops at 0005 (= 'pos-0005'). 0015 remains the known deliberate gap.

### WHAT REMAINS

  1. CANVAS (Session 10) — BLOCKED ON SANDBOX APPROVAL, reported 2026-08-26 as roughly one
     business day. Nothing is written: no branch, no mapping table, no FHIR code in either
     repo. It is the last item of the ten-day sprint and the only one whose blocker is
     external.
  2. THE FOUR hearth-pos SCREEN SPECS — WRITTEN, UNBUILT. The specs are
     docs/CRED_S3_COLD_FLOW_SPEC.md, docs/PLEXMED_S5_PRACTICE_AUTHORING_SPEC.md,
     docs/PLEXMED_S6_INCOMING_SPEC.md and docs/PLEXMED_S7_TODAY_WRAP_SPEC.md. A ground-truth
     sweep of hearth-pos on 2026-08-26 found:
       · practice card authoring — ZERO hits for practice / card_slots / post_card_slots /
         open_slots / modality across src/**;
       · clinical Incoming variant — ZERO hits for the chip copy, first_contact,
         get_my_pending_requests or sender_id_verified;
       · Today — ZERO hits for get_my_day / start_visit / visit_started_at / room_url;
       · visit wrap — ZERO hits for wrap_visit / visit_wraps / post_visit_plan /
         set_plan_item / nudge_after_days / cpt / icd.
     ONE CORRECTION TO THE USUAL SHORTHAND: the credential cold flow is PARTIAL, not absent —
     src/services/credentials.ts (requestCredentialVerification :122, fetchMyVerifications
     :182), src/components/IdentityPanel.tsx and src/hooks/useMyVerifications.ts all exist.
     What the S3 spec adds sits on top of that, so it is an extension; the other three are
     new surfaces. `practice` is not even in the app's CardKind union
     (hearth-pos src/types/card.ts:13-19) nor in the authorable FLAVORS list
     (src/components/CardEditorSheet.tsx:90-95).
  3. EMAIL — named as remaining. ⚑ FLAGGED: no block in this roadmap, in
     PLEXMED_10_DAY_SPRINT.md or in DEFERRED.md defines what "email" is as a deliverable, and
     no code in either repo implements one. It is recorded here as an OPEN ITEM WITH NO
     WRITTEN SCOPE rather than given one — inventing the scope in a state block would be the
     thing "a ruling is not a ruling until it is in the roadmap" exists to prevent.
     SUPERSEDED 2026-08-27 by RULINGS — 2026-08-27 (email, Session 11) below, which gives it
     a written scope (E-1..E-10). The flag is left standing as the record of how it was
     closed: written into the roadmap first, then built.
  4. scripts/verify-care-loop.mjs — UNWRITTEN, confirmed absent from both repos by `find`.
     The per-session verifies exist and pass (slots, inquiry, today-wrap, superbill, plus the
     three the proof standard runs); what does not exist is the ONE script that walks the
     whole loop end to end — ask → knock → ask-first → accept → Today → visit → wrap →
     payment → superbill.
  5. BOTH FILMS — POST-SPRINT, already ruled (SPRINT AMENDMENT 2026-08-24; FILM-1..FILM-5
     above). Day 6 and Day 10 evening slots are RUN AND REPORT, not shoot.

### TWO STANDING GAPS THIS BLOCK DOES NOT CLOSE

  · hearth-pos `npx tsc --noEmit` exits 0, but tsconfig.json excludes `supabase/`, so the
    edge functions are NOT covered by it. The superbill function's own index.ts has never been
    typechecked or run locally — neither Deno nor Docker is installed on the build machine —
    and scripts/verify-superbill.mjs prints that exclusion on every run rather than implying
    otherwise. Steps 1b/1c of the live protocol are what close it.
  · Whether a device/simulator build runs cannot be determined without running one, and has
    not been. ios/ and android/ exist; expo ~55.0.26 and react-native 0.83.6 are pinned.

## RULINGS — 2026-08-27 (email, Session 11) — approved for 11-BUILD
Source: the S11-INVESTIGATE report (main @ ff93c30). The build prompt cited a "B5"
visit-lifecycle ruling; `grep -n -iE "\bB5\b"` returns nothing in either copy of this file,
and the 2026-08-25 visit-lifecycle block (roadmap:1803) is VL-1..VL-5 / S5-* with no email
item — so the shape was ruled in chat and is written here BEFORE 11-BUILD is issued, which
is what "a ruling is not a ruling until it is in the roadmap" asks for. SUPERSEDES the "OPEN
ITEM WITH NO WRITTEN SCOPE" flag at WHAT REMAINS item 3. Binds hearth-network migration 0043
and src/email/.

E-1  THREAD IS TRUTH; EMAIL MIRRORS IT. No email carries content that is not already in the
     thread or on the engagement row. Nothing is AI-composed: four fixed templates, reviewed
     as text, composed nowhere at runtime (the card-copy.ts ruling-8 discipline).
E-2  FOUR TEMPLATES ON FOUR TRANSITIONS. knock -> request receipt (NO .ics); accept ->
     confirmation + .ics; T-60 -> reminder + join link; cancel/expire -> notice.
     AMENDED 2026-08-27 — THE REMINDER DOES NOT CARRY A RAW ROOM URL. Until the Daily
     private-room / meeting-token probe round-trips, a URL in an inbox is a door anyone with
     that inbox can walk through. It carries a MAGIC LINK instead: a single-use token on our
     own domain, tied to the engagement, expiring at slot end, resolving to the room. The
     patient installs nothing — that is the product claim, not a compromise: incumbents make
     people download an app before a visit and we do not.
E-2b THE CANCELLATION CARRIES A CALENDAR RETRACTION. Ruled 2026-08-27, closing the one item
     E-2 was silent on. METHOD:CANCEL, STATUS:CANCELLED, SEQUENCE 1, against the SAME derived
     UID the confirmation shipped at SEQUENCE 0. WHY, verbatim: "a stale calendar event means
     someone shows up for a visit that is not happening" — the notice email is not enough,
     because the calendar is what a person actually reads on the day. Ten lines against a real
     failure. The confirmation and the cancellation are the ONLY two templates that attach a
     file, and the sentence naming the attachment renders only when the file was actually
     built.
E-2a EXTENDED 2026-08-27 — A DECLINE GETS THE NOTICE TEMPLATE. A person who asked for a time
     and was told no must not be met with silence; that is the case where they are actively
     waiting. No fifth template: the notice carries a decline variant.
E-3  PROVIDER IS RESEND, BEHIND THE S7-10 POSTURE. An absent RESEND_API_KEY no-ops cleanly;
     the only thing that degrades is that no mail arrives. Resend's attachment shape and
     Idempotency-Key header are DOCUMENTED, NOT PROVEN — the same state src/visit/daily.ts
     was in on 2026-08-26. The first live send is the proof.
     PROVEN 2026-08-27, and this line closes the last documented-not-proven item in the build.
     Deployed version 8e62db9d, its own cron, against the real API on the verified domain:
     the knock receipt accepted at 20:31:53.918Z (id ab75d3c9-c840-4ac5-a324-e65746d28e56) and
     the confirmation WITH its calendar attachment at 20:32:54.142Z
     (id 458c4ce1-cd38-4caa-9797-9202143b322d). BOTH attempts:0 — no retry, so the first call
     succeeded; a malformed attachment envelope would have returned 4xx and left the row
     failed. The reminder enqueued by the same accept correctly stayed undue for 26 hours
     (E-9). Fixtures torn down. What the send does NOT prove, and is left to a human eye: that
     a mail client RENDERS visit.ics as an add-to-calendar event.
E-3a THE SENDER IS THE PLATFORM, NOT THE CLINICIAN. Ruled 2026-08-27:
     `Teleoplexy <visits@teleoplexy.ai>`, and NO clinician name in the From line, ever.
     THE REPLY ARGUMENT, which is the disqualifying one: a personal From INVITES a personal
     reply — that is exactly its appeal, it feels like a person, so people answer it. Nothing
     monitors mail. A patient who writes "can we make it 3pm?" and hears nothing misses their
     visit AND blames their clinician for ignoring them. On a clinical surface that is not a
     UX wrinkle. A platform From sets the expectation the templates already state: this is a
     notification, the conversation is elsewhere.
     THE AUTHORSHIP ARGUMENT: she tapped Accept, she did not write the words — every sentence
     was written weeks earlier and reviewed by a human here (E-1). A From line saying otherwise
     is the no-plausible-placeholder-data rule broken in prose: a field that LOOKS like real
     provenance and is not. Supporting, not load-bearing: a real name on a domain its owner
     does not control is the shape of a phishing pattern and attributes any error in the mail
     to them personally; Gmail appends "via teleoplexy.ai" to a mismatched display name anyway;
     and display_name is nullable, so the honest failure would read "null accepted your
     request".
     WHERE THE HUMAN BELONGS — the subject and the first line, where it already is:
     "Confirmed — Thursday, August 28 at 2:00 PM PDT with Dr. Ana Reyes" / "Dr. Ana Reyes
     accepted your request." Doctrine is satisfied there: emotion flows toward the human in the
     content, where it is true, and authorship stays with the system, where it is true.
     ⚑ OPEN PROVISIONING ITEM, DERRICK'S: visits@teleoplexy.ai must REJECT VISIBLY rather than
     blackhole, so a reply returns "this address isn't monitored" instead of silence. Trigger:
     before the first non-fixture patient receives mail. Silence is the failure this ruling
     exists to prevent, and an unconfigured mailbox reintroduces it by the back door.
E-4  ENQUEUE IN SQL, DELIVER IN THE WORKER. Accept (respond_to_inbound) and cancel
     (cancel_engagement) each have an app caller AND a Worker caller; the RPC transaction is
     the only place both converge, so a Worker-side send would silently skip every
     app-initiated accept and cancel. One outbox table, one delivery site, in the tick that
     already runs. The single exception is the lapsed hold, which is a lapse BY PREDICATE
     (VL-1) and writes no row: enqueue_lapsed_booking_notices() keeps that enqueue in SQL
     too, and the cron only says "look now".
     AMENDED 2026-08-27 — TRIGGERS, NOT FOUR RESTATEMENTS. The enqueue is an AFTER trigger on
     the two tables (inbound, engagements) rather than an insert added to claim_slot_and_knock
     / respond_to_inbound / cancel_engagement / post_visit_link, which 0043 therefore does not
     touch. Two reasons, both decisive: a same-signature `create or replace` means restating
     ~550 lines of the accept branch that snapshots price and the cancel branch that decides
     refunds, and a transcription slip THERE is a payment bug, not a mail bug; and a trigger
     sits on the row transition itself, so a FIFTH writer added later INHERITS the enqueue
     instead of forgetting it — which is E-4's own argument carried one step further. Same
     transaction, so the rollback property is unchanged: a claim that loses the VL-5 race
     raises and the receipt rolls back with it. Purely additive, so nothing existing can
     regress. Precedent: cards_practice_requires_licence_trg (0038b:171).
E-5  ADDRESS OF RECORD IS entities.email, RESOLVED AT SEND TIME. Ruled verbatim:
     "email_confirmed_at is NOT evidence of control; Supabase auto-confirm stamped it within
     milliseconds of signup with no mail sent. The address is self-supplied by an account
     holder and is used only for transactional mail about that person's own booking. It must
     never be cited as a verified address anywhere, and no marketing or third-party send may
     ever use it."
     Measured 2026-08-26: 15 of 19 entities non-null, 14 account-linked and all 14
     byte-identical to the auth.users address; 18 of 19 auth users confirmed 13-50 ms after
     creation with confirmation_sent=no; exactly one person ever confirmed.
E-6  THREE IDEMPOTENCY LAYERS: a derived unique dedupe_key (never enqueued twice), the VL-5
     claim-by-predicate update (never claimed twice), and Resend's Idempotency-Key set to
     that same key (never delivered twice when a response is lost).
E-7  WHAT A SEND MAY NOT CARRY: the patient's message, anything from the visit (plan,
     cadence, wrap, CPT/ICD), the superbill or its existence, any diagnosis or symptom, any
     Stripe identifier, any id column.
E-8  Migration 0043 (hearth-network). No pos migration. No enum — text + CHECK — so no
     SPLIT-ENUM pair is owed; stated, not skipped.
E-9  THE T-60 REMINDER IS CONDITIONAL, NOT SEQUENCED. For a video visit it HOLDS while the
     room is not yet minted and sends when it is, or LAPSES UNSENT if the slot starts first.
     Never a "join here" mail with nothing to join. (The room sweep's budget is five a
     minute, so tick ordering alone is not a guarantee.)
E-10 NO APP-INSTALL PROMPT IN ANY TRANSACTIONAL EMAIL. The reminder has one job and a
     competing call to action costs someone a visit. DEFERRED: a low-key app line in the
     CONFIRMATION mail only — trigger "first real patient cohort".
     THE OPT-OUT TOGGLE IS POS SCREEN WORK, ruled 2026-08-27. 0043 shipped the server half
     (entities.email_opt_out_at + set_email_preference, granted to authenticated); the switch
     itself belongs to the block that consumes the four hearth-pos screen specs, NOT to this
     one. Until it exists the mail makes no opt-out claim and sends no List-Unsubscribe header
     — a footer pointing at a control that does not exist is the promise-the-system-cannot-keep
     failure E-1 exists to prevent. Written up for that block in
     hearth-network/docs/CRED_S3_COLD_FLOW_SPEC.md ("CARRIED ITEM"), whose session is the one
     that opens the account holder's own profile. ⚑ NONE of the four specs owns a Settings
     surface today, so that is the closest home rather than the obvious one — move it whole if
     the pos block grows a Settings spec.
E-11 ADDRESSING IS PATIENT-SIDE, AND 'order' KINDS GET NO MAIL. Ruled 2026-08-27 (both were
     carried as flagged assumptions in 0043's header and are now ruled, not assumed). Every
     row is addressed to inbound.from_entity_id / engagements.buyer_entity_id: email exists
     because the patient books agent-side and may never open the app, while the clinician has
     Incoming and Today. Clinician-side mail is a second set of triggers, not a change to
     these. E-2's four templates are the VISIT lifecycle, so an 'order'-kind engagement
     enqueues nothing.

RULED 2026-08-27 — THE MAGIC LINK GETS ITS OWN SESSION, AND THE DAILY JOIN-SEMANTICS PROBE
IS IN SCOPE WITH IT. → THAT SESSION IS BELOW: "RULINGS — 2026-08-27 (magic link + the third
token plane, Session 12)". Both halves ran together as ruled, and Part 1 answered the S7
unknown from observed behaviour. Scoping it out of 0043 was correct: the token table is ~40 lines of SQL,
but a public /visit/<token> endpoint is a THIRD TOKEN PLANE on the Worker, and CLAUDE.md's
locked token-planes block rules that "adding a third is a ruling, not a diff". The two
questions are ruled together because separately each is half an answer — the link improves
DISTRIBUTION (single recipient, expiring, revocable, countable) and the probe answers SAFETY
(whether a URL alone admits someone), and a redirect to an unproven room inherits whatever
the room permits. Until that session lands, 0043 ships the outbox ONLY and the reminder's
link line reads "the link is in your conversation in Teleoplexy".
SINGLE-USE IS PRE-RULED, accepting the build's pushback: ONE TOKEN PER ENGAGEMENT PER
RECIPIENT, redeemable until slot end, with use_count recorded so a shared link is VISIBLE.
Not literal one-click — that loses someone their visit to a page reload.

## RULINGS — 2026-08-27 (magic link + the third token plane, Session 12) — approved for 12-BUILD
Source: the S12 build. Part 1 (the Daily probe) answered the unknown flagged in
src/visit/daily.ts since S7-10 and carried in E-2 as the reason the reminder shipped without a
link. Part 2 was built to what Part 1 proved, in that order, as ruled.

### PART 1 — WHAT THE VENDOR ACTUALLY DOES (observed, not documented)
Measured with a real headless Chrome running Daily's OWN client (daily-js) against the live
API on teleoplexy.daily.co, plus the real prebuilt page. Four observations, all reproducible:

  D-1  A PRIVATE ROOM REFUSES A URL-ONLY VISITOR. accessState reports no level and the join
       raises 'not-allowed'; the prebuilt page renders, in its own words, "You are not allowed
       to join this meeting". Every room this system mints is private (daily.ts:80).
  D-2  A MEETING TOKEN IS WHAT ADMITS. The same room with ?t=<token> reports
       access { level: 'full' } and the prebuilt page renders "Get ready for your call".
       `?t=` is the parameter; the token is minted with the API key, which a patient does not
       have and must never have.
  D-3  THE CONTROL HOLDS. A PUBLIC room with the URL alone reports access { level: 'full' } —
       so D-1 is privacy, not a broken probe.
  D-4  exp IS ENFORCED BY THE VENDOR, NOT ADVISORY. The same room past its exp raises
       'exp-room', "This room is no longer available". nbf/exp round-trip to the second.
  Housekeeping: create → resolve → delete round-tripped; the probe left no rooms behind.

### PART 2 — THE THIRD TOKEN PLANE
  TP-1 APPROVED, and the reasoning is the ruling: "a public, token-authenticated,
       single-purpose GET that redirects into a room is not a new API surface — it is the
       mechanism that lets a patient join in one tap with no app install, which is a product
       claim I am making against every incumbent." This supersedes the two-plane count in
       CLAUDE.md, which is amended in the same commit.
  TP-2 SINGLE-PURPOSE, FOREVER. This plane serves /visit/<token> and NOTHING ELSE, EVER. One
       verb, one path shape, one outcome, one table read. It is not a session and grants
       nothing beyond one room. A fourth capability hung off this plane is a new ruling, not a
       new route.
  TP-3 WHAT THE LINK PROTECTS — SAY IT PLAINLY, BECAUSE D-1 CHANGED IT. The link is NOT what
       keeps strangers out of a visit: the room's own privacy is, and it was doing that job
       before this session started. The link CARRIES THE ADMISSION CREDENTIAL — the meeting
       token nobody without our API key can mint. Expiry, use_count and the rate limit bound
       ABUSE OF THE CARRIER; they are not the wall. Recording this because a future reader who
       assumes the link is the boundary will make the wrong trade-off somewhere else.
  TP-4 SHAPE. visit_access_tokens holds the SHA-256 of a 32-byte opaque value and never the
       value (the mcp_oauth_tokens discipline); engagement_id, to_entity_id, expires_at at
       SLOT END PLUS THE ROOM'S 30-MINUTE TAIL so nothing outlives what it opens;
       first_used_at; use_count. RLS on, zero policies. Minted at REMINDER-SEND time, not at
       accept — a link that exists a day before it is needed is a day of exposure bought for
       nothing.
  TP-5 NOT LITERALLY SINGLE-USE. One token per engagement per recipient, redeemable until
       expiry, use_count recorded so a shared link is visible. Literal one-click loses someone
       their visit to a page reload, which is what a phone does when it switches apps mid-tap.
       A re-mint REPLACES the row and resets the counters: the raw value is unrecoverable by
       design, so a retry cannot re-send the old link and must issue a new one.
  TP-6 RATE-LIMITED, AND THE LIMITER FAILS OPEN. src/middleware/rate-limit.ts was a 0-byte
       placeholder, so it is built here: a per-IP sliding window counted in SQL (0044) with the
       threshold in TypeScript. The Worker passes a HASH of the address — the raw IP never
       reaches the database, because a visit-adjacent table must not become a location log.
       On a limiter failure the request is ALLOWED and the failure logged: a patient at T-60
       must not lose their visit because a bookkeeping table refused a write.
  E-2c THE T-60 REMINDER CARRIES THE MAGIC LINK. Amends E-2 as amended: "a patient an hour out
       is in their inbox, not their assistant." The mail still names no vendor and carries no
       vendor URL — only ours — and asks that the link not be forwarded. If the mint fails the
       copy falls back to pointing at the conversation: a worse reminder, never a broken one.
  TP-7 THE LINK LIVES ON visit.teleoplexy.ai, NOT mcp. Ruled 2026-08-27, closing the open
       item this block was written with: "a patient an hour from a medical visit should not
       tap a link that reads like machinery." Wired as a SECOND custom domain on the same
       Worker (wrangler.jsonc) with VISIT_LINK_ORIGIN as a var, not a secret — it is the
       hostname printed in the mail, and a change to it belongs in review. Routing stays by
       PATH: one script answers on both names, and the var alone decides which name reaches a
       person's inbox. src/visit/access.ts carries the same value as its fallback; the two
       must not disagree.
       ORDER OF OPERATIONS, and it matters: the DNS record (Derrick) comes BEFORE the deploy.
       A deploy that lands first puts a hostname in the mail that does not resolve, and the
       reminder is the one message with a deadline attached.
       NOT DONE, and flagged rather than assumed: nothing restricts WHICH hostname serves
       which path. /visit/<token> also answers on mcp., and /mcp also answers on visit. Both
       are harmless today — every plane authenticates independently of hostname — but if the
       split should be enforced, that is host-based routing in src/index.ts and a ruling of
       its own, not a diff.

---

## RULINGS — 2026-08-28 (hearth-pos navigation shape, N-1…N-5) — approved for the SCREEN BLOCK
Source: the hearth-pos navigation investigation, 2026-08-28. Four specs (CRED S3,
PLEXMED S5/S6/S7) mount screens into a four-tab shell that STOP 5 fixed, and the question
"where does PlexMed live" had to be answered before the contract sync, because the answer
changes where everything mounts. Two shapes were scoped against four tests: navigation cost,
what duplicates, what an entity with no practice card sees, and what survives a second
vertical. These five rulings are the answer. They are canon; the specs bend to them.

  N-1  MODULES LIVE IN THE ACCOUNT MENU, BEHIND SETTINGS. Not a fifth tab. The four-tab bar
       STOP 5 fixed (Profile / Incoming / PlexChat / Engagement) stands untouched, and
       PlexLaw and PlexATS never threaten it — which a tab-per-vertical shape would, at six
       tabs, having already ruled two surfaces OFF a five-tab bar.
       WHY THE ACCOUNT SHEET IS THE RIGHT HOME, and it is not a layout preference: PlexMed,
       PlexLaw and PlexATS are PURCHASED ENTITLEMENTS at a flat monthly rate. That puts them
       beside identity, contacts and money — the things you own and administer — not beside
       the four surfaces you work in. The dead `Settings` placeholder at AccountChip.tsx:113
       is where this lands.
       THE GATE IS TWO CONDITIONS, NOT ONE: the module is OWNED (commerce) AND the licence
       stamp is LIVE (verification). The two failure states are different screens and must
       not be collapsed — pays but unverified sees THE CEREMONY (CRED S3); verified but
       unpaid sees THE PRICE. Neither is a locked tab teasing them (see N-4).
       PlexMed's paywall is a LATER SESSION and does not exist yet. Build the entitlement
       check as a SEAM RETURNING TRUE until it ships, so the screen sessions build against
       the right shape without waiting on commerce. The seam carries a TODO so it is
       greppable; a seam that silently returns true forever is the placeholder this rule
       exists to prevent.

  N-2  TODAY IS GENERIC AND STAYS ON ENGAGEMENT. get_my_day (0041) is vertical-agnostic: it
       returns engagement_kind booking|order for ANY card kind, and card_kind gates only the
       visit-and-wrap affordances. A plumber with three scheduled bookings HAS A DAY. Locking
       Today behind a clinician stamp would withhold a surface whose data the server already
       returns to that vendor — the failure this ruling exists to refuse.
       ONE CONSUMER of get_my_day, not two. The room row and the wrap affordance are
       CONDITIONAL ON CARD KIND within that one surface; a second Today for clinicians would
       be a second fold of the same read, and two folds drift.

  N-3  BOARD AND WRAP LIVE IN THE MODULE. Both are meaningless without a practice card, and
       cards_practice_requires_licence already refuses the card at the database — so the
       module is the honest form of a refusal the schema makes anyway. This is the pair that
       is genuinely practice-only; Today is not, which is why N-2 splits them.

  N-4  HIDDEN WHEN UNGATED, NOT VISIBLE-LOCKED. A locked surface advertises what someone
       cannot have and invites a tap that will be refused. Same reasoning that killed the
       inert action (S1-5) and removed rather than greyed the Accept on a lapsed hold
       (S7 T4): a control that cannot act must not be rendered as though it could.
       ⚑ OVER-APPLIED TO MODULES — SEE N-4-AMENDED (2026-08-30). The reasoning above is
       intact and unchanged FOR CONTROLS. It never applied to a catalogue entry, and
       reading it as though it did produced a storefront with no door.

  N-5  S7:68-69 IS AMENDED, NOT S5:120. Today staying on Engagement means that screen DOES
       change, so the spec line claiming "Nothing about that screen changes" is false and is
       corrected at the source (hearth-network docs/PLEXMED_S7_TODAY_WRAP_SPEC.md). What
       survives the amendment unchanged is the substantive half: the status-based
       Upcoming/Past split itself keeps working untouched.
       S5:120 STANDS — "Booked-row tap → opens the visit in Engagement." One destination for
       a visit, and N-2 is what keeps that true.

  N-4-AMENDED  THE MODULE ROW IS ALWAYS VISIBLE; THE BOARD IS WHAT HIDES. Amended
       2026-08-30, and THE ERROR WAS DERRICK'S OWN, corrected by him rather than defended —
       recorded that way because the amendment is only legible beside the mistake.
       WHAT WENT WRONG. N-4 forbids visible-locked surfaces because a control that cannot
       act teaches that controls are decorative. That is RIGHT ABOUT INERT CONTROLS and
       WRONG ABOUT AN UNSOLD MODULE. DERRICK'S REASONING, RECORDED AS GIVEN: "A price is not
       an inert control, it is an offer, and hiding it means the product cannot be discovered
       or bought." As built, N-1's two conditions rendered TWO states, and a clinician who
       had not verified saw no evidence PlexMed existed at all — a storefront with no door.
       Found on the 2026-08-30 device pass, from the far end: the seven-chain trace showed
       Settings offering NO pointer toward the board under any condition.
       THREE STATES, FROM N-1'S SAME TWO CONDITIONS — nothing about the gate changes, only
       what each combination renders:
         unowned              → THE ROW APPEARS WITH ITS PRICE, tappable, and tapping buys
                                it. This is the storefront, and it is the state that did not
                                exist before.
         owned, unverified    → the row appears and POINTS AT THE CREDENTIAL CEREMONY. No
                                board: there is nothing to show until a stamp exists, and
                                pointing rather than opening is N-8.
         owned and verified   → the board.
       NOBODY MEETS AN INERT CONTROL, and nobody is prevented from discovering a product they
       would pay for. Every row does something when tapped; what differs is what.
       N-1 IS UNCHANGED. Its two conditions and its refusal to collapse them are exactly what
       make three states derivable — this amendment is what N-1 always implied and N-4's
       over-reading suppressed.
       PLEXLAW AND PLEXATS INHERIT THIS SHAPE. Getting it right now costs one ruling and
       saves three rebuilds; that is the reason it is amended before the paywall rather than
       with it.
       CURRENT STATE, NOTED HONESTLY: isModuleOwned() returns true unconditionally
       (TODO(PAYWALL), hearth-pos src/services/entitlements.ts) so the UNOWNED ARM IS NOT YET
       REACHABLE — the row renders the owned-unverified state until the paywall ships. BUILD
       THE THREE-STATE SHAPE ANYWAY, so the paywall drops into a structure that already fits
       it rather than becoming a refactor. A branch that cannot fire yet is not a placeholder
       when the ruling says why it is there.

  N-D  STANDING DISCIPLINE, recorded with the five because it is the condition they rest on:
       SHARED TABS REGISTER PER-KIND ROW COMPONENTS BY CARD KIND, NEVER BRANCH INLINE. The
       distributed surfaces (Incoming, Engagement, Today) survive a second vertical only if
       each vertical ADDS a registered component rather than another inline branch.
       InboundTile already kind-switches inline (:50-53, :85); that is the pattern to convert
       when the second vertical arrives, and not to extend before then.

### SESSION MAP — the screen block, as ruled
  S0  CONTRACT SYNC — BUILT 2026-08-28, commit c71211f. Five type widenings, all five select
      strings, the zone-labelled formatter in datetime.ts, 'Notice' in both label maps, and
      BUG-009 closed against 0041. Renders nothing; it is the shape the rest compiles against.
  S1  CRED S3 + E-10 — the cold-arrival ceremony mounted on the already-built data layer
      (credentials.ts, useMyVerifications.ts, zero consumers today), plus the Settings panel
      that N-1 puts modules behind and that E-10's toggle needs. BLOCKS S5's P0 gate and
      unblocks the network's email footer + List-Unsubscribe.
  S2  PLEXMED S5 — practice authoring + the open-times board, in the module (N-3). Mints
      entities.timezone, which every S6/S7 time renders from. Two sessions.
  S3  PLEXMED S6 — the honesty chips, the two-source join, T1–T4, and the messages-channel
      fix for the silently-arriving reply. S7 reuses these chips verbatim, so it precedes it.
  S4  PLEXMED S7 — Today on Engagement (N-2), the room row, start_visit, and the wrap in the
      module (N-3). Two sessions.
  Honest total: seven sessions, six only if S5 or S7 lands under expectation.
  OPEN, and not a session's decision: where CRED S3's licence number and state come from —
  get_my_verifications returns neither by ruling, and the spec forbids widening the view.
  S1 builds every other state without it.

### ADDENDUM — recorded 2026-08-28, same block
  N-6  GET_MY_VERIFICATIONS IS NOT WIDENED. A status view stays a status view (R2 /
       discipline rule 8). The licence detail the S3 verified state and the S5 practice chip
       need comes from a NEW self-scoped definer RPC instead — get_my_credential_detail(),
       returning registry_ref and credential_class for the CALLER'S OWN live verified rows
       only. A clinician's own licence number is not a secret from the clinician, and
       current_entity_id() is what stops it reaching a viewer.
       RULED 2026-08-26, recorded 2026-08-28 — stated plainly because the gap between the
       two is exactly what this block exists to close.
       SMALL MIGRATION, FOLDED INTO SESSION 2. Not built in Session 1. Session 1 renders
       `verified {Mon YYYY}` and OMITS the number — an omission, never an invented source.

  N-7  entities.email_opt_out_at HAS EXACTLY ONE WRITER: set_email_preference (0043). The
       app never writes the column directly, and EntityContext.updateEntity() — which could
       — must not be used for it. A direct entities write would be a second write path for
       the same column, which is the rule that holds everywhere else in this system
       (state-transition writes go through one canonical function).

  N-6-CORRECTED  (2026-08-28) — N-6 WAS WRONG AND IS SUPERSEDED. NO MIGRATION IS OWED.
       N-6 ruled that get_my_verifications "is NOT widened — a status view stays a status
       view", and that a new self-scoped RPC (get_my_credential_detail) should return
       registry_ref. BOTH HALVES ARE FALSE AGAINST THE DATABASE: migration 0036 SECTION 1
       already DROPPED and recreated get_my_verifications with ELEVEN columns, `source` and
       `registry_ref` among them, under the same reasoning N-6 later gave as if it were new
       — "the OWNER's own data, read under their own session". 0036 is in the ledger.
       A SECOND RPC WOULD BE A SECOND READ PATH for a column already exposed, which is the
       drift the single-source rule exists to prevent. Option C rejected; no 0045 is written.
       WHAT WAS ALREADY REACHABLE, and is what the specs asked for: registry_ref on a licence
       is '<ST>:<board>:<NUMBER>' (0035:90, verifications_license_ref_qualified). ONE column
       carries both the state that S5's P1 chip needs and the number that CRED S3's S5 detail
       row needs. Session 1's omission of the number was unnecessary and is now closed.

       THE CAUSE, STATED PLAINLY SO IT IS NOT REPEATED — DOCUMENTATION CROSS-VALIDATING
       DOCUMENTATION. Three artifacts agreed with each other and none of them agreed with the
       live schema:
         (i)   CRED_S3_COLD_FLOW_SPEC.md's data-contract table was frozen at 0035, headed
               "already shipped, migration 0035", and listed nine columns. It was never
               updated when 0036 landed.
         (ii)  hearth-pos src/types/verification.ts mirrored THE SPEC rather than the
               database, so it inherited the same nine columns.
         (iii) Every reading of the contract then checked one against the other and found
               agreement — which proved only that they were copied from a common ancestor.
       THE RULE THAT FOLLOWS: THE MIGRATION FILES ARE GROUND TRUTH (canon rule 1). A spec's
       contract table is a SNAPSHOT, never the contract, and must cite the migration number
       it was true at so a reader can tell whether it has since moved. A type file mirrors
       THE DATABASE, never a document about the database.
       WHY SESSION 0'S SWEEP DID NOT CATCH IT: that pass swept TABLE types against live table
       shapes. This is an RPC-RESULT type, and nothing swept those. Session 0's sweep was
       correct and incomplete — the same widening discipline owes a pass over RPC results.

       PROMOTED TO CLAUDE.md RULE ON 2026-08-28 (SPEC-CONTRACT RULE), with N-13 and S6's
       modality gap as the other instances.

       credential_class STAYS UNEXPOSED. It is on the table (0036 §2, 'doctoral' | 'other')
       and no RPC returns it. That is the honorific entitlement, a DIFFERENT need from the
       licence detail row, and nothing in S1–S4 asks for it. Logged as DEFERRED in
       hearth-network with trigger "the honorific surfaces on a screen".

  N-16 THE WRAP IS A SHEET PUSHED FROM THE TODAY TILE — N-3 AMENDED (2026-08-28).
       N-3 said "board and wrap live in the module". THE BOARD HALF WAS ALWAYS THE
       LOAD-BEARING ONE: a board is meaningless without a practice card. A wrap is meaningless
       without a VISIT, and under N-2 the visit is on Engagement — so the wrap goes where the
       visit is. N-3 narrows to: THE BOARD lives in the module.
       WHY, and it is the Josh fix in miniature (DEUS_DAY_BY_DAY.md ~531-533, "the accept
       control sitting in a different tab from where the vendor was looking"): a ninety-second
       wrap immediately after a visit is the worst possible moment to send someone two taps
       away into the account sheet. One component, one entry, on Engagement.

  N-17 TODAY CARRIES NO IDENTITY CHIP (2026-08-28). S7's A3 says the identity chip renders
       "exactly as on Incoming". It cannot: get_my_day returns no verification flag and
       neither does get_my_thread_peers. Under the SPEC-CONTRACT RULE promoted the same day,
       that is a spec defect to report and omit — never a read to widen, and never a migration
       written to satisfy an example.
       AND IT IS RIGHT ON MERITS, NOT ONLY ON CONSISTENCY, which is why this is a ruling and
       not a workaround: the chip earns its place on INCOMING because the clinician is
       deciding whether to see a stranger. By TODAY they have accepted, been paid, and are
       about to join a room. The decision is made, and identity verification no longer changes
       anything they would do. A chip that cannot change a decision is decoration on a
       clinical surface.
       RECORDED SO NOBODY ADDS IT BACK AS AN OVERSIGHT. Today shows "First visit on this
       network" (first_visit_on_network IS returned) and no identity chip. HonestyChips already
       takes firstContact as optional for exactly this — the component is unchanged.
       Reported to hearth-network as a spec defect the same day.

  N-15 SPEC-CONTRACT RULE PROMOTED (2026-08-28). A spec's rendered example may only use
       columns its own data contract returns; a mismatch is a SPEC DEFECT to report, never a
       read to widen. Written into BOTH CLAUDE.md files — hearth-pos's as a consumer rule
       (report and omit), hearth-network's as an author rule (cite the migration a contract
       table is true at, and check every example against the returns block before emitting).
       FOUR INSTANCES, and the pattern in all four is the same: a contract copied from a
       migration at one moment, examples written from intent, and nobody comparing them again.
         (a) CRED S3's contract table, frozen at 0035 — N-6-CORRECTED.
         (b) PLEXMED S5's error list, naming a raise that does not exist — N-13.
         (c) PLEXMED S6's time row, rendering a modality no read returns — shipped omitted.
         (d) PLEXMED S7's A3 identity chip, which has NO SOURCE AT ALL: get_my_day returns no
             verification flag and neither does get_my_thread_peers. Found by the promotion
             sweep BEFORE Session 4 rather than during it, which is the rule working.
       ALL FOUR WERE FOUND AT BUILD OR SWEEP TIME BY AN AGENT, none at design time. That is
       the fact that made this a rule rather than a habit.
       SWEEP: all four specs in hearth-network/docs/ checked against their migrations
       2026-08-28. One further benign case — S7 A2's derived state names cancelled_at, which
       get_my_day does not return; status = 'cancelled' covers it, so nothing is owed.

  N-14 THE ADD-TIMES GRID HAS NO HOUR WINDOW — A FULL 24 HOURS (2026-08-28).
       Session 2b shipped a 07:00–21:00 grid as a flagged screen choice (the spec says "a
       chip grid of the day" and names no bounds). OVERTURNED before it settled, and recorded
       here as the rule rather than as a reversal: it was never a ruling, it was a default
       nobody had ruled on, which is exactly the kind of choice that hardens if it is not
       caught.
       WHY THE WINDOW WAS WRONG. It is a working-day assumption wearing a UI. A night-shift
       doctor, a clinician serving another timezone, and anyone doing early mornings all
       exist, and a grid that starts at 07:00 quietly tells all three that this product is not
       for them. The grid is not a statement about when medicine happens.
       A SLOT MAY CROSS MIDNIGHT. Starts run to 23:xx and the end is start + length, so 23:30
       at 45 minutes ends at 00:15. Truncating the last starts at midnight would be the same
       assumption in a smaller disguise.
       THE ONLY CONSTRAINTS ON A TIME ARE THE ONES ALREADY RULED, both enforced server-side:
       at least 60 minutes out (VL-2), and no overlap with a time already on the board.
       Everything else is the clinician's business. The client mirrors both for fast feedback
       and neither as the guarantee (PROMPT-CODE CONTRACT).
       SHAPE: unchanged. A flat wrapping grid inside the existing scroll — 24 chips at 60
       minutes, 32 at 45, 48 at 30. Ten to nineteen more chips is a longer scroll, not a
       different component, so no new layout was invented and none was needed.

  N-13 THERE IS NO slot_overlap ERROR — SPEC CORRECTED (2026-08-28). PLEXMED S5's error list
       named `slot_overlap` alongside the raises. post_card_slots PRE-CHECKS overlap and
       SKIPS-AND-COUNTS it (0038b:469-482); so does the unique-index conflict. An overlapping
       time returns inside {posted, skipped} and surfaces as the spec's OWN partial-success
       line — "Posted {n} times. {m} were already on your board."
       card_slots_no_overlap (0038b:126-127) is a RACE BACKSTOP: it fires only on a concurrent
       insert (SQLSTATE 23P01), and the honest outcome then is the SAME message. 23P01 is
       classified and folded into "already on your board" — no eighth error state.
       SAME DRIFT CLASS AS N-6-CORRECTED, and named as such deliberately: a spec table
       describing behaviour the migration does not have. This is the second instance in two
       days. The migration files are ground truth; a spec's contract or error table is a
       snapshot and must be checked against the function before it is built to.
       PROMOTED TO CLAUDE.md RULE ON 2026-08-28 (SPEC-CONTRACT RULE).

  N-10 A TIME INSIDE THE LEAD-TIME HOUR RENDERS GREYED, WITH NO LABEL. get_my_card_slots
       derives state 'past' at `starts_at <= now() + interval '60 minutes'` (0038b:598), so a
       5:40 time returns 'past' at 5:05. The STATE IS CORRECT — the lead-time rule makes it
       unbookable — but the word is not, and a clinician seeing this evening's slot labelled
       "Past" in the afternoon will report it as a bug.
       ONLY THE RENDERING IS RULED HERE. The server state name stays 'past'; PLEXMED S5's row
       table stands as written (that row carries a style, not a chip). Greyed and unbookable
       is self-evident and says nothing false.
       IF A LABEL EVER PROVES NECESSARY it must describe THE RULE, not the time — "too soon",
       never "past". No label is better.

  N-11 SESSION 2 SPLITS: 2a AUTHORING, 2b THE BOARD. They share no files, 2b needs a practice
       card to attach times to, and ten files across two surfaces behind one approval is the
       batch size that hides mistakes.
       2a: the licence-gated practice kind and the card itself, in CardEditorSheet on Profile
       (S5 note 5 — reuse CardContext, no new card write path).
       2b: the board, in the module behind Settings (N-3), plus the modules section in
       SettingsPanel — which N-1 deferred until there was something in it, and now there is.
       P0 AND P5 REFUSE AND POINT, per N-8. P5 says the times live in Settings › PlexMed; it
       does not open the board, because opening the account sheet from inside the card
       editor's sheet is the stacked modal N-8 exists to prevent.

  N-12 THE DAY CHOOSER IS BESPOKE, NOT A DEPENDENCY. S3's add-times sheet needs a day chooser,
       not a calendar. EngagementCalendar already made this call once (EngagementCalendar.tsx:8-9,
       "minimal, no new dependency; the Field styling is bespoke anyway") and a second bespoke
       picker beside it is more consistent than one dependency plus one hand-rolled component.
       REUSE WHAT EngagementCalendar ESTABLISHED rather than inventing a third pattern.

  N-9  SESSION 2 CARRIES THREE THINGS OUT OF SESSION 1, recorded so they are not rediscovered:
       (a) SUPERSEDED by N-6-CORRECTED — there is no get_my_credential_detail() and no
           migration. registry_ref was already on get_my_verifications from 0036; the S5
           practice chip and the S3 detail row both read it. Session 1's omission of the
           number was closed the same day.
       (b) "See my card" (CRED S3 S5) currently only CLOSES the sheet. Wiring it to the
           Profile tab needs useNavigation inside AccountChip — a component rendered in ALL
           FOUR headers, so an unavailable navigation context there breaks every header at
           once. That approach gets VERIFIED on its own before it is added, never bundled
           blind into another change.
       (c) The S3→S4 elapsed timer is per-mount and is DEFERRED, not owed (see DEFERRED.md,
           trigger: first clinician reports the timer resetting).

  N-8  THE P0 GATE REFUSES AND POINTS; IT DOES NOT OPEN THE CEREMONY. Follows from N-1
       placing the ceremony in the account sheet: S5's P0 gate must NOT open a sheet from
       inside the card editor's sheet (no stacked modals, ProfileScreen.tsx:312). It refuses
       and names where the thing lives — the pattern S5's own approved copy already uses for
       Incoming ("That request lives in Incoming, where it is answered"). Note for SESSION 2.

## RULINGS — 2026-08-29 (PLEXMED S10 retargeted: Canvas → Medplum) — approved for 10-BUILD
Source: the S10-INVESTIGATE report (hearth-network main @ 55df0ff, tree clean), five decisions
ruled the same day, the BAA gate, and one pre-ruling issued AGAINST A PROBE NOT YET RUN.
Binds PLEXMED_CARE_LOOP_BUILD.md Session 10, which names Canvas throughout — that file is
superseded by this block wherever the two disagree. Prior rulings unchanged: S7-9 (codes are
typed, never suggested), S8-1..S8-7 (the superbill and its provenance split), TP-1..TP-3 (the
three token planes), VL-1 (no scheduler writes state), and the CARE_LOOP cut list's
"auto-sent nudges, auto-coding, auto-diagnosis: never".

S10-1 THE TARGET IS MEDPLUM, NOT CANVAS. DERRICK'S REASONING, RECORDED AS GIVEN: "Canvas is a
    one-business-day sales conversation; Medplum is a FHIR server, self-serve, already
    provisioned." Project "Teleoplexy", hosted tier, API base https://api.medplum.com, OAuth2
    client-credentials at /oauth2/token (verified live 2026-08-29: server 5.1.36, fhirVersion
    4.0.1, system interactions transaction+batch, conditionalCreate true on Patient, Encounter,
    Condition, DocumentReference and Practitioner). MEDPLUM_CLIENT_ID and MEDPLUM_CLIENT_SECRET
    are WORKER SECRETS and deliberately NOT in .dev.vars.
S10-2 THE BUNDLE IS THE DELIVERABLE, AND IT IS SERVER-AGNOSTIC. Composition is pure and
    vendor-free; pointing it at Canvas, Epic or a hospital's own server is credentials and a
    base URL, never code. NO MEDPLUM-SPECIFIC EXTENSION, PROFILE OR RESOURCE MAY ENTER THE
    COMPOSER. This is what makes S10-1 a low-cost decision rather than a bet, and it is the
    reason the composer must stay a pure module the way superbill/compose.ts is.
S10-3 THE TESTING PLAN IN 10-INVESTIGATE ITEM 4 IS SUPERSEDED. The Docker/Synthea local rig
    existed because Canvas could not be touched by CI; the hosted Medplum project is now the
    conformance target directly. SYNTHETIC FIXTURES ONLY, and that is a hard gate rather than a
    preference — see S10-4.
S10-4 (S10-BAA) NO REAL PATIENT DATA REACHES api.medplum.com BEFORE A SIGNED BAA. The
    compliance checklist's "sandbox = synthetic only; BAA before any real patient" was written
    for Canvas and binds Medplum identically. HOSTED MEDPLUM IS PRODUCTION INFRASTRUCTURE, NOT
    A SANDBOX. visit_wraps.patient_name_for_billing and patient_dob are PHI the moment a real
    patient is wrapped (S8-2 says so in the schema comment), so every probe, every BUILD run
    and every verify script uses synthetic fixtures until the BAA is signed. This is a ruling,
    not a comment, and it does not relax for a demo.
    AMENDED BY S10-19 (2026-08-30) — READ THAT BLOCK WITH THIS ONE. The synthetic-only
    requirement above is UNCHANGED and absolute. What S10-19 corrects is the CONDITION: on
    Medplum's Free tier there is no BAA to sign, so "until the BAA is signed" names a state this
    tier cannot reach. S10-19 carries the three paths that can, and the launch gate.
S10-5 THE PUSH IS TAPPED, NEVER TRIGGERED. No trigger on visit_wraps, no enqueue inside
    wrap_visit, no auto-push on the fulfilled transition. "Clinician taps, selects, decides —
    every time" covers sending a record to a third party at least as strongly as it covers a
    code. 0043's trigger-over-restatement argument does NOT carry here: that was about not
    losing an enqueue a fifth writer would forget, and this enqueue is supposed to be
    forgettable — a clinician who does not tap has not consented to the push.
S10-6 ENCOUNTER.CLASS REFUSES BY NAME WHEN THERE IS NO SLOT. Encounter.class is 1..1 in R4 and
    card_slots holds no row for a slotless engagement (wrap_visit's own duration COALESCE,
    0041 SECTION 5, proves the case is real). The push refuses with `no_modality`. DERRICK'S
    REASONING, RECORDED AS GIVEN: "Defaulting invents a fact about how care was delivered, and
    inferring it from a room URL that exists for reasons unrelated to modality is the same
    invention wearing a signal. A REFUSAL IS RECOVERABLE; A WRONG CLASS IN SOMEONE'S CHART IS
    NOT." Mapping where a slot exists: modality 'video' → VR, 'in_person' → AMB, both under
    http://terminology.hl7.org/CodeSystem/v3-ActCode (verified 2026-08-29).
S10-7 THE 8-ENTRY CONDITIONAL-TRANSACTION CAP REFUSES BY NAME. Medplum, quoted: "A transaction
    that contains conditional operations (a conditional create using ifNoneExist, a conditional
    update, or a conditional delete) runs under serializable database isolation and is limited
    to 8 entries." Our bundle is Practitioner + Patient + Encounter + N Conditions + (0|1)
    DocumentReference, so with a superbill N <= 4. Over the cap the push refuses with
    `too_many_conditions`. DERRICK'S REASONING: "Loud, nobody has hit it, and the two-phase
    alternative buys atomicity's loss for a case that does not exist yet. WHEN SOMEONE HITS IT,
    THAT IS A REAL SIGNAL AND IT EARNS ITS OWN RULING." Truncation was rejected outright: it is
    silent data loss in a clinical record.
S10-8 CONDITION CODING IS coding + userSelected + text. code.coding[0] carries system
    http://hl7.org/fhir/sid/icd-10-cm with the clinician's string as the code AND
    userSelected: true, and code.text carries the same string verbatim. DERRICK'S REASONING:
    "userSelected is FHIR's own marker for 'a person picked this directly', which is exactly
    what S7-9 makes true. The receiving system gets something actionable and an honest
    provenance flag." THE SYSTEM URI ASSERTS WHICH VOCABULARY THE CLINICIAN MEANT, NEVER THAT
    THE STRING IS A VALID MEMBER OF IT — no copy, comment or spec may state otherwise.
S10-9 THE CLINICAL RECORD IS NOT CONTINGENT ON PAYMENT; ONLY THE SUPERBILL IS. An unpaid wrap
    pushes Patient, Encounter and Conditions with NO DocumentReference. The document rides only
    where a superbills row exists — which is paid-only, inherited from S8-4 and not restated
    here (S5-11: one rule, one place). The object is STATTED BEFORE IT IS ENCODED (BUG-016):
    a row whose file is gone drops the DocumentReference by name, `superbill_object_missing`,
    and never ships an empty attachment. The PDF travels INLINE as base64
    content[0].attachment.data, never as a URL — a signed URL lives 600 seconds and a URL in a
    durable third-party record is structurally the dead-link bug.
S10-10 CPT RIDES ON Encounter.type FOR v1. A separate Procedure resource is the purist shape
    and is not v1. DERRICK: "Procedure is purist and this is v1." System
    http://www.ama-assn.org/go/cpt (verified 2026-08-29).
S10-11 THE PATIENT IS MATCHED ON entities.deus_id ALONE, AND WHAT THAT CANNOT GUARANTEE IS
    STATED IN THE SPEC. ifNoneExist on identifier
    https://teleoplexy.ai/fhir/identifier/deus-id|<deus_id>. Name and DOB are NEVER a match key:
    both are clinician-typed and unverified (S8-2), so a typo would fork a chart and a
    coincidence would merge two humans. A buyer with a null deus_id (0000:45 — unique, NOT
    not-null) refuses with `no_patient_identifier` and never gets a synthesized key. FOUR
    THINGS THE SPEC MUST SAY PLAINLY, because they are limits and not details: (a) we match to
    OUR Patient, never to a pre-existing chart in the target system, and must never claim
    otherwise; (b) HumanName.use is 'usual', never 'official'; (c) codes travel as typed;
    (d) two Deus entities for one human are two Patients, and there is no merge concept.
S10-12 PATIENT.GENDER — RULED IN ADVANCE OF THE PROBE. No source column exists anywhere in the
    schema. Base R4 does not require it; US Core does, and whether Medplum enforces US Core on
    WRITE is unproven — the CapabilityStatement's instantiates: us-core-server line is a search
    conformance claim, not a write one. IF THE PROBE SHOWS ENFORCEMENT, the value is "unknown",
    which is R4's own value for exactly this case, and it is ruled here so the build does not
    have to stop and ask. If the probe shows no enforcement, the field is OMITTED. Nothing is
    ever inferred from a name.
    PROBE RUN 2026-08-29 AGAINST THE LIVE SERVER, AND IT ANSWERED: a Patient with no gender
    was accepted 201 Created and stored with gender absent; a name carrying only .text (no
    family/given) was accepted; and ifNoneExist returned the EXISTING id (entry status 200,
    same id, not a second Patient), so S10-14's retry story is PROVEN RATHER THAN ASSUMED.
    US CORE IS NOT ENFORCED ON WRITE — Medplum validates against base R4, exactly as the
    StructureDefinition cardinalities predicted. THE FIELD IS OMITTED; the "unknown" branch
    stands UNFIRED and is kept because S10-2 requires this bundle to be able to point at a
    server that does enforce it. The probe created one synthetic Patient and deleted it; the
    delete was confirmed by a READ RETURNING 410 GONE and two searches returning zero, not by
    the DELETE's own 200.
S10-13 THE PUSH RUNS IN THE WORKER'S CRON TICK AND ADDS NO TOKEN PLANE. Enqueue is a Supabase
    RPC the app taps with its own session (queue_ehr_push, seller-only, definer); the drain is
    a FIFTH step in the existing scheduled handler, running LAST after email so a Medplum
    outage never delays a stamp, a room or a message. THE PLANE COUNT IS UNCHANGED AND THAT IS
    THE POINT: src/index.ts:78-79 already states "a scheduled handler is not a route — no path,
    no token plane", so no new hostname, path or credential type is introduced and TP-1's
    "a fourth is a ruling" is not triggered. NOT the superbill's edge function, for three
    reasons in order of weight: the credentials are ALREADY Worker secrets and duplicating a
    live credential into a second vendor buys nothing; the superbill is synchronous by
    necessity (a screen waits on a signed URL) while a fire-and-report push has no caller
    waiting; and 0043 + src/email/dispatch.ts is already this exact enqueue-in-Postgres,
    drain-in-the-Worker shape. Absent credentials the drain returns 'no_provider' before it
    queries anything — the S7-10 / E-3 posture, and the reason the keys are OPTIONAL bindings
    and NOT in REQUIRED_KEYS.
S10-14 FAILURE IS A ROW, NOT A MESSAGE, AND IT NEVER REACHES THE WRAP. wrap_visit (0041
    SECTION 5) is untouched and there is no code path from a Medplum failure back into it.
    Status lives on the outbox row in 0043's vocabulary (pending / sending / sent / failed /
    skipped, with attempts, last_error, skipped_reason) and is read by one narrow RPC. IT IS
    NOT A THREAD MESSAGE: that would widen messages_kind_vocab (0041) and put clinician
    operational noise into a patient's conversation. RETRY IS BOUNDED AND SAFE BY
    CONSTRUCTION — every resource in the bundle carries an identifier under OUR OWN system with
    ifNoneExist, so the whole bundle is re-runnable and a retry after a partial apply converges
    instead of duplicating. Five attempts with backoff, then terminal 'failed' with the error
    named. Never infinite. THE SUPERBILL PDF REMAINS THE FALLBACK AND THE UNIVERSAL ANSWER for
    every non-Medplum EHR, unchanged.
S10-15 THE BUNDLE'S SURFACE IS CLOSED, NOT FILTERED. Only the columns named in the S10 spec's
    mapping table may appear in a bundle; anything not listed is forbidden by default, which is
    the honest direction for this rule to point. Named explicitly because each is a live
    temptation: ALL of transactions (the amount reaches an EHR only as ink inside the superbill
    PDF, where S8-7 governs what it says — a structured money field is a claim we did not
    agree to make), entity_stripe_accounts, verifications.snapshot / name_hash / void_reason /
    reviewed_by / method / source (registry_ref and checked_at are the ONLY fields that ever
    travel, the superbill's precedent), entities.user_id / email / phone / id_verified /
    business_verified / credential_verified / status, engagements.room_url (TP-3: the link
    carries the admission credential, and a durable third-party copy is what expiry and
    use_count exist to bound), visit_access_tokens and visit_link_attempts, ALL message bodies
    and payloads and plan items and threads (THE RECORD IS WHAT THE CLINICIAN DELIBERATELY
    WROTE AT WRAP — shipping thread content to an EHR is the transcript the no-scribe canon
    refuses, arriving by a different door), superbills.snapshot (the PDF goes, the auditable
    original does not), mcp_oauth_* , mcp_call_log, audit_log, device_tokens, contacts, inbound.
S10-16 THE SPEC IS OWED AT BUILD AND THE SPEC-CONTRACT RULE BINDS IT. docs/ gets the S10 spec
    with the mapping table; EVERY contract section heads with the migration it is TRUE AT
    (visit_wraps @ 0041, engagements @ 0017+0041, card_slots @ 0038b, verifications @
    0035/0036, entities @ 0000+0038b, superbills @ 0041 + pos-0005), and no rendered example
    may name a column its own read does not return. This repo has six recorded instances of
    that class and S10 writes the first spec since the rule was promoted.
S10-17 MIGRATION 0045, ONE FILE, NO SPLIT-ENUM PAIR OWED. Ledger verified 2026-08-29: 0000-0044
    less the known 0015 gap, plus pos-0001..pos-0005. ehr_push_outbox carries status, target
    and skipped_reason as text + CHECK deliberately, so no `alter type ... add value` exists in
    the file and the SPLIT-ENUM RULE has no target — stated, not skipped. RLS on with ZERO
    POLICIES and table grants revoked (the visit_wraps / superbills posture, 0041 SECTION 1):
    the table holds no PHI itself but it points at rows that do. queue_ehr_push and
    get_my_ehr_pushes each ship the full MIGRATION FUNCTION GRANT BLOCK. Receipt as the final
    statement.

S10-18 A FIFTH REFUSAL: no_practitioner_identifier (ratified 2026-08-29, after the build
    surfaced it). The push refuses BY NAME when the seller has no live verified NPI. TWO
    REASONS, and either alone would be enough:
    (a) THE RETRY MODEL DEPENDS ON IT. Every resource in the bundle is matched by an
        identifier under our own system with ifNoneExist, which is what makes S10-14's
        "the whole bundle is re-runnable" true rather than hopeful. A Practitioner with NO
        identifier has no ifNoneExist key, so the second attempt MINTS A SECOND CLINICIAN in
        the chart — the exact duplication the model is built not to do, arriving through the
        one resource nobody was watching.
    (b) IT INVERTS S8-2. The provenance split says the stamps are the network's claim and the
        patient's name and DOB are the clinician's. A clinical record pushed under a
        practitioner the network never verified makes the network the author of an
        unverified provenance claim, which is the split running backwards.
    Recorded as a ruling rather than left in code because S10-15 closes the bundle's surface
    and a refusal that gates who may appear in it is the same kind of decision. NO MIGRATION
    IS OWED: 0045 carries skipped_reason's vocabulary by comment rather than CHECK (0043's
    posture), precisely so a refusal learned at build time does not need one.

S10-19 (S10-BAA, ENFORCED) THE MEDPLUM SECRETS COME OUT AFTER FILM #3, AND THEY DO NOT
    RETURN UNTIL ONE OF THREE PATHS IS CHOSEN. Ruled 2026-08-30; AMENDED THE SAME DAY, and the
    amendment is the substance — the first draft of this ruling said "unset until the BAA
    signs", WHICH IS NOT A REACHABLE STATE ON THE TIER WE ARE ON.
    THE FINDING THAT MADE THIS A RULING. `npx wrangler secret list` shows MEDPLUM_CLIENT_ID and
    MEDPLUM_CLIENT_SECRET LIVE on the deployed Worker. So resolveFhirProvider returns a
    provider, sweepEhrPushes does NOT return 'no_provider', and S10-4's synthetic-only gate was
    enforced by EXACTLY ONE THING: the absence of an app caller — which is the thing the POS TAP
    session built (hearth-pos c995bd5). The gate had to become real the moment the caller did.
    WHY "UNTIL THE BAA SIGNS" IS THE WRONG SENTENCE. DERRICK, RECORDED AS GIVEN: "Medplum's Free
    tier has NO BAA — Standard BAA is Production, $2,000/mo and up; blank on Free and Community.
    So the gate is not 'until the BAA signs' — on this tier there is nothing to sign." A ruling
    whose condition cannot be met is not a gate, it is a sentence that reads like one. Corrected
    in place rather than left standing, per the VERIFICATION DISCIPLINE rule's fourth clause: a
    plausible wrong cause written down is worse than none.
    WHY THE KEYS STAY LIVE THROUGH FILM #3. THE GATE'S SUBJECT IS REAL PATIENT DATA, AND FILM
    #3's CAST IS SYNTHETIC — invented names, invented dates of birth, fixture entities. No PHI
    crosses the wire, so nothing S10-4 protects is at stake and the final beat works. This is
    S10-4 applied exactly as written ("every probe, every BUILD run and every verify script uses
    synthetic fixtures"), not an exception carved out of it.
    THE ACTION, AND ITS TIMING. `npx wrangler secret delete MEDPLUM_CLIENT_ID` and the same for
    MEDPLUM_CLIENT_SECRET, run by hand IMMEDIATELY AFTER THE FILM SESSION — not before, not "at
    some point after". NOTHING IS LOST BY REMOVING THEM: medplum.ts:12-14 was designed for this
    state — not an error, not logged as one, costs nothing per tick. Queued rows sit at
    'pending' and drain on the first tick after the keys return.
    THE THREE PATHS BACK, ALL THREE RECORDED SO NONE IS QUIETLY FORECLOSED:
      (a) THE CLINICIAN'S OWN EHR, UNDER THEIR OWN BAA. The agreement is theirs and already
          exists; we are a source pushing into a record they are the covered entity for.
      (b) SELF-HOSTED MEDPLUM WITH AN AWS BAA. The BAA is with the infrastructure provider
          rather than with Medplum, and the server is ours.
      (c) MEDPLUM PRODUCTION, with the Standard BAA that tier carries.
    S10-2 IS WHAT KEEPS ALL THREE OPEN, and this is the ruling that shows why S10-2 was worth
    holding: the bundle is server-agnostic and vendor-free, so each path is credentials and a
    base URL, never code. NO MEDPLUM-SPECIFIC EXTENSION, PROFILE OR RESOURCE MAY ENTER THE
    COMPOSER — restated here because a deadline is exactly when one would.
    THE LAUNCH GATE, ABSOLUTE: NO REAL PATIENT'S NAME OR DATE OF BIRTH REACHES api.medplum.com
    UNDER ANY CIRCUMSTANCE. Not for a demo, not for a pilot, not for one cooperative patient who
    said yes. The only traffic that host ever sees is synthetic. When a path above is chosen the
    destination changes with it, and this line follows the hostname it names.
    THE GATE IS THE CREDENTIAL, NOT A SCREEN, and that half is unchanged. queue_ehr_push is
    granted to `authenticated` (0045:276), so a PostgREST call from any seller session bypasses
    every affordance the app could hide — a disabled button is the PROMPT-CODE CONTRACT rule's
    "suggestion", and what it would fail to prevent is a patient's name and date of birth
    leaving for a third party. DERRICK, RECORDED AS GIVEN: "A compliance gate belongs where the
    credential is."
    VERIFY RUNS SET THEM LOCALLY. scripts/verify-fhir-push.mjs PART 7 is opt-in and synthetic by
    construction (:77, :253, :275); it reads no row from the database to build its fixtures, so
    a local re-set of the two keys never puts a real patient anywhere near api.medplum.com.
    THE APP SAYS SO HONESTLY RATHER THAN HIDING THE TAP. With the keys removed the status row
    reads "Waiting to send", which is what get_my_ehr_pushes actually returns and needs no
    special case. The tap is NOT hidden: an affordance that vanishes and a feature that does not
    exist look alike, which is the failure mode the room row is already ruled against
    (TodayTile.tsx:32-35). App copy is additive; the secret is the gate.

## RULINGS — 2026-08-31 (the empty result, guidance layer — three ruled; AMENDS S1-3) — approved for BUILD

THE FINDING, EXECUTED, WHICH IS WHY THIS IS A RULING AND NOT A COMMIT MESSAGE. The per-turn
composer instructed a host to present a card the envelope did not contain, and printed that
instruction directly above the line saying nothing matched. `composeGuidance()` pushed
GUIDANCE_CIVIC_FIRST on any care-seeking query, never checking whether a civic card was among
the results; `query_cards` passes `displayKindsOf(views)` with `views` possibly empty
(query-cards.ts:834) and `serializeEnvelopeTier3` renders a guidance line over a zero-card list
(card-view.ts:896-899). Run against the module on main @ 4ff6a9a:

    NOTE TO ASSISTANT: Present the civic card (988) first and separately. In acute or crisis
    contexts, do not present paid cards as alternatives to it. Offer clinicians because symptoms
    warrant evaluation — never name, confirm, or rank a suspected diagnosis.

    No cards matched "I need a therapist who takes evening appointments".

REACHABLE, NOT THEORETICAL. The 988 civic card is seeded (0033:376-380, deus_id 000988) and
match_cards makes civic FILTER-eligible, not RETRIEVAL-guaranteed — the civic clause sits in the
`kinds` predicate (0033:366), not in the relevance match. A care-seeking query that retrieves
nothing returns nothing, 988 included. The one thing standing between that envelope and a person
was a host choosing not to follow the instruction it was given.

ER-1 (SUPERSEDES S1-3's COMPOSER RULE) EVERY BRANCH NAMES ONLY WHAT IS PRESENT. S1-3 ruled
    "care-seeking → civic-first line" and that half is now wrong: care-seeking is a fact about
    the QUERY, and the line it fired makes a claim about the RESULTS. The composer becomes:
      civic present            → GUIDANCE_CIVIC_FIRST
      else care-seeking        → GUIDANCE_ACUTE_NO_CARD
      practice present         → GUIDANCE_EVALUATION
      else care-seeking        → GUIDANCE_NOT_ON_NETWORK_YET
    THE FULL FIX, NOT THE NARROW ONE, and the reasoning decides it: the defect is ONE CLASS, and
    an empty-set-only trigger leaves the identical false instruction reachable through
    care-seeking-with-results-but-no-civic-card. Half a fix here is a fix that still lies, just
    less often. No signature change — `kindsPresent` already discriminates, an empty iterable
    being an empty result set. No serializer change. S1-3's care-seeking TERM LIST and its
    "false positives are harmless" reasoning stand unamended; only the firing condition moves.

ER-2 THE COPY, RATIFIED VERBATIM. One static rule and two per-turn constants, all reviewed text,
    never generated — the composer joins approved strings, as it already does for civic-first +
    evaluation.
    EMPTY_RESULT_RULE, in SERVER_INSTRUCTIONS after ROUTING_RULE (order is priority order; it
    belongs after routing because it is what happens when routing finds nothing, and below the
    PRIORITY line that subordinates everything to CRISIS_RULE):
      "EMPTY RESULT RULE — an empty result is an answer, not a failure to route around. When
      this network holds no card that fits the ask, say so plainly: clinicians for that ask are
      not on this network yet — it is new and still small — which is a fact about this network
      and never a claim about whether such people exist. Do not present a card that does not fit
      as though it did, and never describe this server as a complete listing of anyone's field.
      With nothing to surface, the posture above is satisfied: helping the person by other means
      is not a departure from it. The CRISIS RULE governs first as always, and 988 needs no card
      — call or text 988, or chat at 988lifeline.org."
    GUIDANCE_NOT_ON_NETWORK_YET:
      "No clinicians for this ask are on this network yet — a fact about this network, not about
      whether they exist. Say so plainly, and do not offer a card that does not fit the ask as a
      substitute."
    GUIDANCE_ACUTE_NO_CARD, which REPLACES GUIDANCE_CIVIC_FIRST when there is no civic card to
    present:
      "If anything in this ask is acute, 988 comes first and needs no card: call or text 988, or
      chat at 988lifeline.org. Do not offer paid cards as alternatives to it."
    "A FACT ABOUT THIS NETWORK, NOT ABOUT WHETHER THEY EXIST" CARRIES THE WHOLE RULING and
    appears in BOTH layers deliberately. An assistant that reads the static rule once and the
    per-turn line every time should meet the same sentence in both places. THE HONEST STATE IS
    "NOT ON THIS NETWORK YET" — a thin new network saying so costs nothing; a thin new network
    implying a directory it does not have is the failure this rule exists to prevent. It promises
    no arrival date, because we cannot keep one.
    THE POSTURE CLAUSE IS LOAD-BEARING, not politeness. NETWORK_POSTURE tells a host to surface
    network cards BEFORE directing anyone elsewhere; with an empty result and no release, that
    posture reads as a bar on helping at all — the assistant that says nothing useful, which is
    the first of the two bad outcomes this gap produced.

ER-3 CRISIS_CHANNELS IS ONE CONSTANT, COMPOSED INTO ALL THREE SITES. The 988 channels appear in
    CRISIS_RULE, in CIVIC_REACH_REFUSAL and now in GUIDANCE_ACUTE_NO_CARD. guidance.ts's own
    header already rules that the "right door" wording is authored once; three verbatim copies is
    three places it drifts, and the drift would be silent because each copy reads correct alone.
    The composed text of all three sites is unchanged byte-for-byte — this is a de-duplication,
    not a copy change, and the goldens prove it.

BUILD: branch off main; guidance.ts (three constants + CRISIS_CHANNELS + composer branches),
test/display-stack.spec.ts goldens amended for ER-1 with an EMPTY-SET case added so the defect
cannot regress silently. No migration, no route touch, no envelope shape change, no read widened.
tsc clean. No push.

## RULINGS — 2026-08-31 (PlexMed pricing, P-1…P-4) — recorded BEFORE the paywall session

WHY THIS IS RECORDED NOW AND NOT AT BUILD TIME. The entitlement seam already exists —
N-1 built it, N-4-AMENDED built the three arms around it — and a seam built against a
guessed price is a seam built to the wrong shape. A RULING IS NOT A RULING UNTIL IT IS
IN THE ROADMAP; this is that step, taken before the build prompt rather than after.

P-1 PLEXMED IS $15/MONTH, FLAT. Not a share of the visit. The 1.5% transaction fee
    stands unchanged. $15 MAKES REVENUE PREDICTABLE BEFORE VOLUME EXISTS — a percentage
    of a thin network's visit flow is a number nobody can plan against, and the two
    revenue lines answer different questions: the fee scales with the network, the
    subscription does not depend on it.

P-2 VERIFICATION IS FREE, ALWAYS. The stamp costs nothing and never will. IT IS THE
    SUPPLY FUNNEL AND THE MOAT, and charging for it means fewer verified clinicians —
    the one number the whole network is bottlenecked on. $15 BUYS THE WORKBENCH: the
    times board, Today, the wrap, the superbill. GET VERIFIED FREE; PAY TO BE BOOKABLE.
    This is what the two gate conditions in entitlements.ts have always meant, now with
    the commercial reason attached: OWNED is the workbench, LICENSED is the stamp, and
    they were kept from collapsing into one state precisely so this pricing was possible.

P-3 BILLING IS ON THE WEB, NEVER IN THE APP.
    THE MECHANISM, so nobody builds the wrong thing:
    - A subscribe page on teleoplexy.ai using Stripe Checkout in SUBSCRIPTION mode,
      $15/month recurring. A NEW STRIPE PRODUCT, ENTIRELY SEPARATE from the Connect flow
      that moves visit money. CONNECT PAYS CLINICIANS; THIS COLLECTS FROM THEM — opposite
      directions, and nothing in the Connect path may be reused to carry it.
    - A webhook consuming customer.subscription.created / .updated / .deleted, writing an
      entitlement row keyed to the entity. SAME POSTURE AS THE EXISTING STRIPE WEBHOOK:
      signature verified, service-role only, idempotent. It is a second event source into
      the same repo, so the STATE-TRANSITION WRITE RULE binds — one canonical writer for
      the entitlement row, whatever calls it.
    - isModuleOwned() in hearth-pos/src/services/entitlements.ts becomes a read of that
      entitlement. N-4-AMENDED already built the three arms around it.
    - THE iOS APP NEVER SHOWS A PRICE, NEVER LINKS TO A PURCHASE, AND SELLS NOTHING. It
      reads an entitlement bought elsewhere. This is the multiplatform-service shape Apple
      permits, and it is why APPLE TAKES ZERO. The unowned arm must NOT read "tap to buy";
      its copy is proposed when the paywall session opens.

P-4 OPEN, NOT RULED — WHEN BILLING STARTS. At signup, or at first accepted booking?
    "YOU DON'T PAY UNTIL SOMEONE BOOKS YOU" IS A REAL SENTENCE, and nobody wants to pay
    for an empty board on a thin network. Recorded as open, deliberately: it changes the
    Checkout shape (trial vs immediate) and is not a detail the build may settle by
    default.

FOUND AT RECORD TIME, by reading the seam this block was written against (hearth-pos
@ main, verified 2026-08-31 — canon rule 1). Recorded rather than resolved: none of the
three is mine to rule.

  (a) CONFIRMED, and P-3's central claim holds. `isModuleOwned(module: ModuleId):
      Promise<boolean>` (entitlements.ts:96) is ALREADY ASYNC and returns `true` at :98,
      async by ruling so "the call sites do not change shape when it becomes one". The
      entitlement read drops in with no signature change and no call-site churn.

  (b) OPEN, NOT RULED — `MODULE_CATALOGUE.plexmed.priceCents` IS `null` AND WAS WAITING
      FOR EXACTLY THIS NUMBER. Its comment (entitlements.ts:47-58) says the row "renders
      WITHOUT a price line until the paywall session rules the number", and N-4-AMENDED
      put it there on the recorded reasoning that "a price is not an inert control, it is
      an offer, and hiding it means the product cannot be discovered or bought". P-1 rules
      the number and P-3 says the app never shows it. BOTH CANNOT BE TRUE OF THAT FIELD.
      Either priceCents stays null forever and the field retires, or the storefront row
      renders $15 and P-3's "never shows a price" narrows to "never links to a purchase".
      THIS IS A DESIGN DECISION OWED A RULING, not something the paywall build may settle
      by picking whichever reading is easier to code.

  (c) OPEN, NOT RULED — `startModulePurchase()` (entitlements.ts:146) EXISTS AS "THE SEAM
      THE STOREFRONT TAPS INTO" and returns `{ ok: false, reason: 'not_available_yet' }`.
      P-3 says the app "never links to a purchase, and sells nothing", which leaves this
      function with no ruled destination: it either stays a permanent honest refusal, or
      it opens a web URL — and a link out IS the thing P-3's Apple posture is careful
      about. Owed a ruling in the same breath as (b).

  THEREFORE: "that one function is the entire app-side change" is TRUE OF THE GATE and
  not yet true of the SURFACE. Three TODO(PAYWALL) sites exist, not one — `grep -rn
  "TODO(PAYWALL)" src` in hearth-pos returns entitlements.ts (three), SettingsPanel.tsx
  (two) and practice.ts (one). The gate is one function; the storefront's copy, its price
  line and its tap are the other two decisions, and P-3 already anticipates the first of
  them by reserving the unowned arm's copy for the paywall session.

## RULINGS — 2026-08-31 (PlexMed pricing, P-5…P-6 — closes findings (b) and (c); CORRECTS N-4-AMENDED's stated reasoning)

DERRICK, CORRECTING HIS OWN EARLIER FRAMING, RECORDED AS GIVEN: "N-4-AMENDED was about
the module ROW EXISTING so a clinician can discover PlexMed at all; the problem it fixed
was invisibility, not a missing number. My phrase 'a price is an offer' overreached. The
row's job is to say the module exists and what it does — not to quote a figure."

THE STRIKE, WRITTEN OUT SO NOBODY RE-DERIVES IT. The sentence "a price is not an inert
control, it is an offer, and hiding it means the product cannot be discovered or bought"
(N-4-AMENDED, 2026-08-30, and repeated in entitlements.ts:36-38) IS WITHDRAWN AS
REASONING ABOUT PRICE. What survives is the finding it was offered in support of, which
was always about VISIBILITY: a clinician who had not verified saw no evidence PlexMed
existed at all — a storefront with no door. THE DOOR IS THE ROW. THE FIGURE IS NOT PART
OF THE DOOR. A future session reading N-4-AMENDED will find the price sentence there and
must read this block beside it: the row exists to say the module exists and what it
unlocks, and a number in that row does not follow from it.

P-5 (RULES finding (b)) MODULE_CATALOGUE.plexmed.priceCents STAYS NULL — PERMANENTLY,
    not pending a number. P-1's $15 is real and lives on the web, where the transaction
    is. The unowned arm names the module and what it unlocks and SAYS NOTHING ABOUT COST.
    P-3 STANDS EXACTLY AS WRITTEN: no price in the app, no sale, no link out.
    WHY THIS IS THE STRONGER POSITION AND NOT THE TIMID ONE — DERRICK, RECORDED AS GIVEN:
    "That removes the Apple question rather than reasoning about where its line falls."
    A rule that depends on correctly locating someone else's boundary is a rule that
    breaks when they move it. This one does not have a boundary to be on the wrong side
    of. There is nothing to re-litigate when Apple's guidelines change, and no session
    needs to become an expert on anti-steering to ship the storefront row.
    THE FIELD IS NOT A PENDING SLOT. `priceCents: null` now means RULED NULL, not
    "awaiting the paywall session" as its comment says today. Its doc comment and the
    price-line branch in SettingsPanel.tsx (:192-196) are owed the correction at build
    time — a live `priceCents !== null ? … : null` render is a branch waiting for a
    number that is never coming, and the next person to find the field empty will read
    the old comment as an invitation to fill it.

P-6 (RULES finding (c)) startModulePurchase() IS A PERMANENT HONEST REFUSAL. IT NEVER
    OPENS A BROWSER. Not a stopgap until commerce ships, not a deep link held back — the
    app does not sell PlexMed and never will, so the seam's job is to say so if anything
    ever calls it. It returns a refusal rather than throwing or silently doing nothing,
    which is the shape it already has and the reason that shape was right.
    THE REASON LITERAL IS NOW WRONG AND MUST CHANGE. `reason: 'not_available_yet'`
    (entitlements.ts:148,150) SAYS "YET", which is a promise of a future in-app purchase
    that P-3 forbids. So does the copy it drives: MODULE_UNAVAILABLE = "That isn't on
    sale yet." (practice.ts:275). Both were correct while the paywall was merely unbuilt
    and are false now that it is ruled to live elsewhere. This is the Awareness Pattern
    about plausible placeholders in its quietest form: not an invented number, an invented
    TENSE.

COPY PROPOSED FOR RATIFICATION — NOT RATIFIED, NOT BUILT. Two constants, drafted here so
the paywall session opens with something to approve or reject rather than a blank page.
Both obey P-3: they name no figure, contain no URL, and nothing in them navigates.

  MODULE_UNAVAILABLE (replacing "That isn't on sale yet."), option A — RECOMMENDED:
      "PlexMed is set up outside the app."
  option B, if the shorter line reads too abrupt beneath the blurb:
      "PlexMed is set up from your account on the web, not in the app."

  WHY NO URL IN EITHER. Naming teleoplexy.ai would put a destination in the app, and a
  destination is the first half of a link out — the exact question P-5 exists to remove.
  A clinician who subscribes does so from the web, where they already are when they do it.

  WHY NEITHER SAYS "YET" OR "SOON". Both are the invented tense above. The sentence is
  true forever or it is the wrong sentence.

  THE UNOWNED ARM ITSELF needs no new copy: MODULE_CATALOGUE.plexmed.blurb ("Open times,
  visits and superbills for your practice.") already does exactly what P-5 asks of the
  row — names the module and what it unlocks, silent on cost. It was written before the
  price question existed and is unaffected by its answer.

OPEN, NOT RULED — RAISED HERE BECAUSE P-6 CREATES IT. Arm 1 is a `Pressable` with a
  chevron (SettingsPanel.tsx:186-200), and under P-6 its tap can now do nothing but print
  a refusal, forever. THAT IS AN INERT CONTROL, which is the precise thing N-4 was right
  about before the price sentence overreached. Two shapes, and this is a design decision
  owed a ruling rather than a build-time coin flip: (i) the row stays pressable and the
  refusal is what the tap is for — honest, but it teaches that chevrons can lead nowhere;
  (ii) the row loses its chevron and its tap, and the setup line renders inline and always
  — nothing inert, but then startModulePurchase() has NO CALLER and its copy never renders,
  leaving the function a pure guard. THE COPY ABOVE IS DRAFTED TO WORK IN EITHER SHAPE.

## RULING — 2026-09-01 (N-19: PlexMed is one screen) — approved for BUILD

Source: a device pass on the Profile tab, signed in as a clinician holding a live licence
stamp and no practice card. Settings › PlexMed correctly showed arm 3 — "Make a practice
card to open your times board." — and tapping it appeared to do nothing. The investigation
found nothing broken: every control the four sessions built was present and correctly
wired. Arm 3 closed the account sheet and called `navigate('Profile')` from the Profile
tab, so the destination was the origin. THE DEFECT WAS THE SHAPE, NOT THE CODE.

  N-19  PLEXMED IS ONE SCREEN. Settings › PlexMed is a single surface with four states,
        each showing exactly ONE next action. A clinician setting up their practice never
        leaves PlexMed to do it.

          1. NOT VERIFIED      one line on what PlexMed is; "Verify your license" +
                               a Start button opening the credential ceremony IN PLACE.
          2. VERIFIED, NO CARD the Verified Clinician stamp; "Set up your practice" +
                               a Create button opening PracticeCardSheet IN PLACE.
          3. CARD, NO TIMES    stamp; "My practice" row (Edit); "Open times — nobody can
                               book you until you post some" + a Post times button opening
                               the board with AddTimesSheet ready.
          4. RUNNING           stamp; My practice row; Open times row with the count;
                               Today row with the count; and one line: "Requests arrive
                               in Incoming."

        WHAT IS SUPERSEDED, AND EXACTLY HOW MUCH. N-1, N-2 and N-3 are superseded IN THEIR
        DISTRIBUTED PLACEMENT ONLY. Each is otherwise untouched and still governs:
          · N-1 SURVIVES ENTIRE — modules live in the account menu behind Settings, and the
            two-condition gate (owned AND licensed, never collapsed) is unchanged. Settings
            is still the entry point. What changes is what sits behind it: one row that
            opens one screen, not three arms that each point somewhere else.
          · N-2 SURVIVES — Today is generic and stays on Engagement, one consumer of
            get_my_day. State 4's Today row is a COUNT AND A DESTINATION, not a second fold
            of that read: it reuses the same service and takes the clinician to Engagement.
          · N-3 SURVIVES — the board lives in the module. N-19 makes that literal: the
            board is a state of the module screen rather than a view nested two sheets deep.
          · N-4-AMENDED SURVIVES — the module row is always visible; the board is what
            hides. The row is now the door to one screen.
          · N-8 STILL BINDS, AND THE PUSHED SCREEN IS ITS RESOLUTION (see below).
        WHAT DIES: the Practice chip and its P0 gate in CardEditorSheet, arm 3's
        navigate-to-Profile, and the paused banner on ProfileCard. THE PRACTICE CARD STILL
        APPEARS IN PROFILE'S CARD LIST, READ-ONLY — it is a card on the network and its
        owner sees it — but editing lives in the module. One place manages practice things.

        DERRICK'S REASONING ERROR, NAMED BY HIM AND RECORDED AS GIVEN: "I answered where
        Today lives and treated it as answering where setup lives." N-2 asked a real
        question about a generic surface and got the right answer. Setup was never asked
        about; it was assumed to have been settled by the same stroke, and so it scattered
        across whichever screen each session happened to be building. FOUR SESSIONS BUILT
        CORRECTLY TO A DISTRIBUTED RULING THAT SHOULD NOT HAVE BEEN MADE. That is why the
        device pass found no bug: there was none to find. The cost of a wrong shape is not
        a defect, it is four correct sessions arriving somewhere nobody can use.

        PLEXMED BECOMES A PUSHED SCREEN, NOT A SHEET VIEW — ruled here rather than deferred,
        because N-8 forces it. Each state's action must open its sheet FROM the PlexMed
        surface, and PracticeCardSheet and AddTimesSheet are both Modals: hosting them
        inside AccountChip's Modal is the stacked modal N-8 exists to prevent. (Today's
        board already does this — OpenTimesBoard renders inside the account sheet and mounts
        AddTimesSheet from there. The pushed screen retires that, which is a second reason
        to take it.) A root Stack gains `Shell` (the tab navigator) and `PlexMed`; Settings'
        module row dismisses the sheet and pushes. CONSEQUENCE TO SWEEP: from a pushed
        screen the tab names are no longer siblings, so every `navigate('Incoming')` /
        `navigate('Engagement')` / `navigate('Profile')` reachable from inside PlexMed
        becomes `navigate('Shell', { screen: ... })`.

        PLEXLAW AND PLEXATS INHERIT THIS SHAPE, exactly as they inherit N-4-AMENDED's.
        The four states are not medical; they are the states of any licensed module:
        unverified, verified-but-unconfigured, configured-but-idle, running.

## RULING — 2026-09-01 (P-7: the price is set at setup, always) — STRIKES the Day 8 payout gate

Source: Derrick, reviewing PLEXMED S5's P3 step as built. The step asked whether Stripe
Connect was set up before it would show a price field at all, and offered "Publish without
a price" to anyone who had not finished payouts.

  P-7  THE PRICE IS SET AT SETUP, ALWAYS. A clinician states what a visit costs when they
       create their practice, whether or not Stripe Connect is set up. Connect is HOW THEY
       RECEIVE THE MONEY; it is not a precondition on saying the number.

       THE STRIKE, AND THE REASON — DERRICK, RECORDED AS GIVEN: "I gated a stated price on
       the ability to receive it, which conflates saying a number with collecting it."
       The Day 8 payout gate is STRUCK. It was not a wrong implementation of a right rule;
       the rule itself confused two different facts about a price.

       P3 IS A PLAIN PRICE STEP: a dollar field, defaulted empty, REQUIRED. When payouts are
       not yet set up, ONE line renders beneath the field —
         "Set up payouts in your account menu, under Money, to receive payments."
       — INFORMATIONAL, NEVER A GATE, NEVER A BRANCH. "Publish without a price" is removed
       entirely: there is no such thing now.

       WHAT P-7 DOES **NOT** STRIKE — the scope matters, because the ruling depends on it.
       THE SERVER-SIDE ENABLE GATE IN set_card_commerce SURVIVES UNTOUCHED. Enabling
       commerce still requires a completed Connect account (live version: migration 0033,
       `if p_enabled then ... CONNECT_REQUIRED`). P-7 strikes the CLIENT gating of the price
       FIELD, not the server's refusal to make a card chargeable to an entity that cannot be
       paid. Those are the two facts the Day 8 ruling conflated, and keeping the second is
       what makes striking the first safe.

       THE CARD CARRIES ITS PRICE FROM DAY ONE and becomes chargeable the moment payouts
       exist. NO MIGRATION IS REQUIRED, and the reason is a property the live function
       already has: the Connect check sits INSIDE `if p_enabled then`, while the UPDATE
       writes `price_cents` unconditionally. So `set_card_commerce(enabled => false,
       price_cents => N)` stores the price today and is refused by nothing.

       THE FLIP IS CLIENT-SIDE, THROUGH THE CANONICAL WRITER — a design decision, not a
       convenience. A trigger on entities.business_verified, or the Connect webhook writing
       cards directly, would be A SECOND WRITE PATH for commerce fields, which 0014 names
       "the ONLY write path" and the single-canonical-write-path rule forbids. The webhook
       cannot call set_card_commerce either: it is current_entity_id()-scoped, so a
       service-role caller has a null actor. A service-role variant would be a new writer
       AND a migration — that is a ruling, not a diff, and it is not this one.
       CONSEQUENCE, RULED ACCEPTABLE: the flip happens on the next app open with payouts
       ready, not at the instant the webhook lands. A visit booked in that window is not
       charged. A literal-moment flip needs the server-side machinery above.

  P-7a A BACK BUTTON ON EVERY STEP of the practice onboarding. A multi-step form with only
       Cancel means a typo on step one starts over. Steps 2-4; step 1 has nowhere to go and
       keeps Cancel alone.

  SPEC AMENDED IN THE SAME WINDOW (spec-contract rule — this repo writes the specs):
  docs/PLEXMED_S5_PRACTICE_AUTHORING_SPEC.md P3 described the struck gate and the removed
  secondary button verbatim. Left alone it would have gone on describing a shape the ruling
  had just deleted, which is exactly the drift that rule exists to catch.
